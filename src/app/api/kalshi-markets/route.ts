// x402-gated service: Kalshi market data
// Cost: 1 USDC.e per call
// The agent pays this via its Access Key spending limit

import { NextRequest, NextResponse } from "next/server";
import { searchMarkets } from "@/lib/kalshi";

// TODO day-of: replace this stub with real x402 payment verification
// Use @x402/next withPaymentRequired wrapper, configured for Tempo (chain 42431, USDC.e)
// See: https://docs.cdp.coinbase.com/x402/next
async function verifyPayment(req: NextRequest): Promise<boolean> {
  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) return false;
  // TODO: verify payment proof against Tempo chain
  // For now: return true to unblock development
  return true;
}

function paymentRequired() {
  return NextResponse.json(
    {
      x402Version: 1,
      error: "Payment Required",
      accepts: [
        {
          scheme: "exact",
          network: "tempo-testnet",
          maxAmountRequired: "1000000", // 1 USDC.e (6 decimals)
          resource: "/api/kalshi-markets",
          description: "Kalshi market search: 1 USDC.e per call",
          mimeType: "application/json",
          payTo: process.env.AGENT_PRIVATE_KEY ? "0x..." : "0x0000000000000000000000000000000000000000",
          maxTimeoutSeconds: 60,
          asset: process.env.NEXT_PUBLIC_USDC_E_ADDRESS ?? "",
          extra: { name: "USDC.e", version: "1" },
        },
      ],
    },
    { status: 402 }
  );
}

export async function GET(req: NextRequest) {
  const paid = await verifyPayment(req);
  if (!paid) return paymentRequired();

  const query = req.nextUrl.searchParams.get("q") ?? "";
  if (!query) {
    return NextResponse.json({ error: "query param 'q' required" }, { status: 400 });
  }

  try {
    const markets = await searchMarkets(query);
    return NextResponse.json({ markets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
