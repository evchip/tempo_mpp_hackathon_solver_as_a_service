// Orchestrator: receives user intent + Access Key, drives the agent loop
// Flow: fetch markets (x402) → evaluate (x402) → execute on Kalshi → return result

import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kalshi";
import { getRemainingLimit, USDC_E } from "@/lib/tempo";

export interface AgentRequest {
  intent: string;
  userAddress: `0x${string}`;
  // The user has already granted the Access Key on-chain before calling this endpoint.
  // The agent wallet (AGENT_PRIVATE_KEY) will sign Tempo txs to pay x402 services.
}

export async function POST(req: NextRequest) {
  const { intent, userAddress }: AgentRequest = await req.json();

  const agentAddress = process.env.AGENT_ADDRESS as `0x${string}`;
  const serviceBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  // Check remaining budget before starting
  const remainingBefore = await getRemainingLimit(userAddress, agentAddress, USDC_E);
  if (remainingBefore < 3_000_000n) { // need at least 3 USDC.e for both services
    return NextResponse.json({ error: "Insufficient spending limit (need 3 USDC.e min)" }, { status: 400 });
  }

  // Step 1: Fetch Kalshi markets (costs 1 USDC.e via x402)
  // TODO day-of: replace fetch with @x402/axios so payment is handled automatically
  const marketsRes = await fetch(`${serviceBase}/api/kalshi-markets?q=${encodeURIComponent(intent)}`, {
    headers: {
      // TODO: add X-PAYMENT header signed by agent wallet using @x402/axios
    },
  });
  if (!marketsRes.ok) return NextResponse.json({ error: "Failed to fetch markets" }, { status: 502 });
  const { markets } = await marketsRes.json();

  if (!markets?.length) {
    return NextResponse.json({ error: "No matching Kalshi markets found" }, { status: 404 });
  }

  // Step 2: Evaluate trade (costs 2 USDC.e via x402)
  const evalRes = await fetch(`${serviceBase}/api/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // TODO: add X-PAYMENT header via @x402/axios
    },
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

  // Final remaining limit (for UI to display)
  const remainingAfter = await getRemainingLimit(userAddress, agentAddress, USDC_E);

  return NextResponse.json({
    recommendation,
    order,
    spent: Number(remainingBefore - remainingAfter) / 1e6,
    remainingLimit: Number(remainingAfter) / 1e6,
  });
}
