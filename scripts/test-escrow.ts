// End-to-end escrow test: deposit → solve → prove → claim
// Usage: bun run scripts/test-escrow.ts
//
// Requires: tempo-cast in ~/.tempo/bin/, tempo request CLI, Next.js dev server running
//
// Required env vars:
//   ESCROW_ADDRESS, USER_TEMPO_PRIVATE_KEY, RELAYER_PRIVATE_KEY,
//   SOLVER_POLYGON_PRIVATE_KEY, TEMPO_RPC_URL

import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { execSync } from "child_process";

const tempo = {
  id: 4217,
  name: "Tempo" as const,
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.TEMPO_RPC_URL ?? "https://rpc.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
} as const;

const USDC_TEMPO = "0x20c000000000000000000000b9537d11c60e8b50";
const ESCROW = process.env.ESCROW_ADDRESS!;
const USDC_DECIMALS = 6;
const RPC = process.env.TEMPO_RPC_URL ?? "https://rpc.tempo.xyz";
const HOME = process.env.HOME!;
const TEMPO_BIN = `${HOME}/.tempo/bin`;

// User: passkey wallet + scoped access key (pulled from tempo wallet CLI)
function getTempoWallet(): { key: string; wallet: string } {
  const raw = execSync(`${TEMPO_BIN}/tempo wallet whoami -j`, { encoding: "utf-8" });
  const data = JSON.parse(raw);
  return { key: data.key.key, wallet: data.wallet };
}
const tempoWallet = getTempoWallet();
const USER_ACCESS_KEY = process.env.USER_TEMPO_PRIVATE_KEY ?? tempoWallet.key;
const USER_WALLET = tempoWallet.wallet;
const userAccount = privateKeyToAccount(USER_ACCESS_KEY as Hex);

// Solver: raw EOA
const SOLVER_KEY = process.env.RELAYER_PRIVATE_KEY!;
const solverAccount = privateKeyToAccount(SOLVER_KEY as Hex);

const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const ESCROW_ABI = parseAbi([
  "function orders(bytes32) view returns (address user, address solver, uint256 amount, bytes32 tokenId, bytes32 recipientHash, uint256 deadline, bool settled)",
]);

function extractTxHash(castOutput: string): string | null {
  const match = castOutput.match(/transactionHash\s+(0x[a-fA-F0-9]{64})/);
  return match ? match[1] : null;
}

function castSendAsUser(to: string, sig: string, ...args: string[]): string {
  const cmd = `${TEMPO_BIN}/tempo-cast send --rpc-url ${RPC} --tempo.access-key ${USER_ACCESS_KEY} --tempo.root-account ${USER_WALLET} --tempo.fee-token ${USDC_TEMPO} ${to} "${sig}" ${args.join(" ")}`;
  const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim();
  const txHash = extractTxHash(output);
  if (txHash) console.log(`    tx: https://explore.tempo.xyz/tx/${txHash}`);
  return output;
}

function castSendAsSolver(to: string, sig: string, ...args: string[]): string {
  const cmd = `${TEMPO_BIN}/tempo-cast send --rpc-url ${RPC} --private-key ${SOLVER_KEY} --tempo.fee-token ${USDC_TEMPO} ${to} "${sig}" ${args.join(" ")}`;
  const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim();
  const txHash = extractTxHash(output);
  if (txHash) console.log(`    tx: https://explore.tempo.xyz/tx/${txHash}`);
  return output;
}

async function main() {
  if (!ESCROW || !USER_ACCESS_KEY || !SOLVER_KEY) {
    console.error("Set ESCROW_ADDRESS, USER_TEMPO_PRIVATE_KEY, RELAYER_PRIVATE_KEY");
    process.exit(1);
  }

  const publicClient = createPublicClient({ chain: tempo, transport: http() });
  const apiUrl = process.env.API_URL ?? "http://localhost:3000";

  // Warm up all API routes so Next.js dev mode compiles them before we need them
  // (prevents in-memory state from being wiped by lazy compilation)
  await fetch(`${apiUrl}/api/proof?orderId=0x00`).catch(() => {});
  await fetch(`${apiUrl}/api/buy-position`, { method: "POST" }).catch(() => {});

  // --- Config ---
  const testAmountUsd = 1;
  const amount = BigInt(testAmountUsd * 10 ** USDC_DECIMALS);
  const recipientPolygon = solverAccount.address; // In real use, user's Polygon address
  // BitBoy convicted? - active market, cheap YES price (~$0.11)
  const tokenId = process.env.TEST_TOKEN_ID ?? "75467129615908319583031474642658885479135630431889036121812713428992454630178";
  const tokenIdBytes32 = ("0x" + BigInt(tokenId).toString(16).padStart(64, "0")) as Hex;
  const recipientHash = keccak256(encodePacked(["address"], [recipientPolygon]));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const orderId = keccak256(encodePacked(["string"], [`test-escrow-${Date.now()}`]));

  console.log("=== Escrow E2E Test ===");
  console.log(`User:      ${USER_WALLET} (passkey wallet, key: ${userAccount.address})`);
  console.log(`Solver:    ${solverAccount.address}`);
  console.log(`Escrow:    ${ESCROW}`);
  console.log(`OrderId:   ${orderId}`);
  console.log(`Amount:    $${testAmountUsd} (position only, service fee via MPP)`);
  console.log();

  // Step 1: Check USDC balance
  const balance = await publicClient.readContract({
    address: USDC_TEMPO as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [USER_WALLET as `0x${string}`],
  });
  console.log(`[1] User USDC balance: ${Number(balance) / 10 ** USDC_DECIMALS}`);
  if (balance < amount) {
    console.error("Insufficient USDC balance");
    process.exit(1);
  }

  // Step 2: Approve USDC to escrow (via tempo-cast with access key)
  console.log("[2] Approving USDC to escrow...");
  castSendAsUser(USDC_TEMPO, "approve(address,uint256)", ESCROW, amount.toString());

  // Step 3: Deposit into escrow
  console.log("[3] Depositing into escrow...");
  castSendAsUser(
    ESCROW,
    "deposit(bytes32,address,uint256,bytes32,bytes32,uint256)",
    orderId,
    solverAccount.address,
    amount.toString(),
    tokenIdBytes32,
    recipientHash,
    deadline.toString()
  );

  // Step 4: Verify deposit on-chain
  const order = await publicClient.readContract({
    address: ESCROW as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: "orders",
    args: [orderId],
  });
  console.log(`[4] Order on-chain: user=${order[0]}, amount=${order[2]}, settled=${order[6]}`);

  // Step 5: Call buy-position API via tempo request (MPP service fee)
  console.log("[5] Calling solver (pays $0.50 service fee via MPP, solver fills on Polygon)...");
  const payload = JSON.stringify({ order_id: orderId, recipient_polygon: recipientPolygon });
  let buyData: any;
  try {
    const raw = execSync(
      `${TEMPO_BIN}/tempo request -X POST --json '${payload}' ${apiUrl}/api/buy-position`,
      { encoding: "utf-8", timeout: 60000 }
    );
    buyData = JSON.parse(raw);
    console.log(`    CTF transfer: https://polygonscan.com/tx/${buyData.transfer.polygon_tx}`);
    console.log(`    shares: ${buyData.fill.shares}`);
    console.log(`    proof: ${buyData.proof_available}`);
  } catch (err: any) {
    console.error("Buy-position failed:", err.stderr || err.message);
    process.exit(1);
  }

  // Step 6: Get proof
  console.log("[6] Fetching proof...");
  const proofRes = await fetch(`${apiUrl}/api/proof?orderId=${orderId}`);
  const proofData: any = await proofRes.json();
  console.log(`    proof:`, JSON.stringify(proofData, null, 2));

  if (!proofRes.ok) {
    console.error("Proof not available");
    process.exit(1);
  }

  // Step 7: Claim with proof (solver calls escrow via tempo-cast)
  console.log("[7] Claiming with proof on escrow...");
  castSendAsSolver(
    ESCROW,
    "claimWithProof(bytes32,uint256,uint256,bytes32,bytes)",
    orderId,
    proofData.batchIndex.toString(),
    proofData.position.toString(),
    proofData.polygonTxHash,
    proofData.proof
  );

  // Step 8: Verify settlement
  const orderAfter = await publicClient.readContract({
    address: ESCROW as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: "orders",
    args: [orderId],
  });
  console.log(`[8] Order settled: ${orderAfter[6]}`);

  const solverBalance = await publicClient.readContract({
    address: USDC_TEMPO as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [solverAccount.address],
  });
  console.log(`    Solver USDC balance: ${Number(solverBalance) / 10 ** USDC_DECIMALS}`);

  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
