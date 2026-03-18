// Polymarket integration - recycled from Amplifi's PolymarketClient + CLOBKeyService

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
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;          // JSON string: '["Yes", "No"]'
  outcomePrices: string;     // JSON string: '["0.55", "0.45"]'
  clobTokenIds: string;      // JSON string: '["123...", "456..."]'
  volume: string;
  liquidity: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  orderPriceMinTickSize: number;
  orderMinSize: number;
}

export interface ParsedMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: string;
  minTickSize: number;
  minOrderSize: number;
}

function parseMarket(m: PolymarketMarket): ParsedMarket {
  const tokenIds = JSON.parse(m.clobTokenIds) as string[];
  const prices = JSON.parse(m.outcomePrices) as string[];
  return {
    id: m.id,
    question: m.question,
    conditionId: m.conditionId,
    slug: m.slug,
    yesTokenId: tokenIds[0] ?? "",
    noTokenId: tokenIds[1] ?? "",
    yesPrice: parseFloat(prices[0] ?? "0"),
    noPrice: parseFloat(prices[1] ?? "0"),
    volume: parseFloat(m.volume),
    liquidity: parseFloat(m.liquidity),
    endDate: m.endDate,
    minTickSize: m.orderPriceMinTickSize,
    minOrderSize: m.orderMinSize,
  };
}

export async function searchMarkets(query: string, limit = 10): Promise<ParsedMarket[]> {
  const params = new URLSearchParams({ _limit: String(limit), active: "true", closed: "false" });
  const res = await fetch(`${GAMMA_URL}/markets?${params}`);
  if (!res.ok) throw new Error(`Gamma search failed: ${res.status}`);
  const raw: PolymarketMarket[] = await res.json();
  const parsed = raw.filter((m) => m.clobTokenIds && m.clobTokenIds !== "[]").map(parseMarket);
  if (!query) return parsed;
  const q = query.toLowerCase();
  return parsed.filter((m) => m.question.toLowerCase().includes(q));
}

export async function getMarket(conditionId: string): Promise<ParsedMarket> {
  const res = await fetch(`${GAMMA_URL}/markets/${conditionId}`);
  if (!res.ok) throw new Error(`Gamma market fetch failed: ${res.status}`);
  return parseMarket(await res.json());
}

// --- CLOB Client (auth + orders) ---

let _clobClient: ClobClient | null = null;

function getSolverWalletClient() {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("SOLVER_POLYGON_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpc()),
  });
}

async function getClobClient(): Promise<ClobClient> {
  if (_clobClient) return _clobClient;

  const signer = getSolverWalletClient();

  // signatureType=0 = EOA (Amplifi uses 2 for Safe)
  const tempClient = new ClobClient(CLOB_URL, POLYGON_CHAIN_ID, signer as any);
  const creds = await tempClient.createOrDeriveApiKey();

  _clobClient = new ClobClient(CLOB_URL, POLYGON_CHAIN_ID, signer as any, {
    key: creds.key,
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

function getPolygonRpc() {
  return process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
}

export async function transferCTF(
  tokenId: string,
  amount: bigint,
  recipientAddress: `0x${string}`
): Promise<`0x${string}`> {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("SOLVER_POLYGON_PRIVATE_KEY not set");

  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpc()),
  });

  return walletClient.writeContract({
    address: CTF_ADDRESS,
    abi: CTF_ABI,
    functionName: "safeTransferFrom",
    args: [account.address, recipientAddress, BigInt(tokenId), amount, "0x"],
  });
}

export async function getCTFBalance(tokenId: string): Promise<bigint> {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const client = createPublicClient({ chain: polygon, transport: http(getPolygonRpc()) });

  return client.readContract({
    address: CTF_ADDRESS,
    abi: CTF_ABI,
    functionName: "balanceOf",
    args: [account.address, BigInt(tokenId)],
  });
}
