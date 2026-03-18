// Test CTF transfer: move shares from solver to a recipient
// Run: RECIPIENT=0x... bun scripts/test-transfer.ts

import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as `0x${string}`;
const CTF_ABI = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

// The token we just bought
const TOKEN_ID = "75467129615908319583031474642658885479135630431889036121812713428992454630178";

async function main() {
  const pk = process.env.SOLVER_POLYGON_PRIVATE_KEY as `0x${string}`;
  const recipient = (process.env.RECIPIENT ?? process.argv[2]) as `0x${string}`;
  if (!pk) { console.error("Set SOLVER_POLYGON_PRIVATE_KEY"); process.exit(1); }
  if (!recipient) { console.error("Set RECIPIENT=0x... or pass as arg"); process.exit(1); }

  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });

  // Check current balance
  const balance = await publicClient.readContract({
    address: CTF_ADDRESS, abi: CTF_ABI, functionName: "balanceOf",
    args: [account.address, BigInt(TOKEN_ID)],
  });
  console.log("Solver CTF balance:", balance.toString());

  if (balance === 0n) { console.error("No shares to transfer!"); process.exit(1); }

  // Transfer all shares to recipient
  console.log(`Transferring ${balance} shares to ${recipient}...`);
  const hash = await walletClient.writeContract({
    address: CTF_ADDRESS, abi: CTF_ABI, functionName: "safeTransferFrom",
    args: [account.address, recipient, BigInt(TOKEN_ID), balance, "0x"],
  });
  console.log("Tx hash:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Status:", receipt.status);

  // Verify
  const solverAfter = await publicClient.readContract({
    address: CTF_ADDRESS, abi: CTF_ABI, functionName: "balanceOf",
    args: [account.address, BigInt(TOKEN_ID)],
  });
  const recipientAfter = await publicClient.readContract({
    address: CTF_ADDRESS, abi: CTF_ABI, functionName: "balanceOf",
    args: [recipient, BigInt(TOKEN_ID)],
  });
  console.log("\nSolver balance:", solverAfter.toString());
  console.log("Recipient balance:", recipientAfter.toString());
  console.log("\nTransfer complete!");
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
