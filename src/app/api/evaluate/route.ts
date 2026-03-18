// MPP-gated service: LLM-powered trade evaluator
// Cost: 2 pathUSD per call

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { KalshiMarket } from "@/lib/kalshi";
import { createMppServer } from "@/lib/mpp";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "2" })(req);
  if (payment.status === 402) return payment.challenge;

  const body: EvaluateRequest = await req.json();
  const { intent, markets } = body;

  if (!intent || !markets?.length) {
    return payment.withReceipt(Response.json({ error: "intent and markets required" }, { status: 400 }));
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
    return payment.withReceipt(Response.json({ error: "Failed to parse recommendation" }, { status: 500 }));
  }

  const recommendation: TradeRecommendation = JSON.parse(jsonMatch[0]);
  return payment.withReceipt(Response.json({ recommendation }));
}
