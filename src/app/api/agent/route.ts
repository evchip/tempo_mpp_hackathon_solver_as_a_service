// Orchestrator: receives user intent, drives the agent loop
// Flow: init MPP client → fetch markets (pays pathUSD) → evaluate (pays pathUSD) → execute on Kalshi

import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kalshi";
import { getRemainingLimit, PATH_USD } from "@/lib/tempo";
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

  // Initialize MPP client - after this, fetch() auto-pays 402 challenges with pathUSD
  await initMppClient(agentKey);

  // Check remaining budget before starting
  const remainingBefore = await getRemainingLimit(userAddress, agentAddress, PATH_USD);
  if (remainingBefore < 3_000_000n) {
    return NextResponse.json({ error: "Insufficient spending limit (need 3 pathUSD min)" }, { status: 400 });
  }

  // Step 1: Fetch Kalshi markets (costs 1 pathUSD via MPP - automatic)
  const marketsRes = await fetch(`${serviceBase}/api/kalshi-markets?q=${encodeURIComponent(intent)}`);
  if (!marketsRes.ok) return NextResponse.json({ error: "Failed to fetch markets" }, { status: 502 });
  const { markets } = await marketsRes.json();

  if (!markets?.length) {
    return NextResponse.json({ error: "No matching Kalshi markets found" }, { status: 404 });
  }

  // Step 2: Evaluate trade (costs 2 pathUSD via MPP - automatic)
  const evalRes = await fetch(`${serviceBase}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, markets }),
  });
  if (!evalRes.ok) return NextResponse.json({ error: "Evaluator failed" }, { status: 502 });
  const { recommendation } = await evalRes.json();

  // Step 3: Execute trade on Kalshi sandbox
  const order = await placeOrder({
    ticker: recommendation.ticker,
    side: recommendation.side,
    count: recommendation.contracts,
    type: "limit",
    yes_price: recommendation.yes_price,
  });

  const remainingAfter = await getRemainingLimit(userAddress, agentAddress, PATH_USD);

  return NextResponse.json({
    recommendation,
    order,
    spent: Number(remainingBefore - remainingAfter) / 1e6,
    remainingLimit: Number(remainingAfter) / 1e6,
  });
}
