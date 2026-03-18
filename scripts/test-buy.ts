// Test real buy: place a small order on Polymarket CLOB + check CTF balance
// Run: bun scripts/test-buy.ts

import { ClobClient } from "@polymarket/clob-client";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const CLOB_URL = "https://clob.polymarket.com";
const CHAIN_ID = 137;
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const CTF_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

async function main() {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  if (!pk) { console.error("Set SOLVER_POLYGON_PRIVATE_KEY"); process.exit(1); }

  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
  const account = privateKeyToAccount(pk);
  const signer = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: polygon, transport: http(rpcUrl) });

  console.log("Solver:", account.address);

  // Init CLOB client
  console.log("\n1. Initializing CLOB client...");
  const tempClient = new ClobClient(CLOB_URL, CHAIN_ID, signer as any);
  const creds = await tempClient.createOrDeriveApiKey();
  const client = new ClobClient(CLOB_URL, CHAIN_ID, signer as any, {
    key: creds.key,
    secret: creds.secret,
    passphrase: creds.passphrase,
  });

  // Find a cheap, liquid market
  console.log("\n2. Finding a liquid market...");
  const res = await fetch("https://gamma-api.polymarket.com/markets?_limit=20&active=true&closed=false");
  const markets = await res.json();

  // Pick a market with decent liquidity and a cheap YES price
  let target = null;
  for (const m of markets) {
    if (!m.clobTokenIds || m.clobTokenIds === "[]") continue;
    const prices = JSON.parse(m.outcomePrices);
    const yesPrice = parseFloat(prices[0]);
    // Pick something with YES between 10-50 cents for a cheap test
    if (yesPrice > 0.10 && yesPrice < 0.50 && parseFloat(m.liquidity) > 1000) {
      target = m;
      break;
    }
  }

  if (!target) {
    // Fall back to first market with tokens
    target = markets.find((m: any) => m.clobTokenIds && m.clobTokenIds !== "[]");
  }

  const tokenIds = JSON.parse(target.clobTokenIds);
  const yesTokenId = tokenIds[0];
  const prices = JSON.parse(target.outcomePrices);

  console.log("   Market:", target.question.slice(0, 60));
  console.log("   YES price:", prices[0], "| NO price:", prices[1]);
  console.log("   Token ID:", yesTokenId.slice(0, 20) + "...");

  // Check CTF balance before
  const balBefore = await publicClient.readContract({
    address: CTF_ADDRESS as `0x${string}`,
    abi: CTF_ABI,
    functionName: "balanceOf",
    args: [account.address, BigInt(yesTokenId)],
  });
  console.log("   CTF balance before:", balBefore.toString());

  // Place a $1 market buy
  console.log("\n3. Placing $1 market buy order...");
  try {
    const order = await client.createAndPostMarketOrder({
      tokenID: yesTokenId,
      amount: 1, // $1
      side: "BUY",
    });
    console.log("   Order result:", JSON.stringify(order, null, 2));

    // Check CTF balance after
    // Wait a moment for settlement
    console.log("\n4. Waiting 3s for settlement...");
    await new Promise((r) => setTimeout(r, 3000));

    const balAfter = await publicClient.readContract({
      address: CTF_ADDRESS as `0x${string}`,
      abi: CTF_ABI,
      functionName: "balanceOf",
      args: [account.address, BigInt(yesTokenId)],
    });
    console.log("   CTF balance after:", balAfter.toString());
    console.log("   Shares acquired:", (balAfter - balBefore).toString());

    if (balAfter > balBefore) {
      console.log("\n   BUY + SETTLEMENT CONFIRMED!");
      console.log("   Token ID for transfer test:", yesTokenId);
      console.log("   Shares:", (balAfter - balBefore).toString());
    }
  } catch (err: any) {
    console.error("   Order failed:", err.message ?? err);
    if (err.response?.data) console.error("   Response:", JSON.stringify(err.response.data));
  }
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
