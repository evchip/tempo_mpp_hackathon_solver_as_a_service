// MPP (Machine Payments Protocol) server and client setup
// Docs: https://mpp.dev
// SDK: https://github.com/wevm/mppx

import { USDC } from "./tempo";

// Server-side: create an MPP instance for charging callers
export function createMppServer(recipientAddress: `0x${string}`) {
  // Dynamic import to avoid pulling server code into client bundle
  return import("mppx/server").then(({ Mppx, tempo }) =>
    Mppx.create({
      methods: [
        tempo({
          currency: USDC,
          recipient: recipientAddress,
        }),
      ],
    })
  );
}

// Client-side: initialize once at agent startup so fetch() auto-pays 402 challenges
export async function initMppClient(agentPrivateKey: `0x${string}`) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { Mppx, tempo } = await import("mppx/client");

  Mppx.create({
    methods: [tempo({ account: privateKeyToAccount(agentPrivateKey) })],
  });
  // After this, any fetch() that receives a 402 will auto-pay with pathUSD on Tempo.
}
