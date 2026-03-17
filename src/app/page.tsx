"use client";
import { useState } from "react";

// TODO day-of: replace with viem/wagmi wallet connection for Access Key grant
// For now: hardcode a test userAddress and skip the on-chain grant step to unblock service dev

export default function Home() {
  const [intent, setIntent] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [limit, setLimit] = useState<number | null>(null);

  // TODO: replace with real Access Key grant tx via viem
  async function grantAccessKey() {
    alert("TODO: sign KeyAuthorization with MetaMask to grant agent spending limit on Tempo");
  }

  async function runAgent() {
    setStatus("running");
    setResult(null);
    try {
      // TODO: use actual userAddress from connected wallet
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          userAddress: "0x0000000000000000000000000000000000000001", // TODO: real address
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setLimit(data.remainingLimit);
      setStatus("done");
    } catch (err) {
      setResult({ error: String(err) });
      setStatus("error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Agent Prepaid Card</h1>
      <p style={{ color: "#888", marginBottom: 40, fontSize: 14 }}>
        Give an AI agent a USDC spending limit on Tempo. Watch it buy market data and execute a Kalshi trade.
      </p>

      {/* Step 1: Grant Access Key */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: "#aaa", marginBottom: 12 }}>1. Grant spending limit</h2>
        <button onClick={grantAccessKey} style={btnStyle}>
          Approve 10 USDC.e · expires 1hr
        </button>
        {limit !== null && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#4ade80" }}>
            Remaining: {limit.toFixed(2)} USDC.e
          </div>
        )}
      </section>

      {/* Step 2: Submit intent */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: "#aaa", marginBottom: 12 }}>2. Submit intent</h2>
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder='e.g. "Bet 5 USDC on BTC above $90k by end of March"'
          style={inputStyle}
        />
        <button
          onClick={runAgent}
          disabled={!intent || status === "running"}
          style={{ ...btnStyle, marginTop: 8, opacity: !intent || status === "running" ? 0.4 : 1 }}
        >
          {status === "running" ? "Agent running..." : "Run Agent"}
        </button>
      </section>

      {/* Result */}
      {result && (
        <section>
          <h2 style={{ fontSize: 14, color: "#aaa", marginBottom: 12 }}>Result</h2>
          <pre style={{ background: "#111", padding: 16, borderRadius: 8, fontSize: 12, overflow: "auto" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  color: "#e5e5e5",
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  background: "#111",
  border: "1px solid #333",
  borderRadius: 8,
  color: "#e5e5e5",
  fontSize: 14,
  boxSizing: "border-box",
};
