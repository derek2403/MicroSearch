/**
 * ERC-8004 agent identity helper.
 *
 * Read-only / identity-presence-only integration.
 * Returns a portable identity reference that links this service to an
 * on-chain ERC-8004 agent registration (ERC-721 token).
 */

export interface AgentIdentity {
  standard: "ERC-8004";
  chain: string;
  contract: string;
  tokenId: string;
  profileUrl: string;
}

export function getAgentIdentity(): AgentIdentity {
  const chain = process.env.ERC8004_CHAIN || "base";
  const contract =
    process.env.ERC8004_CONTRACT ||
    "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
  const tokenId = process.env.ERC8004_TOKEN_ID || "1";
  const scanBase =
    process.env.ERC8004_SCAN_BASE_URL || "https://www.8004scan.io";

  return {
    standard: "ERC-8004",
    chain,
    contract,
    tokenId,
    profileUrl: `${scanBase}/agents/${chain}/${contract}/${tokenId}`,
  };
}
