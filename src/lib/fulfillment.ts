// Merkle tree builder + root poster for cross-chain settlement proving
// Tracks CTF fulfillments, builds trees, posts roots to PolymarketEscrow on Tempo
// Verifies Polygon transfers via Alchemy MPP before appending to tree

import { MerkleTree } from "merkletreejs";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  encodeFunctionData,
  parseAbi,
  getAddress,
  decodeAbiParameters,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempo, USDC } from "./tempo";
import { CTF_ADDRESS } from "./polymarket";

// --- Escrow ABI (subset needed by off-chain code) ---

export const ESCROW_ABI = parseAbi([
  "function orders(bytes32) view returns (address user, address solver, uint256 amount, bytes32 tokenId, bytes32 recipientHash, uint256 deadline, bool settled)",
  "function commitRoot(uint256 batchIndex, bytes32 root) external",
  "function claimWithProof(bytes32 orderId, uint256 batchIndex, uint256 position, bytes32 polygonTxHash, bytes proof) external",
  "function refund(bytes32 orderId) external",
  "function deposit(bytes32 orderId, address solver, uint256 amount, bytes32 tokenId, bytes32 recipientHash, uint256 deadline) external",
  "function roots(uint256) view returns (bytes32)",
  "function nextBatchIndex() view returns (uint256)",
]);

export function getEscrowAddress(): `0x${string}` {
  const addr = process.env.ESCROW_ADDRESS;
  if (!addr) throw new Error("ESCROW_ADDRESS not set");
  return addr as `0x${string}`;
}

// --- Alchemy MPP client (verifies Polygon txs via MPP-gated RPC) ---

const ALCHEMY_MPP_URL = "https://mpp.alchemy.com/polygon-mainnet/v2";

// ERC1155 TransferSingle(address,address,address,uint256,uint256)
const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

let _mppClient: { fetch: typeof globalThis.fetch } | null = null;

async function getMppClient() {
  if (_mppClient) return _mppClient;

  const { Mppx, tempo: tempoMethod } = await import("mppx/client");

  const pk = process.env.RELAYER_PRIVATE_KEY as Hex;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk);

  _mppClient = Mppx.create({
    methods: [tempoMethod({ account, maxDeposit: "1" })],
    polyfill: false,
  });
  return _mppClient;
}

/**
 * Verifies a CTF transfer on Polygon.
 * Tries Alchemy MPP first, falls back to direct Polygon RPC.
 * Fetches the tx receipt, checks for TransferSingle event on the CTF contract,
 * and validates recipient + tokenId.
 */
export async function verifyPolygonTransfer(
  polygonTxHash: Hex,
  expectedRecipient: `0x${string}`,
  expectedTokenId: string
): Promise<{ verified: true; amount: bigint }> {
  let receipt: any = null;

  // Try Alchemy MPP first, fall back to direct RPC
  // TODO: Debug Alchemy MPP SIWE auth -- returns 401 instead of 402
  try {
    const client = await getMppClient();
    const res = await client.fetch(ALCHEMY_MPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [polygonTxHash],
        id: 1,
      }),
    });
    const json = await res.json();
    receipt = json.result;
    if (receipt) console.log("[alchemy-mpp] Verified via Alchemy MPP");
  } catch {
    // Alchemy MPP unavailable, fall back
  }

  if (!receipt) {
    const polygonRpc = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
    const res = await fetch(polygonRpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [polygonTxHash],
        id: 1,
      }),
    });
    const json = await res.json();
    receipt = json.result;
    if (receipt) console.log("[verify] Verified via Polygon RPC (Alchemy MPP fallback)");
  }
  if (!receipt) throw new Error("Transaction not found on Polygon");
  if (receipt.status !== "0x1") throw new Error("Transaction reverted");

  // Find TransferSingle log from CTF contract
  const ctfLower = CTF_ADDRESS.toLowerCase();
  const transferLog = receipt.logs.find(
    (log: any) =>
      log.address.toLowerCase() === ctfLower &&
      log.topics[0] === TRANSFER_SINGLE_TOPIC
  );

  if (!transferLog) {
    throw new Error("No CTF TransferSingle event in transaction");
  }

  // Verify recipient (topic[3] = to, padded address)
  const to = getAddress("0x" + transferLog.topics[3].slice(26));
  if (to.toLowerCase() !== expectedRecipient.toLowerCase()) {
    throw new Error(
      `Transfer to ${to}, expected ${expectedRecipient}`
    );
  }

  // Verify tokenId from log data (first 32 bytes = id, next 32 = value)
  const [id, value] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }],
    transferLog.data as Hex
  );
  if (id.toString() !== expectedTokenId) {
    throw new Error(
      `Transferred token ${id}, expected ${expectedTokenId}`
    );
  }

  console.log(
    `[alchemy-mpp] Verified: ${value} of token ${expectedTokenId} transferred to ${to} in tx ${polygonTxHash}`
  );

  return { verified: true, amount: value };
}

// --- In-memory fulfillment state ---

interface Fulfillment {
  orderId: Hex;
  polygonTxHash: Hex;
}

interface Batch {
  batchIndex: number;
  root: Hex;
  fulfillments: Fulfillment[];
  tree: MerkleTree;
}

const pending: Fulfillment[] = [];
const batches = new Map<number, Batch>();
const orderBatch = new Map<string, { batchIndex: number; position: number }>();

// --- Merkle tree helpers ---

function hashPair(data: Buffer): Buffer {
  const hex = keccak256(("0x" + data.toString("hex")) as Hex);
  return Buffer.from(hex.slice(2), "hex");
}

export function computeLeaf(orderId: Hex, polygonTxHash: Hex): Buffer {
  // Matches Solidity: keccak256(abi.encodePacked(keccak256(abi.encodePacked(orderId, polygonTxHash)), orderId))
  const resultHash = keccak256(
    encodePacked(["bytes32", "bytes32"], [orderId, polygonTxHash])
  );
  const leaf = keccak256(
    encodePacked(["bytes32", "bytes32"], [resultHash, orderId])
  );
  return Buffer.from(leaf.slice(2), "hex");
}

// --- Core functions ---

export function registerFulfillment(orderId: Hex, polygonTxHash: Hex) {
  pending.push({ orderId, polygonTxHash });
}

export async function buildAndPostRoot(): Promise<Batch | null> {
  if (pending.length === 0) return null;

  const fulfillments = [...pending];
  pending.length = 0;

  const leaves = fulfillments.map((f) =>
    computeLeaf(f.orderId, f.polygonTxHash)
  );
  const tree = new MerkleTree(leaves, hashPair, { sortPairs: false });
  const root = ("0x" + tree.getRoot().toString("hex")) as Hex;

  // Read next batch index via viem (read-only works fine)
  const publicClient = createPublicClient({ chain: tempo, transport: http() });
  const nextIdx = await publicClient.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "nextBatchIndex",
  });
  const batchIndex = Number(nextIdx);

  // Post root to escrow via viem Tempo transaction (feeToken for gas)
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");

  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: tempo,
    transport: http(),
  });

  console.log(`[fulfillment] Posting root: batch=${batchIndex} root=${root}`);
  const commitTxHash = await walletClient.writeContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "commitRoot",
    args: [BigInt(batchIndex), root as `0x${string}`],
    feeToken: USDC,
  } as any); // feeToken is a Tempo-specific field
  console.log(`[fulfillment] commitRoot tx: ${commitTxHash}`);

  // Wait for root to be confirmed before claiming
  await publicClient.waitForTransactionReceipt({ hash: commitTxHash });
  console.log(`[fulfillment] commitRoot confirmed`);

  // Auto-claim for each fulfillment
  for (const f of fulfillments) {
    const leaf = computeLeaf(f.orderId, f.polygonTxHash);
    const idx = fulfillments.indexOf(f);
    const proofElements = tree.getProof(leaf, idx);
    const proofHex = ("0x" + proofElements.map((p: any) => p.data.toString("hex")).join("")) as Hex;

    try {
      const claimTxHash = await walletClient.writeContract({
        address: getEscrowAddress(),
        abi: ESCROW_ABI,
        functionName: "claimWithProof",
        args: [f.orderId as `0x${string}`, BigInt(batchIndex), BigInt(idx), f.polygonTxHash as `0x${string}`, proofHex as `0x${string}`],
        feeToken: USDC,
      } as any);
      console.log(`[fulfillment] Claimed order ${f.orderId}: ${claimTxHash}`);
    } catch (err: any) {
      console.error(`[fulfillment] Claim failed for ${f.orderId}: ${err.message}`);
    }
  }

  const batch: Batch = { batchIndex, root, fulfillments, tree };
  batches.set(batchIndex, batch);
  fulfillments.forEach((f, i) => {
    orderBatch.set(f.orderId, { batchIndex, position: i });
  });

  console.log(
    `[fulfillment] Batch ${batchIndex}: ${fulfillments.length} fulfillments, root=${root}`
  );
  return batch;
}

export function getProofData(
  orderId: string
): {
  batchIndex: number;
  position: number;
  proof: Hex;
  polygonTxHash: Hex;
  root: Hex;
} | null {
  const mapping = orderBatch.get(orderId);
  if (!mapping) return null;

  const batch = batches.get(mapping.batchIndex);
  if (!batch) return null;

  const f = batch.fulfillments[mapping.position];
  const leaf = computeLeaf(f.orderId, f.polygonTxHash);
  const proofElements = batch.tree.getProof(leaf, mapping.position);
  const proofHex = (
    "0x" + proofElements.map((p: any) => p.data.toString("hex")).join("")
  ) as Hex;

  return {
    batchIndex: mapping.batchIndex,
    position: mapping.position,
    proof: proofHex,
    polygonTxHash: f.polygonTxHash,
    root: batch.root,
  };
}
