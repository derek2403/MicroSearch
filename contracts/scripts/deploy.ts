import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AgentIdentityRegistry with account:", deployer.address);

  const Registry = await ethers.getContractFactory("AgentIdentityRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("AgentIdentityRegistry deployed to:", address);

  // Register the first agent (this service)
  const agentURI = JSON.stringify({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Micropaid Search API",
    description:
      "Pay-per-query web search powered by x402 micropayments. Agent identity via ERC-8004.",
    services: [
      { name: "web", endpoint: "http://localhost:3000/api/agent" },
      { name: "x402", endpoint: "http://localhost:3000/api/search" },
    ],
    x402Support: true,
    active: true,
  });

  const tx = await registry["register(string)"](agentURI);
  const receipt = await tx.wait();
  console.log("Agent registered. Token ID: 1");
  console.log("Transaction:", receipt?.hash);

  console.log("\nAdd these to your .env.local:");
  console.log(`ERC8004_CONTRACT=${address}`);
  console.log(`ERC8004_TOKEN_ID=1`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
