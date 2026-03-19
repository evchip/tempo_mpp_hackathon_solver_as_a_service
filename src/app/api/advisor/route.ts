// POST /api/advisor
// LLM-powered market advisor. Uses Anthropic Claude via MPP to analyze markets
// and recommend trades with ready-to-use deposit parameters.
//
// MPP chain: user pays our service → we call search endpoint → we call Claude via MPP
//
// Request: { "query": "bitcoin", "budget_usd": 5 }
// Response: { recommendation, markets, deposit_params }

import { NextRequest } from "next/server";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createMppServer } from "@/lib/mpp";
import { searchMarkets, type ParsedMarket } from "@/lib/polymarket";

const SERVICE_WALLET = process.env.SERVICE_WALLET_ADDRESS as `0x${string}`;
const ANTHROPIC_MPP_URL = "https://anthropic.mpp.tempo.xyz/v1/messages";

// Lazy-init MPP client for calling Anthropic
let _mppClient: { fetch: typeof globalThis.fetch } | null = null;

async function getMppClient() {
  if (_mppClient) return _mppClient;

  const { Mppx, tempo: tempoMethod } = await import("mppx/client");

  const pk = process.env.RELAYER_PRIVATE_KEY as Hex;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk);

  _mppClient = Mppx.create({
    methods: [tempoMethod({ account, maxDeposit: "1" })],
    polyfill: false,
  });
  return _mppClient;
}

export async function POST(req: NextRequest) {
  const mpp = await createMppServer(SERVICE_WALLET);
  const payment = await mpp.charge({ amount: "0.25" })(req);
  if (payment.status === 402) return payment.challenge;

  const body = await req.json();
  const { query, budget_usd } = body;

  if (!query) {
    return payment.withReceipt(
      Response.json({ error: "query required" }, { status: 400 })
    );
  }

  const budget = budget_usd ?? 5;

  // Step 1: Search markets
  let markets: ParsedMarket[];
  try {
    markets = await searchMarkets(query, 10);
  } catch (err: any) {
    return payment.withReceipt(
      Response.json({ error: `Market search failed: ${err.message}` }, { status: 502 })
    );
  }

  if (markets.length === 0) {
    return payment.withReceipt(
      Response.json({ error: "No markets found", query }, { status: 404 })
    );
  }

  // Step 2: Call Claude via Anthropic MPP to analyze markets
  const marketSummary = markets.map((m) => ({
    question: m.question,
    yesTokenId: m.yesTokenId,
    noTokenId: m.noTokenId,
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    volume: m.volume,
    liquidity: m.liquidity,
    endDate: m.endDate,
  }));

  const prompt = `You are a prediction market analyst. The user wants to trade on Polymarket with a budget of $${budget} USDC.

Here are the available markets matching "${query}":

${JSON.stringify(marketSummary, null, 2)}

Analyze these markets and recommend the single best trade. Consider:
- Liquidity (higher is better, avoid illiquid markets)
- Price (look for mispriced outcomes)
- Volume (indicates market interest)

Respond with ONLY valid JSON, no markdown:
{
  "recommendation": "1-2 sentence explanation of why this trade",
  "market": "the market question",
  "side": "YES or NO",
  "token_id": "the exact token ID string for the recommended side",
  "price": the current price,
  "suggested_amount_usd": suggested amount within budget,
  "confidence": "low/medium/high"
}`;

  let recommendation: any;
  try {
    const client = await getMppClient();
    const res = await client.fetch(ANTHROPIC_MPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeResponse = await res.json();
    const text = claudeResponse.content[0].text;
    recommendation = JSON.parse(text);
  } catch (err: any) {
    return payment.withReceipt(
      Response.json({
        error: `Claude analysis failed: ${err.message}`,
        markets: marketSummary,
      }, { status: 502 })
    );
  }

  // Step 3: Construct deposit parameters and next-step commands
  const tokenIdBigInt = BigInt(recommendation.token_id);
  const tokenBytes = "0x" + tokenIdBigInt.toString(16).padStart(64, "0");
  const amountRaw = Math.floor(recommendation.suggested_amount_usd * 1e6);
  const escrow = process.env.ESCROW_ADDRESS;
  const solver = process.env.SERVICE_WALLET_ADDRESS;
  const usdc = process.env.USDC_TEMPO ?? "0x20c000000000000000000000b9537d11c60e8b50";

  return payment.withReceipt(Response.json({
    recommendation: recommendation.recommendation,
    market: recommendation.market,
    side: recommendation.side,
    price: recommendation.price,
    confidence: recommendation.confidence,
    deposit_params: {
      token_id: recommendation.token_id,
      token_bytes32: tokenBytes,
      amount_usd: recommendation.suggested_amount_usd,
      amount_raw: amountRaw,
      escrow,
      solver,
      usdc,
    },
    next_steps: [
      `# 1. Set variables (pulls key from your logged-in tempo wallet)`,
      `export USER_KEY=$(tempo wallet whoami -j | jq -r '.key.key')`,
      `export USER_WALLET=$(tempo wallet whoami -j | jq -r '.wallet')`,
      `export ORDER_ID=$(cast keccak "order-$(date +%s)") && echo $ORDER_ID`,
      `export RECIPIENT=<your-polygon-address>`,
      `RECIPIENT_HASH=$(cast keccak $RECIPIENT)`,
      `DEADLINE=$(($(date +%s) + 3600))`,
      `# 2. Approve USDC`,
      `cast send --rpc-url https://rpc.tempo.xyz --tempo.access-key $USER_KEY --tempo.root-account $USER_WALLET --tempo.fee-token ${usdc} ${usdc} "approve(address,uint256)" ${escrow} ${amountRaw}`,
      `# 3. Deposit into escrow`,
      `cast send --rpc-url https://rpc.tempo.xyz --tempo.access-key $USER_KEY --tempo.root-account $USER_WALLET --tempo.fee-token ${usdc} ${escrow} "deposit(bytes32,address,uint256,bytes32,bytes32,uint256)" $ORDER_ID ${solver} ${amountRaw} ${tokenBytes} $RECIPIENT_HASH $DEADLINE`,
      `# 4. Call solver (pays $0.50 service fee via MPP)`,
      `tempo request -X POST --json '{"order_id":"'$ORDER_ID'","recipient_polygon":"'$RECIPIENT'"}' ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : req.nextUrl.origin}/api/buy-position`,
    ],
    markets_analyzed: markets.length,
    powered_by: "Claude via Anthropic MPP ($0.02/call)",
  }));
}
