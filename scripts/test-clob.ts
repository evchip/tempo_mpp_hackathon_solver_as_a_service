// Test CLOB client: derive API key + fetch orderbook
// Run: bun scripts/test-clob.ts

import { ClobClient } from "@polymarket/clob-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const CLOB_URL = "https://clob.polymarket.com";
const CHAIN_ID = 137;

async function main() {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  if (!pk) { console.error("Set SOLVER_POLYGON_PRIVATE_KEY"); process.exit(1); }

  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
  const account = privateKeyToAccount(pk);
  const signer = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });

  console.log("Solver:", account.address);
  console.log("1. Creating CLOB client (EOA)...");
  const tempClient = new ClobClient(CLOB_URL, CHAIN_ID, signer as any);

  console.log("2. Deriving API key...");
  const creds = await tempClient.createOrDeriveApiKey();
  console.log("   Raw creds:", JSON.stringify(creds, null, 2));

  console.log("3. Creating authenticated client...");
  const client = new ClobClient(CLOB_URL, CHAIN_ID, signer as any, {
    key: creds.apiKey,
    secret: creds.secret,
    passphrase: creds.passphrase,
  });

  // Fetch a sample market from Gamma to get a token ID
  console.log("4. Fetching sample market...");
  const res = await fetch("https://gamma-api.polymarket.com/markets?_limit=1&active=true&closed=false");
  const markets = await res.json();
  const tokenIds = JSON.parse(markets[0].clobTokenIds);
  const tokenId = tokenIds[0];
  console.log("   Market:", markets[0].question.slice(0, 50));
  console.log("   Token:", tokenId.slice(0, 20) + "...");

  console.log("5. Fetching orderbook...");
  const book = await client.getOrderBook(tokenId);
  console.log("   Bids:", book.bids?.length ?? 0, "| Asks:", book.asks?.length ?? 0);

  if (book.bids?.length) {
    console.log("   Best bid:", book.bids[0].price, "| size:", book.bids[0].size);
  }
  if (book.asks?.length) {
    console.log("   Best ask:", book.asks[0].price, "| size:", book.asks[0].size);
  }

  console.log("\nCLOB client works!");
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
