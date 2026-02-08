/**
 * GET /api/search?q=<query>
 *
 * x402-gated micropaid web search endpoint.
 *
 * Flow:
 *   1. Validate query parameter
 *   2. Check for PAYMENT-SIGNATURE header
 *   3. If missing  → 402 with x402 challenge
 *   4. If present  → verify with facilitator
 *   5. If valid    → execute search
 *   6. Settle payment on-chain via facilitator
 *   7. Return results with ERC-8004 identity + PAYMENT-RESPONSE header
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  extractPaymentSignature,
  send402,
  verifyPayment,
  settlePayment,
  encodePaymentResponse,
} from "@/lib/x402";
import { executeSearch } from "@/lib/search";
import { getAgentIdentity } from "@/lib/identity";

const RESOURCE = "/api/search";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- 1. Validate query ---
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    return res.status(400).json({ error: "Missing required query parameter: q" });
  }

  // --- 2. Check for x402 payment ---
  const paymentSig = extractPaymentSignature(req);

  if (!paymentSig) {
    // No payment → return 402 challenge
    return send402(res, RESOURCE);
  }

  // --- 3. Verify the payment with the facilitator ---
  const verification = await verifyPayment(paymentSig, RESOURCE);
  if (!verification.valid) {
    // Invalid payment → fresh 402 challenge
    console.warn("[search] Payment verification failed:", verification.error);
    return send402(res, RESOURCE);
  }

  // --- 4. Execute the search (only after payment is verified) ---
  const { results, search_mode } = await executeSearch(q);

  // --- 5. Settle the payment on-chain ---
  const settlement = await settlePayment(paymentSig, RESOURCE);

  if (settlement.success) {
    res.setHeader("PAYMENT-RESPONSE", encodePaymentResponse(settlement));
  } else {
    // Settlement failed — still return results since payment was verified,
    // but log the error for debugging
    console.error("[search] Settlement failed:", settlement.errorReason);
  }

  // --- 6. Return search results ---
  return res.status(200).json({
    query: q,
    results,
    pricing: {
      currency: "USDC",
      amount: "0.002",
      unit: "per_request",
    },
    provider: "micropaid-search-api",
    search_mode,
    agent_identity: getAgentIdentity(),
    ...(settlement.transaction
      ? { payment: { transaction: settlement.transaction, payer: settlement.payer } }
      : {}),
  });
}
