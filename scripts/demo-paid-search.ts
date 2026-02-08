#!/usr/bin/env npx tsx
/**
 * Buyer demo script for micropaid search.
 *
 * Uses @x402/fetch to automatically handle the 402 → pay → retry flow:
 *   1. Hits GET /api/search?q=...
 *   2. Gets back HTTP 402 with PAYMENT-REQUIRED header
 *   3. @x402/fetch parses the challenge, signs an EIP-3009 USDC
 *      TransferWithAuthorization, and retries with PAYMENT-SIGNATURE header
 *   4. Server verifies + settles via facilitator, returns search results
 *
 * Prerequisites:
 *   - BUYER_PRIVATE_KEY in .env.local (hex, 0x-prefixed)
 *   - Wallet must hold USDC on Base Sepolia (get from faucet)
 *   - Next.js dev server running on localhost:3000
 *
 * Usage:
 *   npx tsx scripts/demo-paid-search.ts "your search query"
 */

import "dotenv/config";

async function main() {
  // --- Dynamic imports (ESM-only packages) ---
  const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
  const { registerExactEvmScheme } = await import("@x402/evm/exact/client");
  const { privateKeyToAccount } = await import("viem/accounts");

  // --- Config ---
  const privateKey = process.env.BUYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "ERROR: Set BUYER_PRIVATE_KEY in .env.local (hex string, 0x-prefixed).\n" +
        "This wallet needs USDC on Base Sepolia. Get testnet USDC from:\n" +
        "  https://faucet.circle.com/"
    );
    process.exit(1);
  }

  const query = process.argv[2] || "latest AI news";
  const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
  const endpoint = `${baseUrl}/api/search?q=${encodeURIComponent(query)}`;

  // --- Set up x402 buyer client ---
  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Buyer wallet: ${signer.address}`);

  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // --- Step 1: Show what an unpaid request looks like ---
  console.log("\n--- Step 1: Unpaid request ---");
  console.log(`GET ${endpoint}`);

  const unpaidRes = await fetch(endpoint);
  console.log(`Status: ${unpaidRes.status}`);

  const paymentRequired = unpaidRes.headers.get("payment-required");
  if (paymentRequired) {
    const decoded = JSON.parse(
      Buffer.from(paymentRequired, "base64").toString()
    );
    console.log("Payment challenge:", JSON.stringify(decoded, null, 2));
  }

  // --- Step 2: Paid request (automatic 402 handling) ---
  console.log("\n--- Step 2: Paid request (x402 auto-pay) ---");
  console.log(`GET ${endpoint} [with x402 payment]`);

  const paidRes = await fetchWithPayment(endpoint);
  console.log(`Status: ${paidRes.status}`);

  // Show settlement receipt
  const paymentResponse = paidRes.headers.get("payment-response");
  if (paymentResponse) {
    const receipt = JSON.parse(
      Buffer.from(paymentResponse, "base64").toString()
    );
    console.log("Settlement receipt:", JSON.stringify(receipt, null, 2));
  }

  // Show search results
  const data = await paidRes.json();
  console.log("\nSearch results:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
