import { tempo as tempoChain } from "viem/chains";

// Re-export with custom RPC if set via env
export const tempo = {
  ...tempoChain,
  rpcUrls: {
    ...tempoChain.rpcUrls,
    default: {
      http: [process.env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0]],
    },
  },
};

// USDC on Tempo mainnet
export const USDC = "0x20c000000000000000000000b9537d11c60e8b50" as const;
