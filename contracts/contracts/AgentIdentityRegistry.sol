// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentIdentityRegistry
 * @notice Minimal ERC-8004 Identity Registry — each NFT represents an AI agent identity.
 *
 * Implements the core Identity Registry subset of ERC-8004:
 *   - register()  → mint a new agent identity (returns agentId)
 *   - agentURI()  → off-chain metadata pointer (registration file)
 *   - metadata     → arbitrary on-chain key-value storage per agent
 *
 * This is intentionally minimal for a hackathon MVP.
 * A full ERC-8004 deployment would add Reputation + Validation registries.
 */
contract AgentIdentityRegistry is ERC721, Ownable {
    uint256 private _nextAgentId = 1;

    /// @dev agentId → off-chain registration file URI
    mapping(uint256 => string) private _agentURIs;

    /// @dev agentId → key → value (arbitrary on-chain metadata)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // -----------------------------------------------------------------------
    // Events (per ERC-8004 spec)
    // -----------------------------------------------------------------------
    event Registered(
        uint256 indexed agentId,
        string agentURI,
        address indexed owner
    );
    event URIUpdated(
        uint256 indexed agentId,
        string newURI,
        address indexed updatedBy
    );
    event MetadataSet(
        uint256 indexed agentId,
        string metadataKey,
        bytes metadataValue
    );

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------
    constructor()
        ERC721("ERC-8004 Agent Identity", "AGENT")
        Ownable(msg.sender)
    {}

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------

    /// @notice Register a new agent with a metadata URI.
    function register(string calldata agentURI_) external returns (uint256) {
        uint256 agentId = _nextAgentId++;
        _mint(msg.sender, agentId);
        _agentURIs[agentId] = agentURI_;
        emit Registered(agentId, agentURI_, msg.sender);
        return agentId;
    }

    /// @notice Register a new agent without an initial URI.
    function register() external returns (uint256) {
        uint256 agentId = _nextAgentId++;
        _mint(msg.sender, agentId);
        emit Registered(agentId, "", msg.sender);
        return agentId;
    }

    // -----------------------------------------------------------------------
    // URI management
    // -----------------------------------------------------------------------

    /// @notice Update the off-chain registration file URI for an agent.
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _agentURIs[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @notice Read the off-chain registration file URI.
    function agentURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId); // reverts if token does not exist
        return _agentURIs[agentId];
    }

    /// @dev ERC-721 tokenURI delegates to agentURI.
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        ownerOf(tokenId); // reverts if token does not exist
        return _agentURIs[tokenId];
    }

    // -----------------------------------------------------------------------
    // On-chain metadata (key-value)
    // -----------------------------------------------------------------------

    function setMetadata(
        uint256 agentId,
        string calldata key,
        bytes calldata value
    ) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, value);
    }

    function getMetadata(
        uint256 agentId,
        string calldata key
    ) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
