import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const tempoTestnet = defineChain({
  id: 42431,
  name: "Tempo Testnet (Moderato)",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.TEMPO_RPC_URL ?? "https://rpc.moderato.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
});

// Precompile addresses - hardcoded, never change
export const ACCOUNT_KEYCHAIN = "0xAAAAAAAA00000000000000000000000000000000" as const;
export const TIP20_FACTORY = "0x20fc000000000000000000000000000000000000" as const;
export const STABLECOIN_DEX = "0xdec0000000000000000000000000000000000000" as const;

// Tokens
export const PATH_USD = "0x20c0000000000000000000000000000000000000" as const;
export const USDC_E = (process.env.NEXT_PUBLIC_USDC_E_ADDRESS ?? "") as `0x${string}`;

export const KEYCHAIN_ABI = parseAbi([
  "function getRemainingLimit(address account, address keyId, address token) view returns (uint256)",
  "function getKey(address account, address keyId) view returns (tuple(uint8 signatureType, address keyId, uint64 expiry, bool enforceLimits, bool isRevoked))",
  "function authorizeKey(address keyId, uint8 signatureType, uint64 expiry, bool enforceLimits, tuple(address token, uint256 amount)[] limits) external",
  "function revokeKey(address keyId) external",
]);

export function getPublicClient() {
  return createPublicClient({ chain: tempoTestnet, transport: http() });
}

export function getAgentWalletClient() {
  const pk = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("AGENT_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain: tempoTestnet, transport: http() });
}

// Fetch remaining spending limit for the agent key on a given token
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

// Build a KeyAuthorization payload for the user to sign on the frontend
// The user signs this with their root key (MetaMask) to provision the agent's Access Key
export function buildKeyAuthorization(
  agentAddress: `0x${string}`,
  spendingLimitUsdc: bigint,
  expiryTimestamp: number
) {
  return {
    chainId: tempoTestnet.id,
    keyType: 0, // secp256k1
    keyId: agentAddress,
    expiry: expiryTimestamp,
    limits: [{ token: USDC_E, limit: spendingLimitUsdc }],
  };
}
