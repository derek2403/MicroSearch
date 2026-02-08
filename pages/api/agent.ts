/**
 * GET /api/agent
 *
 * Returns service metadata and ERC-8004 agent identity.
 * No payment required — this is the discovery endpoint.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getAgentIdentity } from "@/lib/identity";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    name: "Micropaid Search API",
    description:
      "Pay-per-query web search via x402. Agent identity via ERC-8004.",
    version: "0.1.0",
    pricing: {
      currency: "USDC",
      amount: "0.002",
      unit: "per_request",
      network: process.env.X402_NETWORK || "eip155:84532",
    },
    endpoints: {
      search: "GET /api/search?q=<query>",
      agent: "GET /api/agent",
    },
    agent_identity: getAgentIdentity(),
  });
}
