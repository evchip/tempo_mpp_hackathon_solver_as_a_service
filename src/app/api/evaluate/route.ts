// x402-gated service: LLM-powered trade evaluator
// Cost: 2 USDC.e per call
// Takes markets + user intent, returns structured trade recommendation

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { KalshiMarket } from "@/lib/kalshi";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// TODO day-of: wire up real x402 payment verification (same as kalshi-markets/route.ts)
async function verifyPayment(req: NextRequest): Promise<boolean> {
  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) return false;
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
          maxAmountRequired: "2000000", // 2 USDC.e
          resource: "/api/evaluate",
          description: "AI trade evaluator: 2 USDC.e per call",
          mimeType: "application/json",
          payTo: "0x...",
          maxTimeoutSeconds: 60,
          asset: process.env.NEXT_PUBLIC_USDC_E_ADDRESS ?? "",
          extra: { name: "USDC.e", version: "1" },
        },
      ],
    },
    { status: 402 }
  );
}

export interface EvaluateRequest {
  intent: string;
  markets: KalshiMarket[];
}

export interface TradeRecommendation {
  ticker: string;
  side: "yes" | "no";
  contracts: number;
  rationale: string;
  confidence: "high" | "medium" | "low";
  yes_price: number;
}

export async function POST(req: NextRequest) {
  const paid = await verifyPayment(req);
  if (!paid) return paymentRequired();

  const body: EvaluateRequest = await req.json();
  const { intent, markets } = body;

  if (!intent || !markets?.length) {
    return NextResponse.json({ error: "intent and markets required" }, { status: 400 });
  }

  const prompt = `You are a prediction market trader. Given the user's intent and available Kalshi markets, recommend the best trade.

User intent: "${intent}"

Available markets:
${markets.map((m) => `- ${m.ticker}: "${m.title}" | YES bid: ${m.yes_bid}c | YES ask: ${m.yes_ask}c | Volume: ${m.volume}`).join("\n")}

Return a JSON object with:
- ticker: the market ticker to trade
- side: "yes" or "no"
- contracts: number of contracts (1-10)
- rationale: 1-2 sentence explanation
- confidence: "high", "medium", or "low"
- yes_price: limit price in cents to use`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse recommendation" }, { status: 500 });
  }

  const recommendation: TradeRecommendation = JSON.parse(jsonMatch[0]);
  return NextResponse.json({ recommendation });
}
