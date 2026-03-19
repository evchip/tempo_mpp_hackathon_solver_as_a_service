// GET /openapi.json
// OpenAPI discovery document for mppscan and AgentCash

export async function GET() {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000";

  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Solver as a Service",
      version: "1.0.0",
      description:
        "Cross-chain prediction market solver. Pay on Tempo, get a Polymarket position on Polygon. Escrow-based settlement with merkle proof verification.",
      guidance:
        "Use POST /api/advisor to get AI-powered market recommendations with ready-to-use deposit commands. Use GET /api/polymarket to search markets by keyword. Use POST /api/buy-position to fill an escrow order. Use GET /api/proof to retrieve merkle proofs for escrow claims.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/polymarket": {
        get: {
          operationId: "searchMarkets",
          summary: "Search Polymarket prediction markets",
          tags: ["Markets"],
          "x-payment-info": {
            pricingMode: "fixed",
            price: "0.100000",
            protocols: ["mpp"],
            authMode: "payment",
          },
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string", description: "Search query (e.g. 'bitcoin', 'trump', 'election')" },
              description: "Search query (e.g. 'bitcoin', 'trump', 'election')",
            },
            {
              name: "condition_id",
              in: "query",
              required: false,
              schema: { type: "string", description: "Specific market condition ID" },
              description: "Specific market condition ID",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 10, description: "Max results to return" },
              description: "Max results to return",
            },
          ],
          responses: {
            "200": {
              description: "Array of matching markets with token IDs, prices, volume, and liquidity",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        yesTokenId: { type: "string" },
                        noTokenId: { type: "string" },
                        yesPrice: { type: "number" },
                        noPrice: { type: "number" },
                        volume: { type: "number" },
                        liquidity: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/api/advisor": {
        post: {
          operationId: "getTradeRecommendation",
          summary: "AI-powered market advisor using Claude via Anthropic MPP",
          tags: ["Advisor"],
          "x-payment-info": {
            pricingMode: "fixed",
            price: "0.250000",
            protocols: ["mpp"],
            authMode: "payment",
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      minLength: 1,
                      description: "Market search query (e.g. 'bitcoin', 'AI', 'elections')",
                    },
                    budget_usd: {
                      type: "number",
                      default: 5,
                      description: "Budget in USD for the trade",
                    },
                  },
                  required: ["query"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Trade recommendation with deposit parameters and next-step commands",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      recommendation: { type: "string" },
                      market: { type: "string" },
                      side: { type: "string", enum: ["YES", "NO"] },
                      price: { type: "number" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                      deposit_params: { type: "object" },
                      next_steps: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/api/buy-position": {
        post: {
          operationId: "fillOrder",
          summary: "Fill an escrow order - solver buys CTF on Polymarket and proves delivery",
          tags: ["Solver"],
          "x-payment-info": {
            pricingMode: "fixed",
            price: "0.500000",
            protocols: ["mpp"],
            authMode: "payment",
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    order_id: {
                      type: "string",
                      description: "Escrow order ID (bytes32 hex). If provided, uses escrow flow.",
                    },
                    recipient_polygon: {
                      type: "string",
                      description: "Polygon address to receive CTF tokens",
                    },
                    token_id: {
                      type: "string",
                      description: "Polymarket token ID (for direct flow without escrow)",
                    },
                    amount_usd: {
                      type: "number",
                      description: "Amount in USD (for direct flow without escrow)",
                    },
                  },
                  required: ["recipient_polygon"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Order filled, CTF transferred, proof available",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      settlement: { type: "string" },
                      order_id: { type: "string" },
                      fill: { type: "object" },
                      transfer: { type: "object" },
                      proof_available: { type: "string" },
                    },
                  },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/api/proof": {
        get: {
          operationId: "getProof",
          summary: "Get merkle proof for escrow settlement",
          tags: ["Proof"],
          "x-payment-info": {
            authMode: "none",
          },
          parameters: [
            {
              name: "orderId",
              in: "query",
              required: true,
              schema: { type: "string", description: "Escrow order ID (bytes32 hex)" },
              description: "Escrow order ID (bytes32 hex)",
            },
          ],
          responses: {
            "200": {
              description: "Merkle proof data for claiming from escrow",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchIndex: { type: "integer" },
                      position: { type: "integer" },
                      proof: { type: "string" },
                      polygonTxHash: { type: "string" },
                      root: { type: "string" },
                    },
                  },
                },
              },
            },
            "404": { description: "No proof available for this order" },
          },
        },
      },
    },
  });
}
