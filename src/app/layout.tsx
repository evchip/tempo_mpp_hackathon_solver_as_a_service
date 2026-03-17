import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Prepaid Card | Tempo x Kalshi",
  description: "Give an AI agent a spending limit. Watch it spend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "monospace", background: "#0a0a0a", color: "#e5e5e5", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
