# Research Report: web3-blockchain-expert Agent

**Date**: 2026-01-25
**Researcher**: EVOLUTION-ORCHESTRATOR agent via research-synthesis skill
**Artifact Type**: agent
**Domain**: Web3, Blockchain, Smart Contracts, DeFi

---

## Research Queries Executed

| # | Query | Tool | Sources Found | Key Finding |
|---|-------|------|---------------|-------------|
| 1 | "Web3 blockchain development best practices 2025 2026 smart contract security" | Exa | 8 | OWASP Smart Contract Top 10 2025 is the primary security reference; $2.3B lost in H1 2025 alone |
| 2 | "Solidity smart contract security patterns audit checklist OWASP" | Exa | 8 | OWASP SCSVS (Smart Contract Security Verification Standard) provides comprehensive checklists |
| 3 | "Ethereum DeFi development patterns best practices 2025" | Exa | 8 | Modern tech stack includes Hardhat/Foundry, Slither, Mythril; design patterns well-documented |
| 4 | "AI agent blockchain smart contract development automation security review tools" | Exa | 5 | AI-powered audit tools emerging (AuditAgent, Sherlock AI, QuillShield) |

---

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `.claude/skills/web3-expert/SKILL.md` - Existing skill with Solidity guidelines (needs enhancement to full agent)
- `.claude/agents/specialized/security-architect.md` - Already references web3-expert skill for smart contract security
- `.claude/agents/domain/typescript-pro.md` - Domain agent pattern with comprehensive skill invocation

**Conventions Identified:**
- **Naming**: `<domain>-pro` or `<domain>-expert` pattern for domain agents
- **Structure**: YAML frontmatter + Core Persona + Responsibilities + Workflow + Skill Invocation Protocol + Memory Protocol
- **Tools**: Full toolkit including TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
- **Skills**: task-management-protocol mandatory; domain-specific skills + tdd + verification-before-completion

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Follow OWASP Smart Contract Top 10 (SC01-SC10) | OWASP scs.owasp.org | High | Industry standard, updated 2025 |
| 2 | Use Checks-Effects-Interactions pattern | ethereum.org, Alchemy | High | Prevents reentrancy (SC05:2025) |
| 3 | Use static analysis (Slither, Mythril, Crytic) | ethereum.org security guidelines | High | Catches 40+ vulnerability types |
| 4 | Use OpenZeppelin contracts and patterns | Alchemy, Metana | High | Battle-tested, community audited |
| 5 | Implement circuit breakers (Pausable) | Alchemy best practices | High | Emergency stop capability |
| 6 | Use pull over push payment patterns | Alchemy, OWASP | High | Mitigates reentrancy and DoS |
| 7 | Solidity 0.8.x+ for built-in overflow protection | Alchemy, ethereum.org | High | Native SafeMath functionality |
| 8 | Test with fuzzing (Foundry/Echidna) | Consensys, Hacken | High | Finds edge cases traditional tests miss |
| 9 | Access control with OpenZeppelin AccessControl | Alchemy, existing web3-expert skill | High | Fine-grained permissions |
| 10 | Multi-sig and timelock for sensitive operations | Alchemy, Hacken | High | Defense-in-depth for governance |

---

## OWASP Smart Contract Top 10 (2025)

Critical reference for agent capabilities:

1. **SC01:2025 - Access Control Vulnerabilities** - $1.6B+ lost in H1 2025
2. **SC02:2025 - Price Oracle Manipulation** - Flash loan attack vector
3. **SC03:2025 - Logic Errors** - Business logic flaws
4. **SC04:2025 - Lack of Input Validation** - Boundary conditions
5. **SC05:2025 - Reentrancy Attacks** - Classic CEI violation
6. **SC06:2025 - Unchecked External Calls** - Return value handling
7. **SC07:2025 - Flash Loan Attacks** - Economic exploits
8. **SC08:2025 - Integer Overflow/Underflow** - Mitigated in 0.8+
9. **SC09:2025 - Denial of Service** - Gas limits, loops
10. **SC10:2025 - Phishing via tx.origin** - Caller verification

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Name: `web3-blockchain-expert` | Clear domain identifier, follows `-expert` pattern | Existing domain agents | `blockchain-pro`, `solidity-pro` |
| Model: `opus` | Security-critical domain requires deepest reasoning | security-architect uses opus | `sonnet` (insufficient for security) |
| Temperature: `0.3` | Low temperature for deterministic security analysis | typescript-pro pattern | `0.4` (too variable for security) |
| Extended thinking: `true` | Complex security analysis requires extended reasoning | security-architect pattern | `false` (insufficient depth) |
| Include security-architect skill | Cross-references for comprehensive security | Existing patterns | Separate security review |
| DeFi-specific capabilities | DeFi is primary Web3 use case, unique attack vectors | Research findings | Generic blockchain only |

---

## Recommended Implementation

**File Location**: `.claude/agents/domain/web3-blockchain-expert.md`

**Skills to Include**:
- `web3-expert` - Core Solidity/blockchain guidelines
- `security-architect` - OWASP, threat modeling
- `auth-security-expert` - Access control patterns
- `tdd` - Test-driven smart contract development
- `verification-before-completion` - Quality gates
- `task-management-protocol` - Task tracking
- `git-expert` - Version control
- `debugging` - Systematic debugging

**Key Capabilities**:
1. Smart contract development (Solidity, Vyper, Cairo)
2. DeFi protocol design (AMM, lending, staking)
3. Security auditing and vulnerability analysis
4. Gas optimization
5. Upgrade patterns (proxy, diamond)
6. Testing with Hardhat/Foundry
7. Oracle integration (Chainlink)
8. Multi-chain development (EVM compatible)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Security recommendations outdated | Medium | High | Include web search capability, reference latest OWASP |
| Overlaps with security-architect | Low | Medium | Clear scope: web3-expert = development, security-architect = general security |
| Missing new vulnerability types | Medium | High | Keep web3-expert skill updated, agent uses web search |
| Gas estimation inaccurate | Low | Low | Always recommend mainnet fork testing |

---

## Quality Gate Checklist

Before proceeding to artifact creation, verify:

- [x] Minimum 3 research queries executed (4 executed)
- [x] At least 3 external sources consulted (8+ sources: OWASP, Alchemy, ethereum.org, Hacken, Metana, Medium)
- [x] Existing codebase patterns documented (web3-expert skill, security-architect, typescript-pro)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented

---

## Next Steps

1. **Invoke agent-creator skill**: `Skill({ skill: "agent-creator" })`
2. **Use this report as input**: Reference decisions above
3. **Validate against checklist**: Before marking complete
4. **Register in CLAUDE.md**: Add to routing table
5. **Register in router-enforcer.cjs**: Add intent keywords

---

## Sources Consulted

1. https://owasp.org/www-project-smart-contract-top-10/ - OWASP Smart Contract Top 10
2. https://scs.owasp.org/ - OWASP Smart Contract Security (SCSVS, SCSTG, Checklist)
3. https://www.alchemy.com/overviews/smart-contract-security-best-practices - 12 Solidity Security Best Practices
4. https://ethereum.org/en/developers/tutorials/smart-contract-security-guidelines/ - Ethereum.org Security Guidelines
5. https://ethereum.org/en/developers/tutorials/secure-development-workflow/ - Smart Contract Security Checklist
6. https://hacken.io/discover/smart-contract-vulnerabilities/ - Top 10 Smart Contract Vulnerabilities 2025
7. https://metana.io/blog/smart-contract-design-patterns-in-solidity-explained/ - Solidity Design Patterns 2025
8. https://github.com/Consensys/ethereum-developer-tools-list - Consensys Developer Tools
9. https://auditagent.nethermind.io/ - AuditAgent AI Tool
10. https://coinsbench.com/the-next-frontier-in-web3-security-ai-agents-for-smart-contract-audits-243cd7190d0a - AI Agents for Smart Contract Audits
