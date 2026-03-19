// POST /api/buy-position
// MPP-gated solver service: user pays service fee via MPP, solver fills the order
//
// Two modes:
//   1. Direct: token_id, amount_usd, recipient_polygon (solver buys, transfers, done)
//   2. Escrow: order_id, recipient_polygon (reads from on-chain escrow, verifies, proves)
//
// Both modes charge MPP. Escrow handles position funds trustlessly; MPP handles the service fee.

import { NextRequest } from "next/server";
import { createPublicClient, http, keccak256, encodePacked, type Hex } from "viem";
import { polygon } from "viem/chains";
import { buyShares, transferCTF, getCTFBalance } from "@/lib/polymarket";
import { createMppServer } from "@/lib/mpp";
import { tempo } from "@/lib/tempo";
import { ESCROW_ABI, getEscrowAddress, registerFulfillment, buildAndPostRoot, verifyPolygonTransfer } from "@/lib/fulfillment";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;
const USDC_DECIMALS = 6;

export interface BuyPositionRequest {
  token_id?: string;
  amount_usd?: number;
  recipient_polygon: string;
  order_id?: string;
}

export async function POST(req: NextRequest) {
  // MPP charge on every request (service fee)
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "0.50" })(req);
  if (payment.status === 402) return payment.challenge;

  const body: BuyPositionRequest = await req.json();

  if (body.order_id) {
    const result = await handleEscrowOrder(body);
    return payment.withReceipt(result);
  }

  return payment.withReceipt(await handleDirectOrder(body));
}

async function handleDirectOrder(body: BuyPositionRequest) {
  const { token_id, amount_usd, recipient_polygon } = body;

  if (!token_id || !amount_usd || !recipient_polygon) {
    return Response.json({ error: "token_id, amount_usd, recipient_polygon required" }, { status: 400 });
  }

  let fill;
  try {
    fill = await buyShares(token_id, amount_usd);
  } catch (err: any) {
    return Response.json({ error: `Order failed: ${err.message}` }, { status: 502 });
  }

  let balance = 0n;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    balance = await getCTFBalance(token_id);
    if (balance > 0n) break;
  }
  if (balance === 0n) {
    return Response.json({ error: "Order matched but no shares settled yet", fill }, { status: 502 });
  }

  const txHash = await transferCTF(token_id, balance, recipient_polygon as `0x${string}`);

  return Response.json({
    status: "filled_and_transferred",
    fill: {
      orderId: fill.orderId,
      avgPrice: fill.avgPrice,
      shares: balance.toString(),
    },
    transfer: {
      polygon_tx: txHash,
      polygon_explorer: `https://polygonscan.com/tx/${txHash}`,
      recipient: recipient_polygon,
      token_id,
      ctf_contract: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    },
  });
}

async function handleEscrowOrder(body: BuyPositionRequest) {
  const { order_id, recipient_polygon } = body;
  if (!order_id || !recipient_polygon) {
    return Response.json({ error: "order_id and recipient_polygon required" }, { status: 400 });
  }

  // Read order from escrow contract on Tempo
  const tempoClient = createPublicClient({ chain: tempo, transport: http() });
  const order = await tempoClient.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "orders",
    args: [order_id as Hex],
  });

  const [user, , amount, tokenId, recipientHash, , settled] = order;

  if (user === "0x0000000000000000000000000000000000000000") {
    return Response.json({ error: "Order not found in escrow" }, { status: 404 });
  }
  if (settled) {
    return Response.json({ error: "Order already settled" }, { status: 400 });
  }

  // Verify recipient matches
  const expectedHash = keccak256(encodePacked(["address"], [recipient_polygon as `0x${string}`]));
  if (expectedHash !== recipientHash) {
    return Response.json({ error: "Recipient does not match escrow order" }, { status: 400 });
  }

  const amountUsd = Number(amount) / 10 ** USDC_DECIMALS;
  const tokenIdStr = BigInt(tokenId).toString();

  let fill;
  try {
    fill = await buyShares(tokenIdStr, amountUsd);
  } catch (err: any) {
    return Response.json({ error: `Order failed: ${err.message}` }, { status: 502 });
  }

  // Wait for CLOB settlement with retries
  let balance = 0n;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    balance = await getCTFBalance(tokenIdStr);
    if (balance > 0n) break;
    console.log(`[escrow] Settlement check ${i + 1}/5: no shares yet, waiting...`);
  }
  if (balance === 0n) {
    return Response.json({ error: "Order matched but no shares settled yet", fill }, { status: 502 });
  }

  const txHash = await transferCTF(tokenIdStr, balance, recipient_polygon as `0x${string}`);

  // Wait for Polygon tx to confirm before verification
  const polygonClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com"),
  });
  console.log(`[escrow] Waiting for Polygon tx ${txHash} to confirm...`);
  await polygonClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

  // Verify the confirmed transfer
  try {
    await verifyPolygonTransfer(txHash, recipient_polygon as `0x${string}`, tokenIdStr);
  } catch (err: any) {
    return Response.json({
      error: `Transfer verification failed: ${err.message}`,
      polygon_tx: txHash,
    }, { status: 502 });
  }

  // Verified: append to merkle tree and post root
  registerFulfillment(order_id as Hex, txHash);
  try {
    await buildAndPostRoot();
    console.log("[escrow] Root posted successfully");
  } catch (err: any) {
    console.error("[escrow] Failed to post root:", err.message);
    console.error("[escrow] Full error:", err.stderr || err.stdout || "");
  }

  return Response.json({
    status: "filled_and_transferred",
    settlement: "escrow",
    order_id,
    fill: {
      orderId: fill.orderId,
      avgPrice: fill.avgPrice,
      shares: balance.toString(),
    },
    transfer: {
      polygon_tx: txHash,
      polygon_explorer: `https://polygonscan.com/tx/${txHash}`,
      recipient: recipient_polygon,
      token_id: tokenIdStr,
      ctf_contract: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    },
    proof_available: `/api/proof?orderId=${order_id}`,
  });
}
