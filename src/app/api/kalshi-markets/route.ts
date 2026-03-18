// MPP-gated service: Kalshi market data
// Cost: 1 pathUSD per call

import { NextRequest } from "next/server";
import { searchMarkets } from "@/lib/kalshi";
import { createMppServer } from "@/lib/mpp";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;

export async function GET(req: NextRequest) {
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "1" })(req);
  if (payment.status === 402) return payment.challenge;

  const query = req.nextUrl.searchParams.get("q") ?? "";
  if (!query) {
    return payment.withReceipt(Response.json({ error: "query param 'q' required" }, { status: 400 }));
  }

  try {
    const markets = await searchMarkets(query);
    return payment.withReceipt(Response.json({ markets }));
  } catch (err) {
    return payment.withReceipt(Response.json({ error: String(err) }, { status: 500 }));
  }
}
