// Orchestrator: receives user intent, drives the agent loop
// Calls REAL MPP marketplace services + our Kalshi endpoint, all paid via Access Key

import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kalshi";
import { getRemainingLimit, USDC } from "@/lib/tempo";
import { initMppClient } from "@/lib/mpp";

export interface AgentRequest {
  intent: string;
  userAddress: `0x${string}`;
}

export async function POST(req: NextRequest) {
  const { intent, userAddress }: AgentRequest = await req.json();

  const agentKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const agentAddress = process.env.AGENT_ADDRESS as `0x${string}`;
  const serviceBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  // Initialize MPP client - fetch() now auto-pays 402 challenges with pathUSD
  await initMppClient(agentKey);

  const remainingBefore = await getRemainingLimit(userAddress, agentAddress, USDC);
  const steps: { action: string; cost: string }[] = [];

  // Step 1: Fetch Kalshi markets via our MPP endpoint (1 pathUSD)
  const marketsRes = await fetch(`${serviceBase}/api/kalshi-markets?q=${encodeURIComponent(intent)}`);
  if (!marketsRes.ok) return NextResponse.json({ error: "Failed to fetch markets" }, { status: 502 });
  const { markets } = await marketsRes.json();
  steps.push({ action: "Fetched Kalshi markets", cost: "1 pathUSD" });

  if (!markets?.length) {
    return NextResponse.json({ error: "No matching Kalshi markets found", steps }, { status: 404 });
  }

  // Step 2: Evaluate trade via Anthropic on MPP marketplace (pay-per-call, no API key needed)
  const evalPrompt = `You are a prediction market trader. Given the user's intent and available Kalshi markets, recommend the best trade.

User intent: "${intent}"

Available markets:
${markets.map((m: any) => `- ${m.ticker}: "${m.title}" | YES bid: ${m.yes_bid}c | YES ask: ${m.yes_ask}c | Volume: ${m.volume}`).join("\n")}

Return ONLY a JSON object with:
- ticker: the market ticker to trade
- side: "yes" or "no"
- contracts: number of contracts (1-10)
- rationale: 1-2 sentence explanation
- confidence: "high", "medium", or "low"
- yes_price: limit price in cents to use`;

  const claudeRes = await fetch("https://anthropic.mpp.tempo.xyz/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: evalPrompt }],
    }),
  });
  if (!claudeRes.ok) return NextResponse.json({ error: "Claude evaluation failed" }, { status: 502 });
  const claudeData = await claudeRes.json();
  steps.push({ action: "Claude evaluated trade via MPP", cost: "~0.01 pathUSD" });

  const text = claudeData.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse recommendation", steps }, { status: 500 });
  }
  const recommendation = JSON.parse(jsonMatch[0]);

  // Step 3: Execute trade on Kalshi sandbox
  const order = await placeOrder({
    ticker: recommendation.ticker,
    side: recommendation.side,
    count: recommendation.contracts,
    type: "limit",
    yes_price: recommendation.yes_price,
  });
  steps.push({ action: "Placed order on Kalshi", cost: "0 (direct API)" });

  const remainingAfter = await getRemainingLimit(userAddress, agentAddress, USDC);

  return NextResponse.json({
    recommendation,
    order,
    steps,
    spent: Number(remainingBefore - remainingAfter) / 1e6,
    remainingLimit: Number(remainingAfter) / 1e6,
  });
}
