<!-- Agent: researcher | Task: #2 | Session: 2026-02-09 -->

# Research Report: VoltAgent Awesome Agent Skills and Trail of Bits Security Skills

**Date**: 2026-02-09
**Researcher**: researcher agent
**Task**: #2
**Batch/Phase**: EPIC Skill Expansion Initiative - Phase 1 Research
**Sources Consulted**: 7

---

## Executive Summary

The VoltAgent/awesome-agent-skills repository catalogs 339+ agent skills from official development teams and the open-source community, compatible with Claude Code, Codex, Gemini CLI, Cursor, and other AI coding assistants. Trail of Bits contributes 23 professional security-focused skills spanning code auditing, smart contract security, static analysis, malware analysis, and verification. The MCP ecosystem includes 163+ security tools across 28 MCP servers (FuzzingLabs mcp-security-hub). Skills use a standardized SKILL.md format that is directly compatible with our .claude/skills/ structure, requiring only frontmatter adaptation for ingestion.

---

## Research Methodology

### Search Queries Executed

| #   | Query                                                 | Source            | Results Found         |
| --- | ----------------------------------------------------- | ----------------- | --------------------- |
| 1   | VoltAgent/awesome-agent-skills README                 | WebFetch (GitHub) | 339+ skills cataloged |
| 2   | Trail of Bits AI agent security skills CodeQL Semgrep | WebSearch         | 10 results            |
| 3   | trailofbits/skills repository                         | WebFetch (GitHub) | 23 skills detailed    |
| 4   | Awesome MCP servers security tools 2026               | WebSearch         | 10 results            |
| 5   | FuzzingLabs mcp-security-hub details                  | WebSearch         | 10 results            |

### Sources Consulted

| #   | Title                          | Type        | URL                                                                | Date       |
| --- | ------------------------------ | ----------- | ------------------------------------------------------------------ | ---------- |
| 1   | VoltAgent/awesome-agent-skills | GitHub Repo | https://github.com/VoltAgent/awesome-agent-skills                  | 2026-02-09 |
| 2   | trailofbits/skills             | GitHub Repo | https://github.com/trailofbits/skills                              | 2026-02-09 |
| 3   | FuzzingLabs mcp-security-hub   | GitHub Repo | https://github.com/FuzzingLabs/mcp-security-hub                    | 2026-02-09 |
| 4   | tl;dr sec #311                 | Newsletter  | https://tldrsec.com/p/tldr-sec-311                                 | 2026       |
| 5   | punkpeye/awesome-mcp-servers   | GitHub Repo | https://github.com/punkpeye/awesome-mcp-servers                    | 2026-02-09 |
| 6   | Ecosyste.ms trailofbits/skills | Index       | https://awesome.ecosyste.ms/projects/github.com/trailofbits/skills | 2026-02-09 |
| 7   | HexStrike AI MCP Agents        | GitHub Repo | https://github.com/0x4m4/hexstrike-ai                              | 2026-02-09 |

---

## Detailed Findings

### Topic 1: VoltAgent Complete Skill Catalog

The repository organizes 339+ skills by source team.

#### Official Anthropic Skills (16)

| Skill                 | Description                                       | Category            |
| --------------------- | ------------------------------------------------- | ------------------- |
| docx                  | Create, edit, analyze Word documents              | Office/Productivity |
| doc-coauthoring       | Collaborative document editing                    | Office/Productivity |
| pptx                  | Create, edit, analyze PowerPoint presentations    | Office/Productivity |
| xlsx                  | Create, edit, analyze Excel spreadsheets          | Office/Productivity |
| pdf                   | Extract text, create PDFs, handle forms           | Office/Productivity |
| algorithmic-art       | Generative art using p5.js with seeded randomness | Creative            |
| canvas-design         | Visual art design in PNG and PDF formats          | Creative            |
| frontend-design       | Frontend design and UI/UX development             | Design              |
| slack-gif-creator     | Animated GIFs optimized for Slack                 | Creative            |
| theme-factory         | Style artifacts with professional themes          | Design              |
| web-artifacts-builder | Build HTML artifacts with React and Tailwind      | Development         |
| mcp-builder           | Create MCP servers to integrate external APIs     | Infrastructure      |
| webapp-testing        | Test local web apps using Playwright              | Testing             |
| brand-guidelines      | Anthropic brand colors and typography             | Design              |
| internal-comms        | Status reports, newsletters, and FAQs             | Communication       |
| skill-creator         | Guide for creating new skills                     | Meta                |

#### Vercel Engineering (8)

| Skill                   | Description                         | Category   |
| ----------------------- | ----------------------------------- | ---------- |
| react-best-practices    | React patterns and recommendations  | Frontend   |
| vercel-deploy-claimable | Deploy projects to Vercel           | Deployment |
| web-design-guidelines   | Web design standards                | Design     |
| composition-patterns    | React component composition         | Frontend   |
| next-best-practices     | Next.js best practices              | Frontend   |
| next-cache-components   | Caching strategies in Next.js       | Frontend   |
| next-upgrade            | Upgrade Next.js to newer versions   | Frontend   |
| react-native-skills     | React Native performance guidelines | Mobile     |

#### Cloudflare Team (7)

| Skill                             | Description                                        | Category          |
| --------------------------------- | -------------------------------------------------- | ----------------- |
| agents-sdk                        | Build stateful AI agents with scheduling, RPC, MCP | AI/Infrastructure |
| building-ai-agent-on-cloudflare   | AI agents with state and WebSockets                | AI/Infrastructure |
| building-mcp-server-on-cloudflare | Remote MCP servers with OAuth                      | Infrastructure    |
| commands                          | Cloudflare CLI commands                            | CLI               |
| durable-objects                   | Stateful coordination with RPC, SQLite             | Infrastructure    |
| web-perf                          | Audit Core Web Vitals, render-blocking resources   | Performance       |
| wrangler                          | Deploy/manage Workers, KV, R2, D1, Vectorize       | Deployment        |

#### Hugging Face Team (8)

| Skill                        | Description                              | Category |
| ---------------------------- | ---------------------------------------- | -------- |
| hugging-face-cli             | HF Hub CLI for models, datasets, repos   | ML/AI    |
| hugging-face-datasets        | Create/manage datasets with SQL querying | ML/AI    |
| hugging-face-evaluation      | Model evaluation with vLLM/lighteval     | ML/AI    |
| hugging-face-jobs            | Run compute jobs on HF infrastructure    | ML/AI    |
| hugging-face-model-trainer   | Train with TRL: SFT, DPO, GRPO, GGUF     | ML/AI    |
| hugging-face-paper-publisher | Publish papers on HF Hub                 | ML/AI    |
| hugging-face-tool-builder    | Build reusable scripts for HF API        | ML/AI    |
| hugging-face-trackio         | Track ML experiments with dashboards     | ML/AI    |

#### Google Labs / Stitch (6), Stripe (2), Sentry (7), Expo (3), Better Auth (3), Supabase (1), Tinybird (1)

These teams contribute an additional 23 skills covering design systems (Stitch), payment integrations (Stripe), developer workflow (Sentry), mobile development (Expo), authentication (Better Auth), database best practices (Supabase), and data pipelines (Tinybird).

#### Microsoft Skills (85+ across .NET/Java/Python)

Approximately 32 .NET skills, 27 Java skills, and 26+ Python skills covering Azure AI agents, document intelligence, OpenAI clients, AI Foundry, event processing, identity, search, storage, M365 integration, anomaly detection, content safety, communication services, ML workspace management, and container registry.

---

### Topic 2: Trail of Bits Security Skills Deep-Dive

**License**: CC-BY-SA-4.0 (Creative Commons Attribution-ShareAlike 4.0)
**Repository Language Mix**: Python (68.7%), Shell (13.6%), YARA (4.7%), CodeQL (2.4%), C (1.7%), Swift (1.1%)
**Trophy Case**: Confirmed real-world finding - timing side-channel in ML-DSA signing via constant-time-analysis skill

#### Complete Trail of Bits Skill Inventory (23 skills)

**Code Auditing (7 skills)**

| Skill                        | Tools Used               | Description                                                     |
| ---------------------------- | ------------------------ | --------------------------------------------------------------- |
| audit-context-building       | Code analysis tools      | Ultra-granular code analysis for deep architectural context     |
| differential-review          | Git, diff tools          | Security-focused code change review with history analysis       |
| insecure-defaults            | Static analyzers         | Detect hardcoded credentials, fail-open patterns, weak crypto   |
| sharp-edges                  | Code analysis            | Identify error-prone APIs, dangerous configurations, footguns   |
| variant-analysis             | Pattern matching, CodeQL | Find similar vulnerabilities across codebases                   |
| semgrep-rule-creator         | Semgrep                  | Create/refine custom Semgrep vulnerability detection rules      |
| semgrep-rule-variant-creator | Semgrep                  | Port Semgrep rules to new languages with test-driven validation |

**Static Analysis (2 skills)**

| Skill                    | Tools Used             | Description                                                  |
| ------------------------ | ---------------------- | ------------------------------------------------------------ |
| static-analysis          | CodeQL, Semgrep, SARIF | Comprehensive static analysis toolkit with multiple backends |
| burpsuite-project-parser | Burp Suite             | Search/extract data from Burp Suite project files            |

**Smart Contract Security (2 skills)**

| Skill                     | Tools Used                                 | Description                                             |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| building-secure-contracts | Slither, Echidna, Medusa, Foundry, Hardhat | Security toolkit for 6 blockchains                      |
| entry-point-analyzer      | Contract analysis                          | Identify state-changing entry points in smart contracts |

**Verification and Testing (3 skills)**

| Skill                   | Tools Used                           | Description                                            |
| ----------------------- | ------------------------------------ | ------------------------------------------------------ |
| constant-time-analysis  | Timing analysis tools                | Detect compiler-induced timing side-channels in crypto |
| property-based-testing  | Hypothesis (Python), fast-check (JS) | Property-based testing for multiple languages          |
| spec-to-code-compliance | Code comparison                      | Specification-to-code compliance checker               |

**Audit Lifecycle (2 skills)**

| Skill                           | Tools Used     | Description                                          |
| ------------------------------- | -------------- | ---------------------------------------------------- |
| fix-review                      | Git, diff      | Verify fix commits address findings without new bugs |
| ask-questions-if-underspecified | None (process) | Prompt for clarification on ambiguous requirements   |

**Malware Analysis, Reverse Engineering, Mobile Security (3 skills)**

| Skill                | Tools Used    | Description                                             |
| -------------------- | ------------- | ------------------------------------------------------- |
| yara-authoring       | YARA          | Detection rule authoring with linting and atom analysis |
| dwarf-expert         | DWARF format  | Interact with and understand DWARF debugging format     |
| firebase-apk-scanner | Android tools | Scan APKs for Firebase misconfigurations                |

**Development and Other (4 skills)**

| Skill                            | Tools Used           | Description                                    |
| -------------------------------- | -------------------- | ---------------------------------------------- |
| modern-python                    | uv, ruff, ty, pytest | Modern Python tooling best practices           |
| testing-handbook-skills          | Fuzzers, sanitizers  | Fuzzers, static analysis, sanitizers, coverage |
| culture-index                    | Documentation search | Culture documentation indexing                 |
| claude-in-chrome-troubleshooting | Chrome MCP           | Diagnose Claude in Chrome connectivity issues  |

#### Key Methodologies

- **Variant Analysis**: Pattern-based vulnerability discovery across codebases (CodeQL approach)
- **Constant-Time Verification**: Detecting timing side-channels from compiler optimizations in crypto code
- **Property-Based Testing**: Tests from properties not specific inputs (Hypothesis, fast-check)
- **SARIF Integration**: Standardized Static Analysis Results Interchange Format

---

### Topic 3: MCP and Open Source Tool Ecosystem

#### FuzzingLabs mcp-security-hub (28 MCP Servers, 163+ Tools)

| Category          | Tools                                     | Description                                      |
| ----------------- | ----------------------------------------- | ------------------------------------------------ |
| Reconnaissance    | Nmap, Shodan, WhatWeb, Masscan, ZoomEye   | Port scanning, fingerprinting, internet search   |
| Web Security      | Nuclei, SQLMap, Nikto, FFUF, Burp Suite   | Vulnerability scanning, SQL injection, fuzzing   |
| Binary Analysis   | Radare2, Binwalk, YARA, Capa, Ghidra, IDA | Reverse engineering, firmware, malware detection |
| Cloud Security    | Trivy, Prowler                            | Container/cloud vulnerability scanning           |
| Secrets Detection | GitLeaks                                  | Repository secrets scanning                      |

**Deployment**: Docker Compose based, each tool runs as independent MCP server.

#### Other Notable MCP Security Projects

| Project                   | Coverage                     | URL                                          |
| ------------------------- | ---------------------------- | -------------------------------------------- |
| HexStrike AI              | 150+ cybersecurity tools     | https://github.com/0x4m4/hexstrike-ai        |
| cyproxio/mcp-for-security | SQLMap, FFUF, Nmap, Masscan  | https://github.com/cyproxio/mcp-for-security |
| pentestMCP                | AI-powered pentesting        | Available on LobeHub                         |
| mark3labs/nuclei MCP      | Nuclei vulnerability scanner | Available on AI Toolhouse                    |

#### Open Source Tools for Skill Integration

| Tool     | Language | Purpose                       | Integration Potential |
| -------- | -------- | ----------------------------- | --------------------- |
| Semgrep  | Python   | Static analysis, custom rules | HIGH - via CLI        |
| CodeQL   | QL       | Variant analysis, SAST        | HIGH - via CLI        |
| Bandit   | Python   | Python security linting       | MEDIUM - via CLI      |
| YARA     | C        | Malware detection rules       | MEDIUM - via CLI      |
| Trivy    | Go       | Container/IaC scanning        | HIGH - via CLI        |
| Nuclei   | Go       | Vulnerability scanning        | HIGH - via CLI        |
| GitLeaks | Go       | Secret detection              | HIGH - via CLI        |

---

### Topic 4: Compatibility Assessment

#### Format Comparison

| Aspect            | VoltAgent/ToB Format    | Our Framework Format                                           |
| ----------------- | ----------------------- | -------------------------------------------------------------- |
| File name         | SKILL.md                | SKILL.md                                                       |
| Location          | plugins/{name}/SKILL.md | .claude/skills/{name}/SKILL.md                                 |
| Frontmatter       | Minimal or none         | YAML with name, description, version, model, invoked_by, tools |
| Structure         | Plain markdown headings | identity, capabilities, instructions XML tags                  |
| Memory Protocol   | Not included            | MANDATORY section at bottom                                    |
| Tool Declarations | Not in frontmatter      | Listed in frontmatter tools field                              |
| Agent Assignment  | Not specified           | invoked_by field maps to agents                                |
| Catalog Tracking  | Not tracked             | Must be in skill-catalog.md                                    |

#### Adaptation Requirements

1. **Frontmatter Addition**: YAML frontmatter with name, description, version, model, invoked_by, tools
2. **Structure Tags**: Wrap content in identity, capabilities, instructions XML tags
3. **Memory Protocol**: Append standard Memory Protocol section
4. **Agent Assignment**: Map each skill to invoking agents
5. **Catalog Registration**: Add to skill-catalog.md
6. **Security Notice**: Add AUTHORIZED USE ONLY for offensive skills
7. **License Compliance**: CC-BY-SA-4.0 attribution required for Trail of Bits skills

#### Dependency Requirements

| Skill Category             | Dependencies                           |
| -------------------------- | -------------------------------------- |
| Static Analysis (ToB)      | Semgrep CLI, CodeQL CLI, SARIF parsers |
| Smart Contracts (ToB)      | Slither, Echidna, Foundry, Hardhat     |
| YARA Authoring (ToB)       | YARA binary                            |
| MCP Security Hub           | Docker, Docker Compose                 |
| Webapp Testing (Anthropic) | Playwright, Node.js                    |

---

## Academic References

1. **SARIF (Static Analysis Results Interchange Format)** - OASIS SARIF TC standard; used by CodeQL, Semgrep, and Trail of Bits static-analysis skill. URL: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
2. **Constant-Time Programming** - Trail of Bits trophy case: ML-DSA timing side-channel discovery. Methodology: compiler-induced timing leaks in cryptographic implementations.
3. **Property-Based Testing** - Foundation: QuickCheck (Haskell, 2000), Hypothesis (Python). Trail of Bits applies to smart contracts and multi-language testing.
4. **Variant Analysis** - Originated by Semmle/GitHub for CodeQL. Pattern: find one bug, search for structural variants across codebase.

---

## Practical Recommendations

### P0 (Immediate - This Sprint)

- **Ingest Trail of Bits static-analysis skill**: Highest-value security skill; integrates CodeQL and Semgrep with SARIF output; complements security-architect and penetration-tester agents
- **Ingest Trail of Bits variant-analysis skill**: Pattern-based vulnerability discovery across codebases; high value for code review workflows
- **Ingest Trail of Bits differential-review skill**: Security-focused diff review complements code-reviewer agent
- **Ingest Trail of Bits semgrep-rule-creator skill**: Custom vulnerability detection rules; high reuse across projects
- **Ingest Trail of Bits insecure-defaults skill**: Detects hardcoded credentials and fail-open patterns; directly relevant to security-architect workflow

### P1 (Soon - Next Sprint)

- **Ingest Trail of Bits property-based-testing**: Enhances QA agent with property-based test generation
- **Ingest Trail of Bits audit-context-building**: Deep code understanding for security reviews
- **Ingest Trail of Bits fix-review**: Verify fixes do not introduce regressions; complements code-reviewer
- **Ingest Trail of Bits yara-authoring**: Malware detection rule creation; complements binary-analysis-patterns skill
- **Ingest Anthropic webapp-testing**: Playwright-based web testing; complements QA agent
- **Evaluate FuzzingLabs MCP security hub**: Docker-based MCP servers for Nmap, Nuclei, Trivy integration

### P2 (Future - Backlog)

- **Ingest Trail of Bits constant-time-analysis**: Niche but proven (real-world trophy case finding)
- **Ingest Trail of Bits smart contract skills**: Only if blockchain work is planned
- **Ingest Vercel/Next.js skills**: If frontend framework support is expanded
- **Ingest Hugging Face ML skills**: If ML/AI model training workflows are needed
- **Evaluate Microsoft Azure skills (85+)**: Enterprise cloud integration if Azure is target platform

---

## Ingestion Priority List (Ranked)

| Rank | Skill                        | Source        | Priority | Agents Benefited                       | Effort |
| ---- | ---------------------------- | ------------- | -------- | -------------------------------------- | ------ |
| 1    | static-analysis              | Trail of Bits | P0       | security-architect, penetration-tester | Medium |
| 2    | variant-analysis             | Trail of Bits | P0       | code-reviewer, security-architect      | Medium |
| 3    | differential-review          | Trail of Bits | P0       | code-reviewer                          | Low    |
| 4    | semgrep-rule-creator         | Trail of Bits | P0       | security-architect                     | Medium |
| 5    | insecure-defaults            | Trail of Bits | P0       | security-architect, developer          | Low    |
| 6    | property-based-testing       | Trail of Bits | P1       | qa                                     | Medium |
| 7    | audit-context-building       | Trail of Bits | P1       | security-architect, code-reviewer      | Low    |
| 8    | fix-review                   | Trail of Bits | P1       | code-reviewer                          | Low    |
| 9    | yara-authoring               | Trail of Bits | P1       | security-architect, reverse-engineer   | Medium |
| 10   | webapp-testing               | Anthropic     | P1       | qa, frontend-pro                       | Medium |
| 11   | sharp-edges                  | Trail of Bits | P1       | code-reviewer, developer               | Low    |
| 12   | semgrep-rule-variant-creator | Trail of Bits | P1       | security-architect                     | Medium |
| 13   | modern-python                | Trail of Bits | P2       | python-pro                             | Low    |
| 14   | testing-handbook-skills      | Trail of Bits | P2       | qa                                     | Medium |
| 15   | constant-time-analysis       | Trail of Bits | P2       | security-architect                     | High   |

---

## Risk Assessment

| Risk                                         | Impact | Probability    | Mitigation                                                              |
| -------------------------------------------- | ------ | -------------- | ----------------------------------------------------------------------- |
| License compliance (CC-BY-SA-4.0)            | HIGH   | HIGH (certain) | Include attribution in every adapted skill; share-alike for derivatives |
| External tool dependencies (Semgrep, CodeQL) | MEDIUM | HIGH           | Make dependencies optional; degrade gracefully if CLI not installed     |
| Skill content drift from upstream            | MEDIUM | MEDIUM         | Track upstream version; document source commit hash in frontmatter      |
| Security skill misuse                        | HIGH   | LOW            | Add AUTHORIZED USE ONLY notices (pattern from binary-analysis-patterns) |
| Frontmatter adaptation errors                | LOW    | MEDIUM         | Use skill-creator workflow for standardized ingestion                   |
| Agent routing conflicts                      | MEDIUM | LOW            | Update routing-table.cjs and agent-registry.json after ingestion        |
| Context bloat from too many skills           | MEDIUM | MEDIUM         | Ingest in batches; monitor context window usage per agent               |

---

## Implementation Roadmap

### Phase 1: P0 Security Skills (Week 1)

1. Fork/download Trail of Bits skills repository
2. For each P0 skill (5 skills):
   - Read original SKILL.md content
   - Invoke skill-creator with research-synthesis context
   - Add YAML frontmatter (name, version, model, invoked_by, tools)
   - Wrap in framework XML tags (identity, capabilities, instructions)
   - Add Memory Protocol section
   - Add CC-BY-SA-4.0 attribution header
   - Add AUTHORIZED USE ONLY security notice
   - Register in skill-catalog.md
   - Assign to relevant agents (security-architect, code-reviewer, penetration-tester)
   - Update agent-registry.json with new skill assignments

### Phase 2: P1 Skills and MCP Evaluation (Week 2)

1. Ingest remaining P1 skills (7 skills)
2. Evaluate FuzzingLabs MCP security hub for Docker integration
3. Test Semgrep CLI integration locally
4. Test CodeQL CLI integration locally
5. Create MCP server configuration for selected security tools

### Phase 3: Community Skills and Testing (Week 3)

1. Ingest selected P2 skills
2. Full integration testing with all agents
3. Update CLAUDE.md routing references
4. Performance testing (context window impact)
5. Documentation and user guide updates

---

## Appendix: Skill Format Adaptation Notes

To ingest an external skill into our framework, each SKILL.md must be adapted with:

1. YAML frontmatter: name, description, version, model, invoked_by, tools, source, source_license, source_url
2. Attribution comment referencing original source and license
3. Content wrapped in identity, capabilities, instructions XML tags
4. Security Notice section for offensive/security skills
5. Memory Protocol (MANDATORY) section at bottom
6. Workflow Integration section referencing relevant agent workflows

The frontmatter fields source, source_license, and source_url are proposed new fields for tracking provenance of externally-sourced skills.

---

## Sources

- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
- [Trail of Bits Skills Repository](https://github.com/trailofbits/skills)
- [FuzzingLabs mcp-security-hub](https://github.com/FuzzingLabs/mcp-security-hub)
- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- [HexStrike AI MCP Agents](https://github.com/0x4m4/hexstrike-ai)
- [tl;dr sec #311](https://tldrsec.com/p/tldr-sec-311)
- [Ecosyste.ms: trailofbits/skills](https://awesome.ecosyste.ms/projects/github.com/trailofbits/skills)
