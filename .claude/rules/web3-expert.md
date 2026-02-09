# Web3 Expert Rules

## Core Principles

- Use Solidity 0.8.28+ for built-in overflow/underflow protection
- Design modular and maintainable contract structures
- Optimize for gas efficiency (minimize state changes, storage access)
- Document all contracts and functions thoroughly (NatSpec comments)
- Follow Checks-Effects-Interactions pattern to prevent reentrancy

## Solidity Best Practices

- Use explicit function visibility modifiers (public, private, external, internal)
- Utilize function modifiers for common checks
- Follow consistent naming: CamelCase for contracts, PascalCase for interfaces (prefix "I")
- Implement Interface Segregation Principle
- Use OpenZeppelin libraries (SafeERC20, AccessControl, Pausable)

## Security

- Use static analysis tools (Slither, Mythril) in development workflow
- Implement circuit breakers (pause functionality) using OpenZeppelin's Pausable
- Use pull over push payment patterns (prevent reentrancy, DoS)
- Implement rate limiting for sensitive functions
- Implement timelocks and multisig controls for production operations
- Use OpenZeppelin's SafeERC20 for token interactions

## Contract Design

- Design upgradeable contracts using proxy pattern when necessary
- Implement comprehensive events for all significant state changes
- Use OpenZeppelin's AccessControl for fine-grained permissions
- Implement proper error handling with custom errors (gas-efficient)
- Follow ERC standards (ERC20, ERC721, ERC1155)

## Development Workflow

- Use Hardhat for testing and debugging
- Implement robust CI/CD pipeline for deployments
- Use static type checking and linting in pre-commit hooks
- Conduct thorough gas optimization (deployment and runtime)
- Write comprehensive tests (unit, integration, fork tests)

## Testing

- Write unit tests for all contract functions
- Implement integration tests for contract interactions
- Use fork testing for mainnet simulation
- Test edge cases and failure scenarios
- Aim for 100% test coverage for critical contracts

## Integration Points

- Used by: `blockchain-architect`, `web3-pro`, `developer` (Web3 projects)
- Related skills: `smart-contract-auditor`, `defi-expert`, `ethereum-expert`
- Works with: `security-architect`, `penetration-tester`, `code-reviewer`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
