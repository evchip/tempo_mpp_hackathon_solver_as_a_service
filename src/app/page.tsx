"use client";

export default function Home() {
  return (
    <main style={{ maxWidth: 680, margin: "60px auto", padding: "0 24px", color: "#e0e0e0" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4, color: "#fff" }}>Solver as a Service</h1>
      <p style={{ color: "#888", marginBottom: 20, fontSize: 15 }}>
        Buy prediction market positions cross-chain. Pay on Tempo, receive on Polygon.
        No bridging. No multi-chain wallet. One API call.
      </p>

      <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 40, fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>Install on your agent</span>
          <a
            href="https://www.mppscan.com/server/dd88037a9ad0e4894716f361aba3282828a3ab7184fd8374ab254cbca92b08df"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3b82f6", fontSize: 11, textDecoration: "none" }}
          >
            view on mppscan
          </a>
        </div>
        <CopyBlock>
{`npx agentcash add https://solverasaservice-production.up.railway.app`}
        </CopyBlock>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 16 }}>How it works</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <FlowStep
            number={1}
            chain="Tempo"
            title="Ask the advisor"
            detail="POST /api/advisor with a search query. Claude (via Anthropic MPP) analyzes markets and returns a trade recommendation with ready-to-paste CLI commands."
            color="#10b981"
          />
          <Connector />
          <FlowStep
            number={2}
            chain="Tempo"
            title="Deposit USDC into escrow"
            detail="Lock your position funds on-chain. Refundable if the solver doesn't fill by the deadline."
            color="#3b82f6"
          />
          <Connector />
          <FlowStep
            number={3}
            chain="Tempo → Polygon"
            title="Solver fills the order"
            detail="One API call. The solver buys CTF on Polymarket, transfers to your Polygon address, verifies the transfer, builds a merkle proof, posts the root on-chain, and claims from escrow. Full settlement."
            color="#f59e0b"
          />
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Quick start</h2>
        <div style={{ background: "#111", borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.8 }}>
          <p style={{ color: "#999", margin: "0 0 12px 0" }}>
            <strong style={{ color: "#ccc" }}>Prerequisites:</strong>{" "}
            <a href="https://docs.tempo.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>Tempo CLI</a> installed,{" "}
            <a href="https://book.getfoundry.sh" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>Foundry (cast)</a> installed,{" "}
            funded Tempo passkey wallet (<code style={{ color: "#ccc" }}>tempo wallet login</code>).
          </p>
          <Step n={1} title="Get a recommendation" copyable>
{`tempo request -X POST --json '{"query":"bitcoin","budget_usd":5}' https://solverasaservice-production.up.railway.app/api/advisor`}
          </Step>
          <Step n={2} title="Execute the commands">
{`# Paste the full advisor response to your LLM (Claude Code, Cursor, etc.)
# and ask it to execute the next_steps commands.
# Or run them manually — they're ready to copy-paste.`}
          </Step>
          <Step n={3} title="Done">
{`# Your position appears in your Polygon wallet.
# If you used your Polymarket Safe address, it shows in the Polymarket UI.`}
          </Step>
        </div>
        <div style={{ marginTop: 12, background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 8, padding: 12, fontSize: 12 }}>
          <p style={{ color: "#999", margin: 0 }}>
            <strong style={{ color: "#fff" }}>Use your Polymarket Safe address</strong> as the recipient so the position shows in the Polymarket UI.
            Find it at <a href="https://polymarket.com/portfolio" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>polymarket.com/portfolio</a>.
            {" "}<strong style={{ color: "#fff" }}>Keep amounts small</strong> ($1-5 USDC). The solver has limited liquidity.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>API</h2>
        <Endpoint
          method="GET"
          path="/api/polymarket?q=bitcoin"
          cost="0.10"
          description="Search Polymarket markets. Returns token IDs, prices, liquidity."
          command={`tempo request -X GET "https://solverasaservice-production.up.railway.app/api/polymarket?q=bitcoin"`}
        />
        <Endpoint
          method="POST"
          path="/api/advisor"
          cost="0.25"
          description="LLM market advisor. Claude analyzes markets via Anthropic MPP and recommends trades with deposit params."
          command={`tempo request -X POST --json '{"query":"bitcoin","budget_usd":5}' https://solverasaservice-production.up.railway.app/api/advisor`}
        />
        <Endpoint
          method="POST"
          path="/api/buy-position"
          cost="0.50"
          description="Fill an escrow order. Buys CTF, transfers to user, verifies, proves, settles. One call."
          command={`tempo request -X POST --json '{"order_id":"$ORDER_ID","recipient_polygon":"$RECIPIENT"}' https://solverasaservice-production.up.railway.app/api/buy-position`}
        />
        <Endpoint
          method="GET"
          path="/api/proof?orderId=0x..."
          cost="free"
          description="Merkle proof for a fulfilled order."
          command={`curl "https://solverasaservice-production.up.railway.app/api/proof?orderId=$ORDER_ID"`}
        />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Refund</h2>
        <div style={{ background: "#111", borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ color: "#999", margin: "0 0 12px 0" }}>
            If the solver doesn't fill your order, your funds are safe. After the deadline (1 hour),
            call <code style={{ color: "#ccc" }}>refund()</code> to get your USDC back:
          </p>
          <CopyBlock>
{`cast send --rpc-url https://rpc.tempo.xyz --tempo.access-key $USER_KEY --tempo.root-account $USER_WALLET --tempo.fee-token 0x20c000000000000000000000b9537d11c60e8b50 0x7331A38bAa80aa37d88D893Ad135283c34c40370 "refund(bytes32)" $ORDER_ID`}
          </CopyBlock>
        </div>
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
        <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Contracts</h2>
        <div style={{ background: "#111", borderRadius: 8, padding: 16, fontSize: 13 }}>
          <ContractRow
            label="PolymarketEscrow"
            address="0x7331A38bAa80aa37d88D893Ad135283c34c40370"
            explorer="https://explore.tempo.xyz/address/0x7331A38bAa80aa37d88D893Ad135283c34c40370"
            chain="Tempo (4217)"
          />
          <ContractRow
            label="CTF (Polymarket)"
            address="0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
            explorer="https://polygonscan.com/address/0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
            chain="Polygon (137)"
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

function CopyBlock({ children }: { children: string }) {
  return (
    <div style={{ position: "relative" }}>
      <pre style={{ background: "#0a0a0a", padding: 8, paddingRight: 40, borderRadius: 4, fontSize: 11, overflow: "auto", margin: 0 }}>
        {children}
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(children.trim())}
        style={{
          position: "absolute", top: 4, right: 4,
          background: "#333", border: "none", borderRadius: 4,
          color: "#999", cursor: "pointer", padding: "2px 6px", fontSize: 10,
        }}
      >
        copy
      </button>
    </div>
  );
}

function Step({ n, title, copyable, children }: { n: number; title: string; copyable?: boolean; children: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: "#ccc", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "#f59e0b" }}>{n}.</span> {title}
      </div>
      {copyable ? (
        <CopyBlock>{children}</CopyBlock>
      ) : (
        <pre style={{ background: "#0a0a0a", padding: 8, borderRadius: 4, fontSize: 11, overflow: "auto", margin: 0 }}>
          {children}
        </pre>
      )}
    </div>
  );
}

function Endpoint({ method, path, cost, description, command }: {
  method: string; path: string; cost: string; description: string; command?: string;
}) {
  return (
    <div style={{ background: "#111", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <code>
          <span style={{ color: "#4ade80" }}>{method}</span> {path}
        </code>
        <span style={{ color: "#888" }}>{cost} USDC</span>
      </div>
      <div style={{ color: "#666", fontSize: 12, marginBottom: command ? 8 : 0 }}>{description}</div>
      {command && <CopyBlock>{command}</CopyBlock>}
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
