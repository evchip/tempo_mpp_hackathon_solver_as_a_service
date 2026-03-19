"use client";

export default function Home() {
  return (
    <main style={{ maxWidth: 680, margin: "60px auto", padding: "0 24px", color: "#e0e0e0" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4, color: "#fff" }}>Act on any chain. Pay on one.</h1>
      <p style={{ color: "#888", marginBottom: 40, fontSize: 15 }}>
        Buy prediction market positions cross-chain. Pay on Tempo, receive on Polygon.
        No bridging. No multi-chain wallet. One API call.
      </p>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 16 }}>How it works</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <FlowStep
            number={1}
            chain="Tempo"
            title="User deposits USDC into escrow"
            detail="Funds are locked on-chain. Refundable if the solver doesn't fill by the deadline."
            color="#3b82f6"
          />
          <Connector />
          <FlowStep
            number={2}
            chain="Tempo"
            title="User calls the solver via MPP"
            detail="Pays a $0.50 service fee. Passes the escrow order ID and their Polygon address."
            color="#3b82f6"
          />
          <Connector />
          <FlowStep
            number={3}
            chain="Polygon"
            title="Solver buys CTF on Polymarket"
            detail="Places a market order on the Polymarket CLOB. Waits for settlement."
            color="#8b5cf6"
          />
          <Connector />
          <FlowStep
            number={4}
            chain="Polygon"
            title="Solver transfers CTF to user"
            detail="ERC1155 transfer to the user's Polygon address. Verifiable on Polygonscan."
            color="#8b5cf6"
          />
          <Connector />
          <FlowStep
            number={5}
            chain="Polygon → Tempo"
            title="Solver proves delivery"
            detail="Verifies the Polygon transfer, appends to a merkle tree, posts the root on Tempo."
            color="#f59e0b"
          />
          <Connector />
          <FlowStep
            number={6}
            chain="Tempo"
            title="Solver claims from escrow"
            detail="Submits a merkle proof on-chain. Escrow verifies and releases USDC to the solver."
            color="#3b82f6"
          />
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <pre style={{ background: "#111", padding: 20, borderRadius: 8, fontSize: 11, overflow: "auto", color: "#999", lineHeight: 1.6 }}>
{`  User (Tempo)                Solver Service              Polygon
  ───────────                 ──────────────              ───────
       │                            │                        │
       │  deposit(USDC)             │                        │
       ├───────────► Escrow         │                        │
       │             (locked)       │                        │
       │                            │                        │
       │  POST /api/buy-position    │                        │
       ├────────────────────────────►                        │
       │     (pays $0.50 via MPP)   │                        │
       │                            │  buy on CLOB           │
       │                            ├───────────────────────►│
       │                            │                        │
       │                            │  transfer CTF to user  │
       │                            ├───────────────────────►│
       │                            │                        │
       │                            │  verify tx receipt     │
       │                            ├── ── ── ── ── ── ── ─►│
       │                            │                        │
       │                            │  build merkle tree     │
       │                            │  post root to escrow   │
       │                            ├───────────► Escrow     │
       │                            │             (root)     │
       │                            │                        │
       │                            │  claimWithProof()      │
       │                            ├───────────► Escrow     │
       │                            │         verify proof   │
       │                            │◄──────── USDC released │
       │                            │                        │`}
        </pre>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 24 }}>Trust model</h2>

        <TrustBlock
          subtitle="Funds locked until proven"
          gif="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTZ4Ym55ZG55YzE4NHZ4d2dxbHlyeGtyc2VvajJqYjBobGE5NTd0eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LtQLmuR22JeFy/giphy.gif"
        >
          Neither side trusts the other. The user's USDC is locked in escrow on Tempo.
          The solver can only claim it by submitting a merkle proof that passes on-chain verification.
          If the solver doesn't fill the order by the deadline, the user
          calls <code style={{ color: "#ccc" }}>refund()</code> and gets their USDC back.
          The solver only acts because the escrowed funds are guaranteed if they deliver.
        </TrustBlock>

        <TrustBlock
          subtitle="Verified on Polygon, proven on Tempo"
          gif="https://media.giphy.com/media/3o7btNa0RUYa5E7iiQ/giphy.gif"
        >
          The solver constructs a merkle leaf from the escrow order ID and the Polygon transaction hash
          of the CTF transfer. Before the leaf is added to the tree, the service fetches the Polygon
          transaction receipt and verifies it: the tx must contain
          a <code style={{ color: "#ccc" }}>TransferSingle</code> event on the CTF contract, the recipient
          must match the address committed in the escrow order, and the correct token must have been transferred.
          Only verified transfers are included in the tree.
        </TrustBlock>

        <TrustBlock
          subtitle="Cryptographic, not optimistic"
          gif="https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif"
        >
          The merkle root is posted on-chain to the escrow contract on Tempo.
          When the solver calls <code style={{ color: "#ccc" }}>claimWithProof()</code>, the
          contract recomputes the leaf from the provided order ID and Polygon tx hash,
          verifies its inclusion in the committed root, and releases USDC if valid.
          No challenge period. No oracle committee. The proof is the settlement.
        </TrustBlock>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>API</h2>
        <Endpoint
          method="GET"
          path="/api/polymarket?q=bitcoin"
          cost="0.10"
          description="Search Polymarket markets. Returns token IDs, prices, liquidity."
        />
        <Endpoint
          method="POST"
          path="/api/advisor"
          cost="0.25"
          description="LLM market advisor. Claude analyzes markets via Anthropic MPP and recommends trades with deposit params."
        />
        <Endpoint
          method="POST"
          path="/api/buy-position"
          cost="0.50"
          description="Fill an escrow order. Buys CTF, transfers to user, proves delivery, posts root."
        />
        <Endpoint
          method="GET"
          path="/api/proof?orderId=0x..."
          cost="free"
          description="Retrieve the merkle proof for an escrow claim."
        />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Contracts</h2>
        <div style={{ background: "#111", borderRadius: 8, padding: 16, fontSize: 13 }}>
          <ContractRow
            label="PolymarketEscrow"
            address="0x7331A38bAa80aa37d88D893Ad135283c34c40370"
            explorer="https://explore.tempo.xyz/address/0x7331A38bAa80aa37d88D893Ad135283c34c40370"
            chain="Tempo"
          />
          <ContractRow
            label="CTF (Polymarket)"
            address="0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
            explorer="https://polygonscan.com/address/0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
            chain="Polygon"
          />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 8 }}>Merkle proof format</h2>
        <p style={{ color: "#999", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          Binary merkle tree. The proof is concatenated 32-byte sibling hashes.
          The leaf index determines left/right ordering at each level.
          Verified on-chain by WithdrawTrieVerifier (59 lines, no dependencies).
        </p>
        <pre style={{ background: "#111", padding: 16, borderRadius: 8, fontSize: 11, overflow: "auto", color: "#999" }}>
{`leaf = keccak256(
  abi.encodePacked(
    keccak256(abi.encodePacked(orderId, polygonTxHash)),
    orderId
  )
)`}
        </pre>
      </section>
    </main>
  );
}

function FlowStep({ number, chain, title, detail, color }: {
  number: number; chain: string; title: string; detail: string; color: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        minWidth: 28, height: 28, borderRadius: 14,
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 600,
      }}>
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ color: "#fff", fontSize: 14 }}>{title}</span>
          <span style={{ color: color, fontSize: 11, opacity: 0.7 }}>{chain}</span>
        </div>
        <p style={{ color: "#666", fontSize: 12, margin: 0 }}>{detail}</p>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div style={{ marginLeft: 13, width: 2, height: 16, background: "#333" }} />
  );
}

function Endpoint({ method, path, cost, description }: {
  method: string; path: string; cost: string; description: string;
}) {
  return (
    <div style={{ background: "#111", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <code>
          <span style={{ color: "#4ade80" }}>{method}</span> {path}
        </code>
        <span style={{ color: "#888" }}>{cost} USDC</span>
      </div>
      <div style={{ color: "#666", fontSize: 12 }}>{description}</div>
    </div>
  );
}

function TrustBlock({ subtitle, gif, children }: {
  subtitle: string; gif: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <img
        src={gif}
        alt=""
        style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: "8px 8px 0 0", opacity: 0.6 }}
      />
      <div style={{ background: "#111", borderRadius: "0 0 8px 8px", padding: 16 }}>
        <h3 style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600, margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: 1 }}>
          {subtitle}
        </h3>
        <p style={{ color: "#999", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function ContractRow({ label, address, explorer, chain }: {
  label: string; address: string; explorer: string; chain: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ color: "#ccc" }}>{label}</span>
        <span style={{ color: "#555", fontSize: 12 }}>{chain}</span>
      </div>
      <a
        href={explorer}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#3b82f6", fontSize: 12, textDecoration: "none" }}
      >
        <code>{address}</code>
      </a>
    </div>
  );
}
