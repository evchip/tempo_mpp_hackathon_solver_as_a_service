import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const tempo = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.TEMPO_RPC_URL ?? "https://rpc.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
});

// Precompile addresses
export const ACCOUNT_KEYCHAIN = "0xAAAAAAAA00000000000000000000000000000000" as const;
export const TIP20_FACTORY = "0x20fc000000000000000000000000000000000000" as const;
export const STABLECOIN_DEX = "0xdec0000000000000000000000000000000000000" as const;

// USDC on Tempo mainnet
export const USDC = "0x20c000000000000000000000b9537d11c60e8b50" as const;

export const KEYCHAIN_ABI = parseAbi([
  "function getRemainingLimit(address account, address keyId, address token) view returns (uint256)",
  "function getKey(address account, address keyId) view returns (tuple(uint8 signatureType, address keyId, uint64 expiry, bool enforceLimits, bool isRevoked))",
  "function authorizeKey(address keyId, uint8 signatureType, uint64 expiry, bool enforceLimits, tuple(address token, uint256 amount)[] limits) external",
  "function revokeKey(address keyId) external",
]);

export function getPublicClient() {
  return createPublicClient({ chain: tempo, transport: http() });
}

export function getAgentWalletClient() {
  const pk = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("AGENT_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain: tempo, transport: http() });
}

export async function getRemainingLimit(
  userAddress: `0x${string}`,
  agentAddress: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: ACCOUNT_KEYCHAIN,
    abi: KEYCHAIN_ABI,
    functionName: "getRemainingLimit",
    args: [userAddress, agentAddress, tokenAddress],
  });
}

export function buildKeyAuthorization(
  agentAddress: `0x${string}`,
  spendingLimitUsdc: bigint,
  expiryTimestamp: number
) {
  return {
    chainId: tempo.id,
    keyType: 0, // secp256k1
    keyId: agentAddress,
    expiry: expiryTimestamp,
    limits: [{ token: USDC, limit: spendingLimitUsdc }],
  };
}
