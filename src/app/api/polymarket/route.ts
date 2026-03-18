// GET /api/polymarket?q=bitcoin&limit=10
// GET /api/polymarket?condition_id=0x...
// Search or get Polymarket markets
// Cost: 0.10 USDC per call

import { NextRequest } from "next/server";
import { searchMarkets, getMarket } from "@/lib/polymarket";
import { createMppServer } from "@/lib/mpp";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;

export async function GET(req: NextRequest) {
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "0.10" })(req);
  if (payment.status === 402) return payment.challenge;

  const conditionId = req.nextUrl.searchParams.get("condition_id");
  if (conditionId) {
    const market = await getMarket(conditionId);
    return payment.withReceipt(Response.json({ market }));
  }

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10");
  const markets = await searchMarkets(query, limit);
  return payment.withReceipt(Response.json({ markets, count: markets.length }));
}
