// Polymarket integration - recycled from Amplifi's PolymarketClient + CLOBKeyService
// Uses @polymarket/clob-client for auth, EIP-712 signing, and order placement

import { ClobClient } from "@polymarket/clob-client";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

// --- Constants ---

const CLOB_URL = "https://clob.polymarket.com";
const GAMMA_URL = "https://gamma-api.polymarket.com";
const POLYGON_CHAIN_ID = 137;

export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
export const USDC_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

const CTF_ABI = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

// --- Gamma API (public, no auth) ---

export interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  question: string;
  tokens: { token_id: string; outcome: string; price: string }[];
  active: boolean;
  closed: boolean;
  volume: string;
  end_date_iso: string;
}

export async function searchMarkets(query: string, limit = 10): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams({ _limit: String(limit), active: "true", closed: "false" });
  const res = await fetch(`${GAMMA_URL}/markets?${params}`);
  if (!res.ok) throw new Error(`Gamma search failed: ${res.status}`);
  const markets: PolymarketMarket[] = await res.json();
  if (!query) return markets;
  return markets.filter((m) => m.question.toLowerCase().includes(query.toLowerCase()));
}

export async function getMarket(conditionId: string): Promise<PolymarketMarket> {
  const res = await fetch(`${GAMMA_URL}/markets/${conditionId}`);
  if (!res.ok) throw new Error(`Gamma market fetch failed: ${res.status}`);
  return res.json();
}

// --- CLOB Client (auth + orders) ---
// Pattern from Amplifi's CLOBKeyService + PolymarketClient

let _clobClient: ClobClient | null = null;

async function getClobClient(): Promise<ClobClient> {
  if (_clobClient) return _clobClient;

  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY;
  if (!pk) throw new Error("SOLVER_POLYGON_PRIVATE_KEY not set");

  // Step 1: Create client without credentials to derive API key
  // signatureType=0 = EOA (Amplifi uses 2 for Safe, we use 0 for simplicity)
  const tempClient = new ClobClient(CLOB_URL, POLYGON_CHAIN_ID, pk as `0x${string}`);

  // Step 2: Derive API credentials from private key signature
  const creds = await tempClient.createOrDeriveApiKey();

  // Step 3: Create authenticated client
  _clobClient = new ClobClient(CLOB_URL, POLYGON_CHAIN_ID, pk as `0x${string}`, {
    key: creds.apiKey,
    secret: creds.secret,
    passphrase: creds.passphrase,
  });

  return _clobClient;
}

export interface SolverBuyResult {
  orderId: string;
  status: string;
  avgPrice: number;
  filledSize: number;
  tokenId: string;
}

export async function buyShares(tokenId: string, usdcAmount: number): Promise<SolverBuyResult> {
  const client = await getClobClient();

  // FAK (Fill-And-Kill) market order, same pattern as Amplifi
  const order = await client.createAndPostMarketOrder({
    tokenID: tokenId,
    amount: usdcAmount,
    side: "BUY",
  });

  return {
    orderId: order.orderID ?? "unknown",
    status: order.status ?? "UNKNOWN",
    avgPrice: parseFloat(order.averagePrice ?? "0"),
    filledSize: parseFloat(order.filledSize ?? "0"),
    tokenId,
  };
}

// --- CTF Transfer (ERC1155 on Polygon) ---

export async function transferCTF(
  tokenId: string,
  amount: bigint,
  recipientAddress: `0x${string}`
): Promise<`0x${string}`> {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("SOLVER_POLYGON_PRIVATE_KEY not set");

  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";
  const account = privateKeyToAccount(pk);

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.writeContract({
    address: CTF_ADDRESS,
    abi: CTF_ABI,
    functionName: "safeTransferFrom",
    args: [account.address, recipientAddress, BigInt(tokenId), amount, "0x"],
  });

  return hash;
}

export async function getCTFBalance(tokenId: string): Promise<bigint> {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";

  const client = createPublicClient({ chain: polygon, transport: http(rpcUrl) });

  return client.readContract({
    address: CTF_ADDRESS,
    abi: CTF_ABI,
    functionName: "balanceOf",
    args: [account.address, BigInt(tokenId)],
  });
}
