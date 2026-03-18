# Gasless Onboarding for CTF Recipients

## Problem

When the solver transfers CTF tokens to a user's Polygon EOA, the user cannot sell without:
1. MATIC for gas (one-time approval txs)
2. `setApprovalForAll` on CTF contract for all 3 exchange contracts (CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER)
3. A CLOB API key (derived from wallet signature, free)

## Ideal UX

Solver handles everything -- user just provides an address and receives a sellable position.

## Approaches

### EIP-7702 Delegation (best if Polygon supports it)
- User signs a one-time delegation allowing the solver to execute txs on their behalf
- Solver funds user's account with MATIC, then executes all 3 `setApprovalForAll` calls
- User's EOA temporarily delegates to solver's code
- Need to verify: does Polygon support EIP-7702? (Pectra upgrade)

### Solver-Operated Proxy
- Solver deploys a minimal proxy per user (or uses CREATE2 deterministic address)
- Proxy has approvals pre-set
- User receives CTF in the proxy, sells via CLOB with proxy as signer
- Downside: user doesn't "own" the proxy in the traditional sense

### Transfer to User's Polymarket Proxy
- If user already has a Polymarket account, they have a Safe proxy that's already approved
- Solver transfers CTF directly to that proxy address
- User sells from Polymarket UI with zero friction
- Downside: requires user to already have a Polymarket account

### Gas Sponsorship via Paymaster (ERC-4337)
- If user has a smart account (4337), solver can sponsor the approval txs via a paymaster
- User signs UserOps for approvals, solver pays gas
- Downside: requires user to have a 4337 wallet

### Tempo Enshrined Escrow (future)
- When Tempo ships the enshrined escrow precompile, the entire flow changes
- User commits USDC on Tempo, solver fills on Polygon, escrow releases on proof of delivery
- User never needs to touch Polygon directly -- the solver handles everything and the CTF stays in the solver's custody until the user redeems
- This is the cleanest UX: user interacts only with Tempo

## Current Demo Approach
Assume user has an existing funded EOA with Polymarket approvals, OR transfer to user's Polymarket proxy address. Gasless onboarding is a post-hackathon feature.
