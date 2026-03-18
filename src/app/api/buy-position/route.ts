// POST /api/buy-position
// Solver: user pays on Tempo via MPP, solver buys CTF on Polymarket and transfers to user
//
// 1. MPP payment on Tempo (service fee)
// 2. Solver places market order on Polymarket CLOB (Polygon)
// 3. Solver transfers CTF tokens to user's Polygon address
// 4. Returns Polygon tx hash as proof

import { NextRequest } from "next/server";
import { buyShares, transferCTF, getCTFBalance } from "@/lib/polymarket";
import { createMppServer } from "@/lib/mpp";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;

export interface BuyPositionRequest {
  token_id: string;          // Polymarket outcome token ID
  amount_usd: number;        // how much to spend in USD
  recipient_polygon: string; // user's Polygon address to receive CTF tokens
}

export async function POST(req: NextRequest) {
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "0.50" })(req);
  if (payment.status === 402) return payment.challenge;

  const body: BuyPositionRequest = await req.json();
  const { token_id, amount_usd, recipient_polygon } = body;

  if (!token_id || !amount_usd || !recipient_polygon) {
    return payment.withReceipt(
      Response.json({ error: "token_id, amount_usd, recipient_polygon required" }, { status: 400 })
    );
  }

  // Step 1: Buy shares on Polymarket CLOB
  const fill = await buyShares(token_id, amount_usd);
  if (!fill.filledSize || fill.filledSize === 0) {
    return payment.withReceipt(
      Response.json({ error: "Order not filled", fill }, { status: 502 })
    );
  }

  // Step 2: Transfer CTF tokens to user's Polygon address
  const balance = await getCTFBalance(token_id);
  const transferAmount = balance; // transfer all shares we just bought

  const txHash = await transferCTF(
    token_id,
    transferAmount,
    recipient_polygon as `0x${string}`
  );

  return payment.withReceipt(Response.json({
    status: "filled_and_transferred",
    fill: {
      orderId: fill.orderId,
      avgPrice: fill.avgPrice,
      shares: fill.filledSize,
    },
    transfer: {
      polygon_tx: txHash,
      recipient: recipient_polygon,
      token_id,
      shares: transferAmount.toString(),
      ctf_contract: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    },
  }));
}
