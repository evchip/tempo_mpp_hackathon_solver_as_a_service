# Polymarket on MPP

Search prediction markets and buy positions cross-chain. Pay USDC on Tempo, receive CTF tokens on Polygon. Every fill and transfer is verifiable on-chain.

---

## Status (pre-hackathon)

**Working end-to-end:**
- MPP data endpoint (search Polymarket markets, 0.10 USDC per call)
- MPP solver (buy position on Polymarket CLOB + transfer CTF to user's Polygon address, 0.50 USDC)
- CLOB auth (API key derivation via `@polymarket/clob-client`)
- CTF ERC1155 transfer from solver to user's Polymarket Safe
- Solver wallet funded and all 6 Polymarket approvals confirmed

**Remaining for hackathon day:**
- Deploy to public URL
- Escrow / cross-chain settlement proving (the interesting part)
- Demo polish

---

## Endpoints

| Method | Path | Cost | Description |
|--------|------|------|-------------|
| GET | `/api/polymarket?q=bitcoin&limit=10` | 0.10 USDC | Search Polymarket markets |
| GET | `/api/polymarket?condition_id=0x...` | 0.10 USDC | Get single market by condition ID |
| POST | `/api/buy-position` | 0.50 USDC | Solver: pay on Tempo, receive CTF on Polygon |

### Buy position request

```json
{
  "token_id": "10526756807365906...",
  "amount_usd": 5,
  "recipient_polygon": "0x5BcfE51cb7fDA9cf2c91B1948916ff29bee72600"
}
```

Response includes Polygon tx hash for the CTF transfer + Polygonscan link.

### How the solver works

```
Tempo                        Polygon
─────                        ───────
User pays 0.50 USDC ─────>  Solver buys CTF on CLOB
via MPP                      ↓
                <──────────  Transfers CTF to user
                             (verifiable tx hash returned)
```

---

## Quick Start

```bash
# Already done: bun install, .env.local configured

bun dev

# Search markets
tempo request -t -X GET "http://localhost:3000/api/polymarket?q=bitcoin"

# Buy a position (pay on Tempo, receive CTF on Polygon)
tempo request -t -X POST --json '{
  "token_id": "TOKEN_ID_FROM_SEARCH",
  "amount_usd": 5,
  "recipient_polygon": "0x5BcfE51cb7fDA9cf2c91B1948916ff29bee72600"
}' "http://localhost:3000/api/buy-position"

# Dry run (check cost without paying)
tempo request -t --dry-run -X GET "http://localhost:3000/api/polymarket?q=bitcoin"
```

**Important:** VPN required (non-US, e.g. Netherlands) for CLOB order placement. Polymarket geoblocks US IPs.

---

## Solver Wallet

| Field | Value |
|-------|-------|
| Address | `0xa0dF29753C297cf0975e55B6bE7516EbB9A94fA9` |
| Chain | Polygon PoS |
| Approvals | All 6 confirmed (3x USDC.e + 3x CTF ERC1155) |
| CLOB API key | Auto-derived on first use via `createOrDeriveApiKey()` |

### Useful scripts

```bash
# Check solver balances + approvals
bun scripts/check-solver.ts 0xa0dF29753C297cf0975e55B6bE7516EbB9A94fA9

# Re-run approvals if needed
bun scripts/setup-solver.ts

# Test CLOB auth + orderbook fetch
bun scripts/test-clob.ts

# Test a real buy order ($1 minimum, needs VPN)
bun scripts/test-buy.ts

# Transfer CTF to a recipient
RECIPIENT=0x... bun scripts/test-transfer.ts
```

---

## Environment Variables

Already configured in `.env.local`:

```
TEMPO_RPC_URL=https://rpc.tempo.xyz
MPP_SECRET_KEY=<generated>
SERVICE_WALLET_ADDRESS=0xef07...  (your tempo wallet)
SOLVER_POLYGON_PRIVATE_KEY=0x17...
SOLVER_POLYGON_ADDRESS=0xa0dF...
POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com
```

---

## Hackathon Day Plan

All plumbing is done. Focus is on the hard/interesting problems:

### Morning: Deploy + verify

| Task | Effort | Notes |
|------|--------|-------|
| Deploy to Railway/Vercel | 30m | Public URL for demo |
| Test from deployed URL with `tempo request` | 15m | |
| Fix next.config.ts warning (serverExternalPackages) | 5m | |

### Core: Escrow / Cross-Chain Proving

| Task | Effort | Notes |
|------|--------|-------|
| Design escrow contract or proving scheme | 30m | See docs/future-gasless-onboarding.md |
| Merkle proof: CTF Transfer event -> merkle tree -> root on Tempo | 1.5hr | You've built this before for t1 |
| On-chain verification contract on Tempo | 1hr | Verify merkle proof of Polygon delivery |

### Polish

| Task | Effort | Notes |
|------|--------|-------|
| Agent demo: Claude via MPP searches markets, recommends, buys | 30m | |
| Landing page with live endpoint tester | 30m | |

---

## Architecture

```
src/
  lib/
    tempo.ts          -- chain config (12 lines)
    mpp.ts            -- MPP server setup (12 lines)
    polymarket.ts     -- Gamma API + CLOB client + CTF transfer
  app/
    api/
      polymarket/     -- GET: search markets (MPP-gated)
      buy-position/   -- POST: solver endpoint (MPP-gated)
    page.tsx          -- landing page
scripts/
  setup-solver.ts     -- one-time Polygon approvals
  check-solver.ts     -- verify balances + approvals
  test-clob.ts        -- test CLOB auth
  test-buy.ts         -- test real order
  test-transfer.ts    -- test CTF transfer
docs/
  future-gasless-onboarding.md  -- ideas for trustless UX
```

---

## Key Docs

- [MPP](https://mpp.dev) / [mppx](https://github.com/wevm/mppx)
- [Tempo mainnet](https://docs.tempo.xyz) -- chain ID 4217
- [Polymarket CLOB](https://docs.polymarket.com)
- [Polymarket Gamma API](https://gamma-api.polymarket.com) -- market data (public)
- [CTF / Gnosis Conditional Tokens](https://docs.gnosis.io/conditionaltokens/) -- ERC1155

---

## Demo Script (2 min)

1. "Prediction markets are one of the most useful data sources for AI -- but an agent can't buy a position today. The market is on Polygon, the agent's wallet is on Tempo, and there's no bridge for intent execution."
2. `tempo request -t -X GET "https://HOST/api/polymarket?q=bitcoin"` -- show data + payment
3. "Now the interesting part. I want to buy a YES position. I'm paying on Tempo. The position is on Polygon."
4. `tempo request -t -X POST --json '{"token_id":"...","amount_usd":5,"recipient_polygon":"0x5BcfE51cb7fDA9cf2c91B1948916ff29bee72600"}' "https://HOST/api/buy-position"`
5. Show CTF tokens arriving in Polymarket portfolio. Show the Polygonscan tx link.
6. "Every step is verifiable on-chain. Today the solver is trusted. When Tempo ships the enshrined escrow precompile that Georgios mentioned, this becomes trustless -- the solver posts a merkle proof of the CTF transfer, verified on Tempo. I've built this exact proof system before."
