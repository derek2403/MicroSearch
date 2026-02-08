/**
 * x402 server-side payment helpers.
 *
 * Implements the Coinbase x402 v2 seller flow:
 *   1. Build PaymentRequired challenge for 402 responses
 *   2. Verify payment signatures via the facilitator
 *   3. Settle payments on-chain via the facilitator
 *
 * Uses direct HTTP to the x402 facilitator REST API for maximum
 * compatibility with Next.js Pages Router (Node runtime).
 */
import type { NextApiRequest, NextApiResponse } from "next";

// ---------------------------------------------------------------------------
// Configuration (from env)
// ---------------------------------------------------------------------------
const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const PAY_TO = process.env.X402_PAY_TO_ADDRESS || "";
const NETWORK = process.env.X402_NETWORK || "eip155:84532"; // Base Sepolia
const ASSET_ADDRESS =
  process.env.X402_ASSET_ADDRESS ||
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // USDC on Base Sepolia
// $0.002 in USDC base units (6 decimals) = 2000
const PRICE_UNITS = "2000";

// ---------------------------------------------------------------------------
// Types — x402 v2 PaymentRequired schema
// ---------------------------------------------------------------------------
export interface PaymentRequirementsV2 {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequiredV2 {
  x402Version: 2;
  resource: ResourceInfo;
  accepts: PaymentRequirementsV2[];
  error?: string;
}

export interface SettlementResult {
  success: boolean;
  transaction?: string;
  payer?: string;
  network?: string;
  errorReason?: string;
}

// ---------------------------------------------------------------------------
// Build the v2 payment requirements for a given resource path
// ---------------------------------------------------------------------------
export function buildPaymentRequired(resource: string): PaymentRequiredV2 {
  return {
    x402Version: 2,
    resource: {
      url: resource,
      description: "Micropaid web search — $0.002 per query",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: PRICE_UNITS,
        asset: ASSET_ADDRESS,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: {
          // EIP-712 domain params for USDC — required by @x402/evm to sign
          // the EIP-3009 TransferWithAuthorization
          name: "USD Coin",
          version: "2",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Send a 402 Payment Required response with the x402 challenge
// ---------------------------------------------------------------------------
export function send402(res: NextApiResponse, resource: string): void {
  const paymentRequired = buildPaymentRequired(resource);
  const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
    "base64"
  );

  // x402 v2 headers
  res.setHeader("PAYMENT-REQUIRED", encoded);
  res.setHeader(
    "WWW-Authenticate",
    `x402 facilitator="${FACILITATOR_URL}"`
  );

  res.status(402).json({
    ...paymentRequired,
    error:
      "Payment required. Include PAYMENT-SIGNATURE header with a valid x402 payment.",
  });
}

// ---------------------------------------------------------------------------
// Extract the payment signature from the request headers
// ---------------------------------------------------------------------------
export function extractPaymentSignature(req: NextApiRequest): string | null {
  // v2 header
  const sig = req.headers["payment-signature"];
  if (typeof sig === "string" && sig.length > 0) return sig;
  // v1 fallback
  const v1 = req.headers["x-payment"];
  if (typeof v1 === "string" && v1.length > 0) return v1;
  return null;
}

// ---------------------------------------------------------------------------
// Verify a payment signature with the facilitator (no on-chain settlement)
// ---------------------------------------------------------------------------
export async function verifyPayment(
  paymentSignature: string,
  resource: string
): Promise<{ valid: boolean; payer?: string; error?: string }> {
  const paymentRequired = buildPaymentRequired(resource);

  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentSignature, "base64").toString("utf-8")
    );
  } catch {
    return { valid: false, error: "Invalid payment signature encoding" };
  }

  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: paymentRequired.accepts[0],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        valid: false,
        error: `Facilitator verify returned ${response.status}: ${text}`,
      };
    }

    const result = await response.json();
    if (!result.isValid) {
      return {
        valid: false,
        error: result.invalidReason || "Payment verification failed",
      };
    }

    return { valid: true, payer: result.payer };
  } catch (err) {
    return {
      valid: false,
      error: `Facilitator unreachable: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Settle a payment with the facilitator (executes the on-chain transfer)
// ---------------------------------------------------------------------------
export async function settlePayment(
  paymentSignature: string,
  resource: string
): Promise<SettlementResult> {
  const paymentRequired = buildPaymentRequired(resource);

  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentSignature, "base64").toString("utf-8")
    );
  } catch {
    return { success: false, errorReason: "Invalid payment signature encoding" };
  }

  try {
    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: paymentRequired.accepts[0],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        errorReason: `Facilitator settle returned ${response.status}: ${text}`,
      };
    }

    return await response.json();
  } catch (err) {
    return {
      success: false,
      errorReason: `Facilitator unreachable: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Encode a settlement result as the PAYMENT-RESPONSE header value
// ---------------------------------------------------------------------------
export function encodePaymentResponse(settlement: SettlementResult): string {
  return Buffer.from(JSON.stringify(settlement)).toString("base64");
}
