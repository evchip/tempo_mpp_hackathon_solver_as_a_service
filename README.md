# Agent Prepaid Card — Tempo x Kalshi Hackathon

**Hackathon:** Tempo x Stripe HIIT Hackathon · March 19, 2026 · SF + Virtual
**Concept:** Give an AI agent a protocol-native spending limit on Tempo. Watch it autonomously buy market data and execute a Kalshi prediction market trade. When the limit hits zero, it literally cannot spend more -- enforced at the Tempo protocol level, not in application code.

---

## What's Built

```
Browser UI (Next.js)
    ↓ user grants Access Key (pathUSD spending limit, 1hr expiry)
/api/agent  ←  orchestrator: calls MPP services with the agent key
    ↓ pays 1 pathUSD                   ↓ pays 2 pathUSD
/api/kalshi-markets              /api/evaluate
(Kalshi market search)           (Claude recommends trade)
    ↓
Kalshi Sandbox API  (actual order execution)
```

**Tempo primitives used:**
- **Access Keys** (AccountKeychain precompile `0xAAAAA...`) -- protocol-native spending limits per TIP-20 token
- **pathUSD** -- native stablecoin on Tempo mainnet
- **Payment lanes** -- guaranteed blockspace for payment txs even under load

**Payment protocol:** MPP (Machine Payments Protocol) via `mppx` SDK (by wevm)
- Server: `mpp.charge({ amount: "1" })` on each route
- Client: `Mppx.create()` then `fetch()` auto-pays 402 challenges

---

## Setup

```bash
cp .env.example .env.local
# Fill in all values -- see comments in .env.example

bun install
bun dev
```

### Accounts you need before hackathon day

| Account | Where | What for |
|---------|-------|----------|
| Tempo mainnet wallet | MetaMask + add chain 4217 | User wallet to grant Access Key |
| Agent throwaway key | `cast wallet new` | Signs Tempo payment txs |
| Kalshi account | kalshi.com -> Settings -> API | Sandbox trading |
| Anthropic API key | console.anthropic.com | Evaluator service (claude-sonnet-4-6) |

### Get mainnet pathUSD
- Bridge USDC from Base/Ethereum via Stargate or Across
- Or get pathUSD from the Tempo faucet if one is available at launch

### Install Tempo agent skill (gives Claude SDK knowledge)
```bash
bunx skills add tempoxyz/agent-skills
```

### MPP (mppx) -- how it works

`mppx` handles all payment logic. No custom verification code needed.

**Server** (each route handler):
```typescript
const mpp = await createMppServer(SERVICE_WALLET);
const payment = await mpp.charge({ amount: "1" })(req);
if (payment.status === 402) return payment.challenge;
return payment.withReceipt(Response.json({ data }));
```

**Client** (agent orchestrator, one-time init):
```typescript
Mppx.create({ methods: [tempo({ account: privateKeyToAccount('0x...') })] });
// fetch() now auto-handles 402 challenges. Done.
```

---

## Project Plan & TODOs

Priority: **P0** = must ship, **P1** = should ship, **P2** = stretch

### Milestone 0 -- First 30 min: Smoke test MPP on mainnet

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Fund agent wallet with pathUSD on Tempo mainnet | P0 | 10m | Bridge or faucet |
| Hit `/api/kalshi-markets` from curl -- verify 402 response | P0 | 10m | Tests MPP server side |
| Call from agent with `initMppClient()` -- verify auto-pay | P0 | 20m | Tests MPP client side end-to-end |

### Milestone 1 -- 2hr mark: Access Key grant flow works

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add wagmi/viem wallet connector to UI | P0 | 45m | MetaMask, Tempo chain 4217 |
| Build Access Key grant flow in UI | P0 | 1hr | User signs `KeyAuthorization`, tx sent via viem |
| Poll `getRemainingLimit()` and show live in UI | P0 | 30m | `ACCOUNT_KEYCHAIN` precompile in `src/lib/tempo.ts` |
| Verify limit depletes when agent spends pathUSD | P0 | 20m | Manual test: call an MPP service from agent |

### Milestone 2 -- 4hr mark: Kalshi service works

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Wire up Kalshi ECDSA auth in `src/lib/kalshi.ts` | P0 | 45m | P-256 signing, see [Kalshi auth docs](https://trading-api.readme.io/reference/authentication) |
| Test `/api/kalshi-markets` returns real data behind MPP paywall | P0 | 20m | |
| Test `/api/evaluate` returns valid `TradeRecommendation` | P0 | 20m | |
| Test agent calls both services, limit drops 3 pathUSD | P0 | 20m | Check on explore.tempo.xyz |

### Milestone 3 -- 5hr mark: Full end-to-end

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Test Kalshi order execution on sandbox | P0 | 30m | `placeOrder()` in `src/lib/kalshi.ts` |
| Full flow: intent -> 2 MPP calls -> order executed -> result shown | P0 | 30m | |

### Milestone 4 -- 6hr mark: Polish for demo

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Live spending meter animation in UI | P1 | 30m | SSE or polling every 2s |
| Show step-by-step agent log in UI | P1 | 30m | Stream progress from `/api/agent` |
| Error states and loading UX | P1 | 20m | |

### Stretch Goals

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add `/api/price-feed` MPP service (Redstone/Chainlink) | P2 | 1hr | Cross-ref Kalshi crypto markets vs spot price |
| Multi-market scan: agent evaluates 3+ markets | P2 | 30m | Costs more pathUSD -- shows limit drain better |
| Spending limit auto-refill request flow | P2 | 45m | Agent detects low budget, prompts user to top up |
| MPP over MCP transport (native in mppx) | P2 | 1hr | Expose services as MCP tools with payments |

---

## Key Docs

- [MPP protocol](https://mpp.dev) -- Machine Payments Protocol
- [mppx SDK](https://github.com/wevm/mppx) -- TypeScript SDK for MPP
- [Tempo mainnet](https://docs.tempo.xyz/quickstart/connection-details) -- chain ID 4217, RPC
- [Account Keychain spec](https://docs.tempo.xyz/protocol/transactions/AccountKeychain) -- Access Keys
- [Predeployed contracts](https://docs.tempo.xyz/quickstart/predeployed-contracts) -- system contract addresses
- [Kalshi API](https://trading-api.readme.io/reference/getting-started) -- market data + orders

---

## Demo Script (2 min)

1. "Here's the UI. I'm going to give an AI agent a $10 spending limit on Tempo -- not in a smart contract, baked into the protocol itself."
2. Click **Approve 10 pathUSD** -> MetaMask prompt -> limit appears in UI
3. Type intent: _"Bet 5 USDC on BTC above $90k by end of March"_
4. Click **Run Agent** -> show step log:
   - `-> Fetching Kalshi markets... paid 1 pathUSD (limit: 9.00)`
   - `-> Evaluating trade... paid 2 pathUSD (limit: 7.00)`
   - `-> Order placed on Kalshi sandbox`
5. "The agent spent $3 of its $10 budget autonomously. It cannot spend more than $10 -- not because we wrote a check in the app, but because Tempo's AccountKeychain precompile enforces it at the protocol level."
