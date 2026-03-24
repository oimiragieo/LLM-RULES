# Active Context — Session Handoff 2026-03-24 (Evening)

**NEXT ACTION (IMMEDIATE):** Spawn agents for ALL of the following. Do NOT implement directly — you are the router.

## Mission 1: Full Ecosystem Audit & Remediation (EPIC)

Perform a comprehensive, high-fidelity audit and optimization of the entire agentic ecosystem. Operate with zero-slack, identifying every failure point, architectural gap, and 'unwired' component within the codebase.

### Phase 1: Deep Dive & Diagnostic

- **Structural Audit**: Use LSP tools and ripgrep skill to scan for bugs, vulnerabilities, conflicting workflows, and permission bottlenecks between agents and tools.
- **System Integrity**: Specifically audit the .claude reflection agent, the evolution system, the claude.md router, and all memory system hooks. Identify any fundamental code that is not properly integrated or fails to meet the core design specs.
- **Evidence of Compliance**: Provide documented proof that agents are actively utilizing the ripgrep, token-saver, and index-search tooling.

### Phase 2: Strategic TDD & Skill Evolution

- **Research & Planning**: Use Exa to research 2026 industry-standard TDD planning. Compare these findings against our current TDD-skill.
- **Skill Upgrading**: If our internal TDD-skill or LSP-skill is found wanting, immediately trigger the skill-updater process to modernize them before proceeding.
- **Sub-Agent Optimization**: Deep dive into sub-agent memory utilization, specifically focusing on the new 'loop' features to ensure seamless persistence and recall.

### Phase 3: Implementation & Validation

- **Permanent Remediation**: Do not apply "session-only" patches. If an agent is bypassing the token-saver or indexing tools, engineer a permanent architectural fix.
- **Collaborative Review**: Integrate Gemini, Codex, and Cursor-agent to provide multi-model feedback loops on all plans and code changes.
- **Deployment Standard**: Execute a full 'lint and format' across the codebase. Commit all validated fixes only after passing the TDD-based validation suite.
- **Deliverable**: A thorough, critical write-up detailing every identified issue, the logic behind the failure, and the permanent resolution implemented. 100% wiring and functional parity across the ecosystem.

## Mission 2: Step 0 Reflection Queue (4 entries pending)

Process ALL 4 reflection-spawn-request.json entries FIRST before any other work. These are self-review findings from the prior session:

1. HIGH — ccusage skip violation
2. HIGH — 4 failed agents / 6 blank windows from trivial edit spawns
3. MEDIUM — researcher/QA reports lost in worktree cleanup
4. MEDIUM — self-review findings weren't persisted (now fixed)

## Mission 3: Developer Experience & Setup Script (NEW — HIGH PRIORITY)

Deep dive the agent-studio codebase and make it simple for users to install. This is a FULL onboarding overhaul:

### 3a: Dependency Detection & Auto-Install

Build a setup script that checks for and installs required tools:

- **LSP servers**: TypeScript (typescript-language-server), Python (pyright/pylsp), Go (gopls), Rust (rust-analyzer), etc. — whatever our agents need for LSP navigation
- **External LLM CLIs**: Check if gemini-cli, codex-cli, cursor-cli are installed. If not, offer to install them (these power our omega-\* skills and multi-model review)
- **Channels dependencies**: Claude Code --channels requires specific setup — detect and install dependencies
- **Node/pnpm/Bun**: Verify correct versions, offer to install via nvm/volta if wrong version
- **Python + build tools**: For native AST add-ons on Windows (node-gyp, C++ build tools)
- **ast-grep**: For code-structural-search skill

### 3b: .env Template & Interactive Setup

- Audit current .env.example — ensure EVERY env var used anywhere in the codebase is documented
- Build an interactive setup wizard (node script) that asks the user questions to fill out .env:
  - "Do you have a Gemini API key?" → sets GEMINI_API_KEY
  - "Do you use Slack?" → sets SLACK_BOT_TOKEN
  - "Enable channels?" → configures channel dependencies
  - "Which LLM providers do you use?" → sets appropriate API keys
- The script should validate each answer (test API keys, check file paths exist, etc.)

### 3c: Channel System Setup

- Channels feature requires specific dependencies and configuration
- Map out everything needed: terminal multiplexer, process management, IPC mechanism
- Include in setup script with clear prompts

### 3d: README & First-Run Experience

- Update README with clear "Quick Start" section
- `pnpm run setup` should handle EVERYTHING: deps, env, LSP, channels, indexes
- First-run should be: clone → pnpm install → pnpm run setup → ready

## Prior Session Context (2026-03-24)

### What was accomplished:

- EPIC ecosystem audit completed: 82/100 → ~90/100 after fixes
- 7 findings fixed: JSON.parse→safeParseJSON, agent count 102→110, 2 test fixes, memory rotation, registry regen
- 2 commits pushed to main (65482d19, 20816c70)
- Tooling compliance: 12/15 PASS, 3 PARTIAL, 0 FAIL
- TDD v1.4.0 confirmed current with 2026 standards
- Token usage today: ~129M tokens, $118.29

### Self-review violations found:

- ccusage skipped at end (now saved as iron-law memory)
- 4 agents wasted on trivial edits — all hit "Prompt too long" (threshold rule saved)
- Self-review findings weren't persisted to reflection queue (now fixed — new feedback memory)

### New memories saved:

- feedback_never_skip_ccusage.md
- feedback_dont_spawn_for_trivial_edits.md
- feedback_self_review_must_persist_and_act.md
