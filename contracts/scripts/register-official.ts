/**
 * Register the Micropaid Search agent on the OFFICIAL ERC-8004 Identity Registry
 * on Base Sepolia so it appears on 8004scan.io.
 *
 * Usage: npx hardhat run scripts/register-official.ts --network baseSepolia
 */
import { ethers } from "hardhat";

// Official ERC-8004 Identity Registry on Base Sepolia
const OFFICIAL_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const REGISTER_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Registering agent with account:", deployer.address);

  // Build the agent registration metadata (ERC-8004 registration-v1 format)
  const agentMetadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Micropaid Search API",
    description:
      "Pay-per-query web search powered by x402 micropayments. " +
      "Each search costs $0.002 USDC on Base Sepolia. " +
      "Agent identity verified via ERC-8004.",
    services: [
      {
        name: "web",
        endpoint: "http://localhost:3000/api/agent",
      },
      {
        name: "x402",
        endpoint: "http://localhost:3000/api/search",
      },
    ],
    x402Support: true,
    active: true,
  };

  // Use data URI to store metadata on-chain (no IPFS needed for hackathon)
  const metadataJson = JSON.stringify(agentMetadata);
  const agentURI = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`;

  console.log("\nAgent metadata:");
  console.log(JSON.stringify(agentMetadata, null, 2));

  // Call register() on the official registry
  const registry = new ethers.Contract(OFFICIAL_REGISTRY, REGISTER_ABI, deployer);

  console.log("\nSubmitting registration tx...");
  const tx = await registry["register(string)"](agentURI);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);

  // Parse the Registered event to get the agent ID
  const registeredEvent = receipt?.logs.find((log: { topics: string[] }) => {
    try {
      return log.topics[0] === ethers.id("Registered(uint256,string,address)");
    } catch {
      return false;
    }
  });

  let agentId = "unknown";
  if (registeredEvent && "topics" in registeredEvent) {
    agentId = BigInt(registeredEvent.topics[1]).toString();
  }

  console.log("\n========================================");
  console.log("Agent registered on official ERC-8004 registry!");
  console.log("========================================");
  console.log("Registry:", OFFICIAL_REGISTRY);
  console.log("Agent ID:", agentId);
  console.log("Tx hash:", tx.hash);
  console.log(
    "View on 8004scan:",
    `https://www.8004scan.io/agents/base-sepolia/${OFFICIAL_REGISTRY}/${agentId}`
  );
  console.log(
    "View tx on BaseScan:",
    `https://sepolia.basescan.org/tx/${tx.hash}`
  );
  console.log("\nUpdate your .env:");
  console.log(`ERC8004_CONTRACT=${OFFICIAL_REGISTRY}`);
  console.log(`ERC8004_TOKEN_ID=${agentId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
