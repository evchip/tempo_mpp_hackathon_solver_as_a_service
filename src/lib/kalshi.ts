// Kalshi REST API client (sandbox: demo-api.kalshi.co)
// Docs: https://trading-api.readme.io/reference/getting-started
// Auth: KALSHI_API_KEY_ID + KALSHI_API_KEY (ECDSA signed headers)

const BASE_URL = process.env.KALSHI_BASE_URL ?? "https://demo-api.kalshi.co/trade-api/v2";

// TODO day-of: Kalshi uses ECDSA P-256 signed requests, not Bearer tokens
// See: https://trading-api.readme.io/reference/authentication
// You'll need to sign the request path + timestamp with your API private key
async function kalshiHeaders(): Promise<HeadersInit> {
  return {
    "Content-Type": "application/json",
    // TODO: Add ECDSA auth headers here
    // "KALSHI-ACCESS-KEY": process.env.KALSHI_API_KEY_ID,
    // "KALSHI-ACCESS-SIGNATURE": ...,
    // "KALSHI-ACCESS-TIMESTAMP": ...,
  };
}

export interface KalshiMarket {
  ticker: string;
  title: string;
  yes_bid: number;  // cents
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  close_time: string;
  status: string;
}

// Search for markets matching a query string
export async function searchMarkets(query: string, limit = 5): Promise<KalshiMarket[]> {
  const params = new URLSearchParams({ limit: String(limit), status: "open" });
  const res = await fetch(`${BASE_URL}/markets?${params}`, {
    headers: await kalshiHeaders(),
  });
  if (!res.ok) throw new Error(`Kalshi markets fetch failed: ${res.status}`);
  const data = await res.json();
  // Filter by relevance to query (basic string match - improve on day-of)
  return (data.markets ?? []).filter((m: KalshiMarket) =>
    m.title.toLowerCase().includes(query.toLowerCase())
  );
}

// Get a single market by ticker
export async function getMarket(ticker: string): Promise<KalshiMarket> {
  const res = await fetch(`${BASE_URL}/markets/${ticker}`, {
    headers: await kalshiHeaders(),
  });
  if (!res.ok) throw new Error(`Kalshi market fetch failed: ${res.status}`);
  return (await res.json()).market;
}

export interface OrderParams {
  ticker: string;
  side: "yes" | "no";
  count: number;       // number of contracts
  type: "limit" | "market";
  yes_price?: number;  // cents, required for limit orders
}

// Place an order on Kalshi sandbox
export async function placeOrder(params: OrderParams) {
  const res = await fetch(`${BASE_URL}/portfolio/orders`, {
    method: "POST",
    headers: await kalshiHeaders(),
    body: JSON.stringify({
      ticker: params.ticker,
      side: params.side,
      count: params.count,
      type: params.type,
      yes_price: params.yes_price,
      action: "buy",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kalshi order failed: ${res.status} ${err}`);
  }
  return res.json();
}
