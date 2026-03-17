# Agent Prepaid Card — Tempo x Kalshi Hackathon

**Hackathon:** Tempo x Stripe HIIT Hackathon · March 19, 2026 · SF + Virtual
**Concept:** Give an AI agent a protocol-native spending limit on Tempo. Watch it autonomously buy market data and execute a Kalshi prediction market trade. When the limit hits zero, it literally cannot spend more — enforced at the Tempo protocol level, not in application code.

---

## What's Built

```
Browser UI (Next.js)
    ↓ user grants Access Key (USDC.e spending limit, 1hr expiry)
/api/agent  ←  orchestrator: calls x402 services with the agent key
    ↓ pays 1 USDC.e                    ↓ pays 2 USDC.e
/api/kalshi-markets              /api/evaluate
(Kalshi market search)           (Claude recommends trade)
    ↓
Kalshi Sandbox API  (actual order execution)
```

**Tempo primitives used:**
- **Access Keys** (AccountKeychain precompile `0xAAAAA...`) — protocol-native spending limits per TIP-20 token
- **USDC.e** — bridged stablecoin as payment currency
- **Payment lanes** — guaranteed blockspace for payment txs even under load

---

## Setup

```bash
cp .env.example .env.local
# Fill in all values — see comments in .env.example

npm install
npm run dev
```

### Accounts you need before hackathon day

| Account | Where | What for |
|---------|-------|----------|
| Tempo testnet wallet | MetaMask + add chain 42431 | User wallet to grant Access Key |
| Agent throwaway key | `cast wallet new` | Signs Tempo payment txs |
| Kalshi account | kalshi.com → Settings → API | Sandbox trading |
| Anthropic API key | console.anthropic.com | Evaluator service (claude-sonnet-4-6) |
| CDP API key | cdp.coinbase.com | x402 facilitator |

### Get testnet funds
- pathUSD faucet: https://faucets.chain.link/tempo-testnet
- USDC.e: bridge from Base via Stargate or Across

### Install Tempo agent skill (gives Claude SDK knowledge)
```bash
npx skills add tempoxyz/agent-skills
```

---

## Project Plan & TODOs

Priority: **P0** = must ship, **P1** = should ship, **P2** = stretch

### Milestone 0 — First 30 min: Verify x402 works on Tempo

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Verify `@x402/next` supports custom EVM chains (chain ID 42431) | P0 | 30m | May need custom network config — check [x402 docs](https://docs.cdp.coinbase.com/x402) |
| Confirm USDC.e address on testnet | P0 | 10m | `tokenlist.tempo.xyz/list/42431` |
| Send a test x402 payment on Tempo testnet | P0 | 30m | Use `@x402/axios` + agent key |

### Milestone 1 — 2hr mark: Access Key grant flow works

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add wagmi/viem wallet connector to UI | P0 | 45m | MetaMask, Tempo chain 42431 |
| Build Access Key grant flow in UI | P0 | 1hr | User signs `KeyAuthorization`, tx sent via viem |
| Poll `getRemainingLimit()` and show live in UI | P0 | 30m | `ACCOUNT_KEYCHAIN` precompile in `src/lib/tempo.ts` |
| Verify limit depletes when agent sends USDC.e | P0 | 20m | Manual test: send USDC.e from agent wallet |

### Milestone 2 — 4hr mark: Kalshi data service behind x402

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Wire up Kalshi ECDSA auth in `src/lib/kalshi.ts` | P0 | 45m | P-256 signing, see [Kalshi auth docs](https://trading-api.readme.io/reference/authentication) |
| Replace payment stub in `/api/kalshi-markets` with real x402 verification | P0 | 30m | Use `@x402/next` withPaymentRequired |
| Wire `@x402/axios` in `/api/agent` so calls auto-pay | P0 | 30m | Agent wallet signs payment, USDC.e moves on Tempo |
| Test: agent calls `/api/kalshi-markets`, limit drops 1 USDC.e | P0 | 20m | Check on Tempo explorer |

### Milestone 3 — 5hr mark: Full end-to-end

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Wire x402 payment in `/api/evaluate` | P0 | 20m | Same pattern as kalshi-markets |
| Test evaluator returns valid `TradeRecommendation` | P0 | 20m | |
| Test Kalshi order execution on sandbox | P0 | 30m | `placeOrder()` in `src/lib/kalshi.ts` |
| Full flow: intent → 2 x402 calls → order executed | P0 | 30m | |

### Milestone 4 — 6hr mark: Polish for demo

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Live spending meter animation in UI | P1 | 30m | SSE or polling every 2s |
| Show step-by-step agent log in UI | P1 | 30m | Stream progress from `/api/agent` |
| Error states and loading UX | P1 | 20m | |

### Stretch Goals

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add `/api/price-feed` x402 service (Redstone/Chainlink on Tempo) | P2 | 1hr | Cross-ref Kalshi crypto markets vs spot price |
| Multi-market scan: agent evaluates 3+ markets before picking | P2 | 30m | Costs more USDC.e — shows limit drain better |
| Spending limit auto-refill request flow | P2 | 45m | Agent detects low budget, prompts user to top up |
| `@newyorkcompute/kalshi-mcp` integration as alt agent backend | P2 | 1hr | MCP tools instead of raw HTTP — cleaner agent loop |

---

## Key Docs

- [Tempo Testnet connection details](https://docs.tempo.xyz/quickstart/connection-details) — chain ID 42431, RPC
- [Account Keychain spec](https://docs.tempo.xyz/protocol/transactions/AccountKeychain) — Access Keys
- [Predeployed contracts](https://docs.tempo.xyz/quickstart/predeployed-contracts) — ACCOUNT_KEYCHAIN address
- [x402 docs](https://docs.cdp.coinbase.com/x402) — payment protocol
- [Kalshi API](https://trading-api.readme.io/reference/getting-started) — market data + orders
- [viem custom chains](https://viem.sh/docs/chains/introduction) — Tempo chain config

---

## Demo Script (2 min)

1. "Here's the UI. I'm going to give an AI agent a $10 spending limit on Tempo — not in a smart contract, baked into the protocol itself."
2. Click **Approve 10 USDC.e** → MetaMask prompt → limit appears in UI
3. Type intent: _"Bet 5 USDC on BTC above $90k by end of March"_
4. Click **Run Agent** → show step log:
   - `→ Fetching Kalshi markets... paid 1 USDC.e (limit: 9.00)`
   - `→ Evaluating trade... paid 2 USDC.e (limit: 7.00)`
   - `→ Order placed on Kalshi sandbox`
5. "The agent spent $3 of its $10 budget autonomously. It cannot spend more than $10 — not because we wrote a check in the app, but because Tempo's AccountKeychain precompile enforces it."
