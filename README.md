# Microsearch — Micropaid Web Search for Agents

Pay-per-query web search API using **x402** for real HTTP-native micropayments and **ERC-8004** for portable on-chain agent identity.

## How It Works

1. **Discover** — `GET /api/agent` returns service info, pricing, and ERC-8004 identity
2. **402 Challenge** — `GET /api/search?q=...` without payment returns HTTP 402 with an x402 payment challenge
3. **Pay** — Client signs an EIP-3009 USDC TransferWithAuthorization and retries with `PAYMENT-SIGNATURE` header
4. **Execute + Results** — Server verifies payment via facilitator, runs the search, settles on-chain, returns results with `PAYMENT-RESPONSE` settlement receipt header

## Setup

### 1. Install dependencies

```bash
# Main project (API + demo script)
npm install @x402/fetch @x402/evm @x402/core viem dotenv
npm install -D tsx

# Smart contracts (optional — only if deploying your own identity registry)
cd contracts && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:
- `X402_PAY_TO_ADDRESS` — your wallet address to receive payments
- `BUYER_PRIVATE_KEY` — a wallet with USDC on Base Sepolia (for the demo script)
- `SEARCH_PROVIDER` — `duckduckgo` (real search) or `stub` (fake results for testing)

**Getting testnet USDC:** Visit [faucet.circle.com](https://faucet.circle.com/) to get USDC on Base Sepolia.

### 3. Start the dev server

```bash
npm run dev
```

## Demo

### Unpaid request (shows 402 challenge)

```bash
curl -s http://localhost:3000/api/search?q=bitcoin | jq .
```

Returns HTTP 402 with the x402 payment challenge:
```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "maxAmountRequired": "2000",
    "payTo": "0x...",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "description": "Micropaid web search — $0.002 per query"
  }],
  "error": "Payment required. Include PAYMENT-SIGNATURE header with a valid x402 payment."
}
```

Check the response headers:
```bash
curl -sI "http://localhost:3000/api/search?q=bitcoin"
# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: <base64-encoded challenge>
# WWW-Authenticate: x402 facilitator="https://www.x402.org/facilitator"
```

### Paid request (full flow)

```bash
npx tsx scripts/demo-paid-search.ts "openai earnings"
```

This script:
1. Shows the unpaid 402 response
2. Uses `@x402/fetch` to automatically sign a USDC payment and retry
3. Prints the search results with settlement receipt

### Agent identity endpoint

```bash
curl -s http://localhost:3000/api/agent | jq .
```

Returns service metadata + ERC-8004 identity reference.

## API Reference

### `GET /api/search?q=<query>`

| Scenario | Status | Description |
|---|---|---|
| Missing `q` param | 400 | `{ "error": "Missing required query parameter: q" }` |
| No payment | 402 | x402 challenge in body + `PAYMENT-REQUIRED` header |
| Invalid payment | 402 | Fresh challenge |
| Valid payment | 200 | Search results + `PAYMENT-RESPONSE` settlement receipt header |

### `GET /api/agent`

Returns service metadata, pricing, and ERC-8004 agent identity. No payment required.

## Smart Contracts (Optional)

The `contracts/` directory contains a minimal ERC-8004 Identity Registry (ERC-721 based) built with Hardhat v2.

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network hardhat   # local
npx hardhat run scripts/deploy.ts --network baseSepolia  # testnet
```

The deploy script registers the first agent and prints the contract address + token ID to add to `.env.local`.

## ERC-8004 Integration

This project uses **identity-only** ERC-8004 integration (no reputation, validation, or on-chain writes from the API). Every successful search response includes an `agent_identity` object:

```json
{
  "agent_identity": {
    "standard": "ERC-8004",
    "chain": "base-sepolia",
    "contract": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    "tokenId": "1",
    "profileUrl": "https://www.8004scan.io/agents/base-sepolia/0x.../1"
  }
}
```

This links every API response to a verifiable on-chain agent identity that can be looked up on [8004scan.io](https://www.8004scan.io).

## Architecture

```
Client                          Server                         Facilitator
  |                               |                               |
  |-- GET /api/search?q=... ---->|                               |
  |<-- 402 + PAYMENT-REQUIRED ---|                               |
  |                               |                               |
  |  [sign EIP-3009 auth]        |                               |
  |                               |                               |
  |-- GET + PAYMENT-SIGNATURE -->|                               |
  |                               |-- POST /verify -------------->|
  |                               |<-- { isValid: true } ---------|
  |                               |                               |
  |                               |  [execute search]             |
  |                               |                               |
  |                               |-- POST /settle -------------->|
  |                               |<-- { success, txHash } -------|
  |                               |                               |
  |<-- 200 + PAYMENT-RESPONSE ---|                               |
```

## Tech Stack

- **Next.js** (Pages Router, Node runtime)
- **x402 v2** — HTTP-native micropayments (Coinbase)
- **ERC-8004** — On-chain agent identity
- **Hardhat v2** — Smart contract development
- **USDC on Base Sepolia** — Payment token (testnet)
