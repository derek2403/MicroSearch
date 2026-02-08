/**
 * GET /api/demo-search?q=<query>
 *
 * Frontend demo endpoint — performs the full x402 buyer flow server-side
 * using BUYER_PRIVATE_KEY from env, then returns the paid search results.
 *
 * This lets the frontend demonstrate the full pay-per-search flow
 * without needing a browser wallet.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  const privateKey = process.env.BUYER_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({
      error: "BUYER_PRIVATE_KEY not set in .env.local — cannot demo payment flow",
    });
  }

  try {
    // Dynamic imports — these are ESM-only packages
    const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");
    const { privateKeyToAccount } = await import("viem/accounts");

    // Build the x402 buyer client
    const signer = privateKeyToAccount(privateKey as `0x${string}`);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer });
    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    // Determine the search endpoint URL
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || "localhost:3000";
    const searchUrl = `${protocol}://${host}/api/search?q=${encodeURIComponent(q)}`;

    // Make the paid request — x402Client handles 402 → sign → retry
    const paidRes = await fetchWithPayment(searchUrl);

    const data = await paidRes.json();

    // Forward the payment response header if present
    const paymentResponse = paidRes.headers.get("payment-response");

    return res.status(paidRes.status).json({
      ...data,
      _demo: {
        buyer: signer.address,
        paymentSettled: !!paymentResponse,
        ...(paymentResponse
          ? {
              receipt: JSON.parse(
                Buffer.from(paymentResponse, "base64").toString()
              ),
            }
          : {}),
      },
    });
  } catch (err) {
    console.error("[demo-search] Error:", err);
    return res.status(500).json({
      error: "Demo payment flow failed",
      message: (err as Error).message,
    });
  }
}
