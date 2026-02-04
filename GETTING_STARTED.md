# Getting Started with Agent Studio

Get up and running in 5 minutes.

> **Note**: This is a **drop-in configuration bundle**, not an SDK or MCP server. Simply copy the folders into your project - no installation, no dependencies, no build step required.

## Prerequisites

Before you begin, ensure you have:

| Requirement | Version | Required For                       | Verify Command     |
| ----------- | ------- | ---------------------------------- | ------------------ |
| Claude Code | Latest  | Core functionality                 | `claude --version` |
| Git         | 2.30+   | Version control                    | `git --version`    |
| Node.js     | 18+     | Validation scripts (optional)      | `node --version`   |
| pnpm        | Latest  | Validation dependencies (optional) | `pnpm --version`   |

**Note**: Node.js and pnpm are only required if you want to run validation scripts or workflow gates. The core agent configuration works without them.

**Optional (Semantic Memory Search)**: If you use embedded LanceDB vector search via `@xenova/transformers`, `pnpm install` may need to build `sharp` (native dependency). If embeddings fall back to a mock embedder, run `pnpm rebuild sharp` (or do a fresh `pnpm install`). With `pnpm` v10+, you may need to run `pnpm approve-builds` and explicitly approve `sharp` so the native binary is actually built.

## Quick Install

### Step 1: Copy Configuration

```bash
# Clone or download this repo, then copy to your project:
cp -r .claude/ /path/to/your/project/
cp CLAUDE.md /path/to/your/project/
```

**Windows PowerShell:**

```powershell
Copy-Item -Path ".claude" -Destination "C:\path\to\your\project\.claude" -Recurse
Copy-Item -Path "CLAUDE.md" -Destination "C:\path\to\your\project\CLAUDE.md"
```

### Step 2: Verify Structure

Your project should look like this:

```
your-project/
├── CLAUDE.md           # Root instructions (required)
├── .claude/            # Configuration directory
│   ├── agents/         # 46 specialized agents (core, domain, specialized, orchestrators)
│   ├── skills/         # 427+ utility skills
│   ├── workflows/      # 16+ workflow definitions (core, enterprise, operations)
│   ├── hooks/          # Consolidated security and routing hooks (8 categories)
│   ├── lib/            # Shared utilities (memory, workflow, utils, self-healing)
│   ├── tools/          # Enterprise tools (cost, sessions, analytics)
│   │   ├── a2a/        # A2A Protocol Integration (12 modules)
│   │   │   ├── agent-card-generator.mjs       # Generate A2A AgentCards
│   │   │   ├── discovery-endpoint.mjs         # Discovery server
│   │   │   ├── memory-a2a-bridge.mjs          # Memory ↔ A2A conversion
│   │   │   ├── entity-a2a-converter.mjs       # Entity conversion
│   │   │   ├── message-wrapper.mjs            # Message format conversion
│   │   │   ├── task-state-manager.mjs         # 8-state task lifecycle
│   │   │   ├── external-agent-discovery.mjs   # External discovery
│   │   │   ├── push-notification-handler.mjs  # Webhooks
│   │   │   ├── streaming-handler.mjs          # SSE streaming
│   │   │   ├── federation-manager.mjs         # Federation orchestration
│   │   │   ├── test-utils.mjs                 # 35+ test utilities
│   │   │   └── test-fixtures.json             # Test fixtures
│   │   └── ...         # 195+ more tools
│   ├── schemas/        # JSON validation schemas
│   ├── docs/           # Comprehensive documentation
│   ├── rules/          # 1,081+ technology rule packs
│   └── config.yaml     # Agent routing and workflow configuration
└── [your source code]
```

### Step 3: Enable Hooks (Recommended)

1. Open Claude Code in your project
2. Go to **Preferences > Claude Code > Hooks**
3. Point to `.claude/hooks` directory
4. Enable security hooks

If you need to reset runtime or memory state (e.g., after corruption or drift), run:

```bash
pnpm run context:reset --scope soft --force
```

**Available Hooks:**

- **security-pre-tool.mjs** (PreToolUse): Blocks dangerous commands, protects sensitive files, prevents force pushes
- **read-only-enforcer.mjs** (PreToolUse): Optional “read-only mode” that blocks `Write`/`Edit` and mutating `Bash` when enabled
- **read-path-guard.mjs** (PreToolUse): Blocks `Read` on directories (including relative paths) to prevent `EISDIR` errors (suggests `Glob`/`Search`)
- **router-first-enforcer.mjs** (PreToolUse): Enforces router-first gating and explicit handoffs
- **orchestrator-tool-guard.mjs** (PreToolUse): Prevents orchestrators from high-fanout scans
- **run-observer.mjs** (Pre/PostToolUse): Writes durable run state and tool event logs
- **router-completion-handler.mjs** (PostToolUse): Persists routing completion + decision artifacts
- **audit-post-tool.mjs** (PostToolUse): Logs tool execution for audit trail

See `.claude/hooks/README.md` for detailed hook documentation.

**Agent discovery:** Registry-first (`.claude/context/agent-registry.json`) with filesystem fallback if missing; CI enforces registry freshness. After adding an agent, update `.claude/config/agent-config.json` so spawn tool defaults are available even before registry-requiredTools exist.

### Pre-commit security lint (Git)

When you commit, a **Git pre-commit hook** runs a security scanner on staged files (`.claude/tools/cli/security-lint.cjs --staged`). It blocks commits if critical or high-severity issues are found.

- **Exclusions:** Documentation and example-only paths are not scanned or are treated as allowed false positives (e.g. `.claude/docs/`, `.claude/context/plans/`, `.claude/skills/` for `.md`; specific path+rule pairs in code).
- **Details and configuration:** See [.claude/docs/SECURITY_LINT.md](.claude/docs/SECURITY_LINT.md) for skip rules, how to add exclusions, and how to run or bypass the check.

### Where outputs go (standardized)

- **Reports**: `.claude/context/reports/` (outcomes, diagnostics, issues)
- **Artifacts**: `.claude/context/artifacts/` (structured outputs like routing decisions, tool event streams)
- **Run state/events**: `.claude/context/runtime/**/runs/<runId>/`

### Optional observability tuning

- `CLAUDE_PENDING_SUBAGENT_TTL_MS`: Drops stale `Task`→`SubagentStart` pending mappings after a TTL (default: `180000`).
- `CLAUDE_OBS_STORE_PAYLOADS`: When set to `1`, `run-observer.mjs` stores sanitized tool inputs/outputs under `.claude/context/payloads/` and links them from `events.ndjson` via `event.payload.payload_ref`.
- `CLAUDE_OBS_FAILURE_BUNDLES`: When set to `1`, denials and tool failures generate a failure bundle JSON under `.claude/context/artifacts/failure-bundles/`.
  - Optional knobs: `CLAUDE_PAYLOAD_MAX_BYTES`, `CLAUDE_PAYLOAD_TTL_DAYS`, `CLAUDE_FAILURE_BUNDLE_TAIL_LINES`, `CLAUDE_FAILURE_BUNDLE_TAIL_BYTES`.

Where to set these:

- In your terminal environment before launching Claude Code (recommended), or
- In a local override file `.claude/settings.local.json` (`env` block).

### Worker runtime (optional)

- **Enable**: set `WORKER_ENABLED=1` to run the headless loop (maintenance, index updates, reflection queue).
- **Heartbeat**: `.claude/context/runtime/worker-heartbeat.json`
- **Metrics**: `.claude/context/runtime/worker.jsonl` (disable with `WORKER_METRICS=off`)
- **Summary**: `pnpm worker:summary` for last ticks and status
- **Event bus**: one `TOOL_COMPLETED`/`TOOL_FAILED` per tick (`toolName: 'worker-loop'`, disable with `WORKER_EVENTS=off`). Source: `.claude/lib/events/event-bus.cjs` + `.claude/lib/events/event-types.cjs`.
- **Event log**: `.claude/context/runtime/event-bus.jsonl` (disable with `EVENT_BUS_SINK=off`)

### Optional safety switches

- Read-only mode: `node .claude/tools/read-only.mjs enable` (disable with `node .claude/tools/read-only.mjs disable`)
- Client context: `node .claude/tools/client-context.mjs set claude-code` (see `.claude/config/client-contexts.json`)

### Known limitations

- **agent:production** delegates to `agent:worker` (sets `WORKER_ENABLED=1`) for headless runs.

### Step 4: Test It Works

```
# Try a simple command
/review

# Or trigger an agent with keywords
"I need to design a database schema for user management"
→ [Routes to database-architect agent]
```

### Optional: Run integration test prompts (Claude Code)

Two paste-ready prompts are included for end-to-end validation:

- Ship readiness (UI-safe): `.claude/prompts/ship-readiness.md`
- Agent framework integration (UI-safe): `.claude/prompts/agent-framework-integration.md`

After running an integration prompt, verify outputs:

```bash
node .claude/tools/verify-agent-integration.mjs --workflow-id agent-integration-v1-<YYYYMMDD-HHMMSS>
```

For a UI-safe, deterministic ship-readiness run (recommended on Windows / debug mode), run the headless audit:

```bash
pnpm ship-readiness:headless:json
```

Then verify:

```bash
node .claude/tools/verify-ship-readiness.mjs --workflow-id ship-readiness-v1-<YYYYMMDD-HHMMSS> --json
```

Debug-mode note (Windows): Claude Code may launch some hooks with `CLAUDE_SESSION_ID` set (UUID) while others lack it. This repo normalizes UUID-like ids to `shared-<uuid>` and persists them to `.claude/context/tmp/shared-session-key.json` so routing/observability state doesn’t split across processes.

## ⚠️ Claude Code 2.1.2: Windows Managed Settings Migration

**BREAKING CHANGE**: Claude Code 2.1.2 changes the Windows managed settings path.

### Migration Required for Windows Users

If you're using Claude Code on Windows, you must migrate your managed settings:

**Old Path** (deprecated): `C:\ProgramData\ClaudeCode\managed-settings.json`
**New Path**: `C:\Program Files\ClaudeCode\managed-settings.json`

### Migration Steps

1. **Backup your settings**:

   ```powershell
   Copy-Item -Path "C:\ProgramData\ClaudeCode\managed-settings.json" `
     -Destination "C:\ProgramData\ClaudeCode\managed-settings.json.backup"
   ```

2. **Copy to new location**:

   ```powershell
   Copy-Item -Path "C:\ProgramData\ClaudeCode\managed-settings.json" `
     -Destination "C:\Program Files\ClaudeCode\managed-settings.json"
   ```

3. **Update deployment scripts** (if applicable):
   - Update any CI/CD pipelines referencing the old path
   - Update any automation scripts using the old path
   - Update documentation referencing the old path

4. **Verify new path works**:
   - Restart Claude Code
   - Check that your settings are applied
   - Confirm hooks and configurations are active

5. **Clean up** (after verification):
   ```powershell
   # Only after confirming new path works
   Remove-Item -Path "C:\ProgramData\ClaudeCode\managed-settings.json"
   ```

### Verification

After migration, verify the new path is working:

```powershell
# Check that new file exists and has content
Get-Content "C:\Program Files\ClaudeCode\managed-settings.json" | ConvertFrom-Json
```

---

## Codex Skills Setup (Optional)

Codex skills enable multi-AI validation by invoking external CLI tools. This is **optional** - Agent Studio skills work without any CLI installation.

### Why Use Codex Skills?

- **Multi-model consensus**: Get validation from Claude + Gemini + Codex simultaneously
- **Higher confidence**: Critical decisions validated by multiple AI models
- **Reduced false positives**: Agreement across models indicates genuine issues

### Prerequisites

- Node.js >= 18.x
- npm or pnpm
- (Windows) PowerShell or CMD, WSL recommended

### CLI Installation

#### 1. Claude Code CLI (Required)

```bash
# Install globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version

# Authenticate
claude login
```

#### 2. Gemini CLI (Required)

```bash
# Install globally
npm install -g @anthropic-ai/gemini

# Verify installation
gemini --version

# Authenticate (requires Google Cloud API key)
export GEMINI_API_KEY=your-api-key-here
# or use session-based auth
gemini login
```

#### 3. OpenAI Codex (Optional)

```bash
# Install globally
npm install -g @openai/codex

# Verify installation
codex --version

# Authenticate
export OPENAI_API_KEY=your-api-key-here
```

#### 4. Cursor Agent (Optional, via WSL on Windows)

```bash
# Inside WSL
wsl bash -lc "curl https://cursor.com/install -fsS | bash"

# Verify installation
cursor-agent --version
```

#### 5. GitHub Copilot (Optional)

```bash
# Install globally
npm install -g @github/copilot

# Authenticate with GitHub
gh auth login

# Verify installation
copilot --version
```

### Windows-Specific Setup

See `.claude/docs/WINDOWS_SETUP.md` for detailed Windows instructions, including:

- PATH configuration
- .cmd shim handling
- WSL setup and usage
- Troubleshooting common issues

### Verification

Run the integration tests to verify Codex skills work:

```bash
# Run Codex skills integration tests
pnpm test:codex-integration

# Run Windows compatibility tests (Windows only)
pnpm test:windows-compat
```

### Authentication Modes

Codex skills support two authentication modes:

1. **Session-First** (default): Uses CLI session/subscription, falls back to env keys
2. **Env-First**: Uses environment keys first, falls back to session

Configure in `.claude/config.yaml`:

```yaml
codex_skills:
  auth_mode: session-first # or "env-first"
```

### Troubleshooting

**Issue**: `claude: command not found`

- **Solution**: Ensure CLI installed and in PATH
- **Windows**: Add `%APPDATA%\npm` to PATH

**Issue**: `spawn claude ENOENT`

- **Solution**: Codex skills automatically use `shell: true` on Windows
- **If persists**: Use WSL for best compatibility

**Issue**: CLI installed but still not found

- **Solution**: Restart terminal or IDE to pick up PATH changes

For more troubleshooting, see:

- `.claude/docs/WINDOWS_SETUP.md` (Windows-specific)
- `.claude/docs/SKILLS_TAXONOMY.md` (Skill comparison)
- `codex-skills/multi-ai-code-review/SKILL.md` (Skill documentation)

---

## New Features in 2.1.2

### Skill Auto-Injection (Phase 2B)

Skills can now be automatically injected into subagent contexts via the `skill-injection-hook.js`. This provides:

- **Zero overhead**: Automatic skill enhancement without orchestrator involvement
- **Token savings**: 80% context savings through smart skill forking
- **Consistency**: Always uses the latest skill-integration-matrix.json
- **Performance**: Less than 100ms overhead

See [Skill Injection](#skill-injection) section below for details.

### context:fork Feature

Skills now support a `context:fork` field that enables smart context optimization:

```yaml
# In skill frontmatter
context:fork: true # Allow forking into subagent contexts
```

Benefits:

- Skills can be selectively forked to reduce subagent context bloat
- Only skills with `context:fork: true` are injected
- Reduces subagent prompt size by 80% while maintaining functionality
- Automatic in workflows via skill-injection-hook

### Hook Execution Order

Hooks now execute in a predictable order:

1. **PreToolUse** (before tool execution):
   - security-pre-tool.sh - Blocks dangerous commands
   - orchestrator-enforcement-hook.mjs - Enforces orchestrator rules
   - skill-injection-hook.js - Injects skills into Task calls

2. **PostToolUse** (after tool execution):
   - audit-post-tool.sh - Logs all tool executions
   - skill-injection-hook.js - Validates injected skills

**Note**: TodoWrite and Task tools are excluded from most hooks to prevent recursion.

### Additional 2.1.2 Features

- **Large outputs to disk**: Supports writing large outputs directly to disk
- **Binary file support**: Binary files can now be processed and stored
- **Zod 4.0 requirement**: Updated schema validation (see UPGRADE_GUIDE_2.1.2.md)
- **Context compressing**: Automatic state compression for long-running tasks

See `.claude/docs/UPGRADE_GUIDE_2.1.2.md` for complete migration guide.

---

## Skill Injection

Skill injection enables Claude to automatically attach selected skill context to subagent runs, reducing repeated prompting and improving reliability during long-running workflows.

Key points:

- Controlled by the skill frontmatter field `context:fork: true`
- Implemented by the `skill-injection-hook.js` hook (see `.claude/hooks/`)
- Designed to reduce subagent context bloat while keeping specialized capabilities available

## Validation (Optional)

Validate your configuration after copying:

```bash
# Install validation dependencies
pnpm install

# Run validation
pnpm validate          # Fast validation (config, models)
pnpm validate:all      # Full validation (includes workflows, references, CUJs, rule index)

# Cleanup (recommended before commits)
pnpm cleanup:check     # Preview what would be deleted (safe)
pnpm cleanup           # Delete temp/runtime files (use with care)
node .claude/tools/cleanup-repo.mjs --dry-run --reports-retention-days 5   # Optional: preview pruning reports older than 5 days
node .claude/tools/cleanup-repo.mjs --execute --reports-retention-days 5   # Optional: prune reports older than 5 days (opt-in)
```

**What fast validation checks**:

- Configuration files (config.yaml) are valid
- Model names are correct

**What full validation checks** (pnpm validate:all):

- All referenced agent files exist
- All workflow YAML files are valid
- All schema files exist
- All CUJ files are valid
- Hook configurations are valid
- Cross-platform sync (agents, skills)

## Configuration Files

| File                          | Purpose                               |
| ----------------------------- | ------------------------------------- |
| `.claude/settings.json`       | Default tool permissions and settings |
| `.claude/settings.local.json` | Local overrides (not committed)       |
| `.claude/config.yaml`         | Agent routing and trigger words       |
| `.claude/.mcp.json`           | MCP server configuration              |

**Local Overrides**: Create `.claude/settings.local.json` to override settings without modifying the committed config. This file is gitignored.

## What You Get

### Google A2A Protocol Integration 🌐

**NEW in 2026-01**: Full integration with Google's A2A (Agent-to-Agent) protocol v0.3.0 for standardized agent communication and external federation.

**Key Capabilities:**

- **Agent Discovery**: AgentCard generation for all 35 agents at `/.well-known/agent-card.json`
- **External Federation**: Discover and communicate with external A2A-compliant agents
- **Memory Integration**: Memory handoff in A2A Artifact format (200x faster than target)
- **Task Lifecycle**: 8-state task management (SUBMITTED → WORKING → COMPLETED/etc.)
- **Real-time Streaming**: Server-Sent Events (SSE) for live task updates
- **Push Notifications**: Webhook callbacks with HMAC-SHA256 signatures
- **Feature Flags**: 8 component flags for gradual rollout with instant rollback

**Performance:**

- AgentCard generation: 12.3ms (75% faster than target)
- Memory conversion: ~1ms (200x faster than target)
- Message wrapping: 0-1ms (100x faster than target)
- External discovery: <100ms with 30-minute caching

**Testing:**

```bash
# Run all A2A protocol tests (290 tests)
pnpm test:a2a

# Test specific components
pnpm test:a2a:framework    # A2A test framework (74 tests)
pnpm test:a2a:poc          # AgentCard generation (40 tests)
pnpm test:a2a:memory       # Memory-A2A bridge (73 tests)
pnpm test:a2a:lifecycle    # Task lifecycle (90 tests)
pnpm test:a2a:federation   # External federation (102 tests)
```

**Documentation**: See `.claude/context/runtime/reports/a2a-integration-completion-report.md` for comprehensive details.

---

### 35 Specialized Agents (NEW: Planner Agent!)

**NEW**: Planner agent creates comprehensive plans before execution!

| Agent                  | Purpose                | Trigger Keywords                           |
| ---------------------- | ---------------------- | ------------------------------------------ |
| **Core Development**   |                        |                                            |
| analyst                | Research & discovery   | "market research", "competitive analysis"  |
| pm                     | Product requirements   | "prd", "user stories", "backlog"           |
| architect              | System design          | "architecture", "api design"               |
| database-architect     | Database design        | "database", "schema", "migration"          |
| developer              | Implementation         | "implement", "code", "debug"               |
| qa                     | Quality assurance      | "test", "qa", "quality gate"               |
| ux-expert              | Interface design       | "ux", "ui", "wireframe"                    |
| **Enterprise**         |                        |                                            |
| security-architect     | Security & compliance  | "security", "authentication"               |
| devops                 | Infrastructure         | "deployment", "ci/cd", "kubernetes"        |
| technical-writer       | Documentation          | "documentation", "api docs"                |
| orchestrator           | Task routing           | "coordinate", "workflow"                   |
| model-orchestrator     | Multi-model routing    | "use gemini", "call opus"                  |
| **Code Quality**       |                        |                                            |
| code-reviewer          | Systematic code review | "code review", "pr review"                 |
| refactoring-specialist | Code transformation    | "refactor", "code smell"                   |
| performance-engineer   | Optimization           | "performance", "optimize", "profiling"     |
| **Specialized**        |                        |                                            |
| llm-architect          | AI/LLM system design   | "ai system", "llm", "rag"                  |
| api-designer           | API design patterns    | "api design", "rest api", "graphql"        |
| legacy-modernizer      | System modernization   | "legacy", "modernize", "migration"         |
| mobile-developer       | Mobile development     | "mobile", "ios", "android", "react native" |
| accessibility-expert   | WCAG compliance        | "accessibility", "wcag", "a11y"            |
| compliance-auditor     | Regulatory compliance  | "gdpr", "hipaa", "soc2"                    |
| incident-responder     | Crisis management      | "incident", "outage", "post-mortem"        |

### 10 Workflows

| Workflow                 | Use Case                                | Steps                                                                                                                    | Iterative                            |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **quick-flow**           | Bug fixes, small features               | Developer → QA                                                                                                           | No                                   |
| **greenfield-fullstack** | New projects                            | Analyst → PM → UX → Architect → DB → QA → Dev → Docs → QA                                                                | No                                   |
| **brownfield-fullstack** | Existing codebases                      | Impact analysis → Requirements → Architecture → Migration → Test → Implement                                             | No                                   |
| **enterprise-track**     | Compliance-heavy projects               | Full security review, compliance mapping, audit documentation                                                            | No                                   |
| **code-quality-flow**    | Code review & refactoring               | Code-reviewer → Refactoring-specialist → Compliance-auditor → QA                                                         | No                                   |
| **performance-flow**     | Performance optimization                | Performance-engineer → Architect → Developer → QA                                                                        | No                                   |
| **ai-system-flow**       | AI/LLM features                         | Model-orchestrator → LLM-architect → API-designer → Developer → QA                                                       | No                                   |
| **mobile-flow**          | Mobile development                      | Mobile-developer → UX-expert → Developer → QA                                                                            | No                                   |
| **incident-flow**        | Production incidents                    | Incident-responder → DevOps → Security-architect → QA                                                                    | No                                   |
| **ui-perfection-loop**   | UI/UX quality improvement (95%+ target) | UX-expert + Accessibility-expert (parallel) → Model-orchestrator (Gemini validation) → Developer + Mobile-developer → QA | **Yes** (iterates until score >= 95) |

### 13 Slash Commands

| Command          | Purpose                                       | Example                                                 |
| ---------------- | --------------------------------------------- | ------------------------------------------------------- |
| **Core**         |                                               |                                                         |
| `/review`        | Comprehensive code review                     | `/review` or `/review src/components/`                  |
| `/fix-issue <n>` | Fix GitHub issue by number                    | `/fix-issue 123`                                        |
| `/quick-ship`    | Fast iteration workflow                       | `/quick-ship Fix login button alignment`                |
| `/run-workflow`  | Execute a specific workflow                   | `/run-workflow code-quality`                            |
| **Skills**       |                                               |                                                         |
| `/select-rules`  | Auto-detect stack and configure rules         | `/select-rules`                                         |
| `/audit`         | Validate code against loaded rules            | `/audit src/components/` or `/audit --format json`      |
| `/scaffold`      | Generate rule-compliant boilerplate           | `/scaffold component UserProfile`                       |
| **Workflows**    |                                               |                                                         |
| `/code-quality`  | Code quality improvement workflow             | `/code-quality`                                         |
| `/performance`   | Performance optimization workflow             | `/performance --target api/`                            |
| `/ai-system`     | AI/LLM system development workflow            | `/ai-system`                                            |
| `/mobile`        | Mobile application workflow                   | `/mobile`                                               |
| `/incident`      | Incident response workflow                    | `/incident`                                             |
| `/ui-perfection` | UI/UX iterative perfection loop (95%+ target) | `/ui-perfection --component UserProfile.tsx --score 98` |

### 13 Utility Skills (Cross-Platform)

**NEW**: 5 new skills added for planning, diagrams, testing, dependencies, and documentation!

Skills work across all three platforms with consistent functionality.

| Skill                  | Purpose                              | Claude           | Cursor                  | Factory   |
| ---------------------- | ------------------------------------ | ---------------- | ----------------------- | --------- |
| `repo-rag`             | Codebase retrieval                   | Natural language | `@repo-rag`             | Task tool |
| `artifact-publisher`   | Publish artifacts                    | Natural language | `@artifact-publisher`   | Task tool |
| `context-bridge`       | Cross-platform sync                  | Natural language | `@context-bridge`       | Task tool |
| `rule-auditor`         | Validate against rules               | Natural language | `@rule-auditor`         | Task tool |
| `rule-selector`        | Auto-configure rules                 | Natural language | `@rule-selector`        | Task tool |
| `scaffolder`           | Generate compliant code              | Natural language | `@scaffolder`           | Task tool |
| `commit-validator`     | Validate commit messages             | Natural language | `@commit-validator`     | Task tool |
| `code-style-validator` | AST-based style validation           | Natural language | `@code-style-validator` | Task tool |
| `claude-md-generator`  | Auto-generate claude.md files (NEW!) | Natural language | `@claude-md-generator`  | Task tool |
| `plan-generator`       | Create structured plans (NEW!)       | Natural language | `@plan-generator`       | Task tool |
| `diagram-generator`    | Generate diagrams (NEW!)             | Natural language | `@diagram-generator`    | Task tool |
| `test-generator`       | Generate test code (NEW!)            | Natural language | `@test-generator`       | Task tool |
| `dependency-analyzer`  | Analyze dependencies (NEW!)          | Natural language | `@dependency-analyzer`  | Task tool |
| `doc-generator`        | Generate documentation (NEW!)        | Natural language | `@doc-generator`        | Task tool |

**Skill Locations:**

- Claude: `.claude/skills/*/SKILL.md`
- Cursor: `.cursor/skills/*.md`

## How Workflows Work

Understanding how workflows execute is key to using the system effectively. This section explains the complete execution flow from trigger to completion.

### Workflow Triggering

Workflows can be triggered in two ways:

#### 1. Automatic Keyword Matching

When you use natural language, the system automatically selects a workflow:

**Process:**

1. **Extract Keywords**: System extracts keywords from your prompt
2. **Match Workflows**: Keywords matched against `workflow_selection` in `config.yaml`
3. **Count Matches**: Count how many keywords match each workflow
4. **Priority Selection**: Among matching workflows, select the one with **lowest priority number** (0 = highest priority)
5. **Default Fallback**: If no matches, use `default_workflow` (typically `fullstack`)

**Example:**

```
User: "Build a new authentication feature from scratch"
→ Keywords detected: "new", "from scratch"
→ Matches: `fullstack` workflow (keywords: "new project", "from scratch", "greenfield")
→ Priority: 2 (medium priority)
→ Selected: `fullstack` workflow
→ Executes: Planner (Step 0) → Full Stack Flow with all agents (Steps 1-N)
```

**Priority System:**

- **Priority 0**: Incident Flow (critical - highest priority)
- **Priority 1**: Quick Flow
- **Priority 2**: Full Stack Flow, UI Perfection Loop
- **Priority 3**: Code Quality, Performance, AI System, Mobile

#### 2. Slash Commands

Slash commands directly invoke specific workflows:

```
/quick-ship Fix login button
→ Directly triggers quick-flow workflow
→ Bypasses keyword matching
```

### Workflow Execution Flow

Once a workflow is selected, here's what happens step-by-step:

#### Step 0: Session Initialization

1. **Generate Workflow ID**: Create unique identifier (e.g., `1735123456-abc123`)
2. **Create Session Directories**:
   - `.claude/context/history/gates/{workflow_id}/` - Validation gates
   - `.claude/context/history/reasoning/{workflow_id}/` - Agent reasoning files
   - `.claude/context/artifacts/` - Step outputs (shared)

#### Step 1-N: Sequential Step Execution

For each step in the workflow YAML:

**1. Load Step Configuration**

- Read step definition from workflow YAML
- Identify agent, inputs, outputs, validation requirements

**2. Activate Agent**

- Load agent definition from `.claude/agents/{agent}.md`
- Load agent context files from `config.yaml` (if specified)
- Apply agent-specific settings (model, temperature, etc.)

**3. Prepare Inputs**

- Load artifacts from previous steps (from `.claude/context/artifacts/generated/` or `.claude/context/artifacts/reference/`)
- Resolve template variables (e.g., `{{workflow_id}}` → actual ID)
- Pass user requirements and context

**4. Execute Agent Task**

- Agent performs work using available tools
- Agent can read templates, generate code, create documents
- Agent saves reasoning files to `.claude/context/history/reasoning/{workflow_id}/`

**5. Save Outputs**

- Save artifacts to `.claude/context/artifacts/generated/{artifact-name}.json` (use resolver for path resolution)
- Artifacts become inputs for subsequent steps
- Special outputs:
  - `code-artifacts`: Code files/directories (not validated)
  - `reasoning: path/to/file.json`: Agent decision-making documentation

**6. Validate Step Output**

- Run `workflow_runner.js` with step number and workflow ID
- If schema specified: Validate JSON structure against schema
- Always create gate file: `.claude/context/history/gates/{workflow_id}/{step}-{agent}.json`
- Gate file contains: validation status, errors (if any), warnings

**7. Handle Validation Results**

- **Success**: Proceed to next step
- **Failure**:
  - Provide feedback to agent (max 3 retries)
  - Agent corrects output
  - Re-validate until passing or max retries reached

#### Artifact Passing Between Steps

Each step's outputs become inputs for subsequent steps:

**Pattern:**

```yaml
# Step 1 Output
outputs:
  - project-brief.json

# Step 2 Input (references Step 1)
inputs:
  - project-brief.json (from step 1)
```

**How It Works:**

1. Step 1 saves `project-brief.json` to `.claude/context/artifacts/generated/` (via resolver)
2. Step 2 reads `project-brief.json` from `.claude/context/artifacts/generated/` (via resolver fallback)
3. Agent in Step 2 uses the artifact as context for its work

**Template Variables:**
Artifacts can use template variables that are resolved at runtime:

- `{{workflow_id}}`: Unique workflow identifier (required)
- `{{story_id}}`: Story identifier for story loops (optional)
- `{{epic_id}}`: Epic identifier for epic loops (optional)

**Example:**

```yaml
outputs:
  - plan-{{workflow_id}}.json
  # Resolves to: plan-1735123456-abc123.json
```

### Complete End-to-End Example

Here's a complete example showing the full execution flow:

#### User Prompt

```
"I need a task management dashboard with user authentication"
```

#### Execution Flow

**1. Workflow Selection**

- Keywords: "task management", "dashboard", "authentication"
- Matches: `fullstack` workflow (keywords: "new project", "full stack")
- Selected: `greenfield-fullstack.yaml`

**2. Session Initialization**

- Workflow ID: `1735123456-abc123`
- Directories created:
  - `.claude/context/history/gates/1735123456-abc123/`
  - `.claude/context/history/reasoning/1735123456-abc123/`

**3. Step 0: Planner**

- **Agent**: `planner`
- **Inputs**: User requirements, business objectives
- **Actions**:
  - Loads template: `.claude/templates/plan-template.md`
  - Creates comprehensive plan
  - Coordinates with specialists (Analyst, PM, Architect) for input
- **Outputs**:
  - `plan-1735123456-abc123.md`
  - `plan-1735123456-abc123.json`
  - `reasoning: .claude/context/history/reasoning/1735123456-abc123/00-planner.json`
- **Validation**:
  - Schema: `.claude/schemas/plan.schema.json`
  - Gate: `.claude/context/history/gates/1735123456-abc123/00-planner.json`
  - Status: ✅ Pass

**4. Step 1: Analyst**

- **Agent**: `analyst`
- **Inputs**:
  - `plan-1735123456-abc123.json` (from step 0)
  - User requirements
- **Actions**:
  - Researches task management patterns
  - Analyzes requirements
  - Creates project brief
- **Outputs**:
  - `project-brief.json` → Saved to `.claude/context/artifacts/project-brief.json`
  - `reasoning: .claude/context/history/reasoning/1735123456-abc123/01-analyst.json`
- **Validation**:
  - Schema: `.claude/schemas/project_brief.schema.json`
  - Gate: `.claude/context/history/gates/1735123456-abc123/01-analyst.json`
  - Status: ✅ Pass

**5. Step 2: PM**

- **Agent**: `pm`
- **Inputs**:
  - `plan-1735123456-abc123.json` (from step 0)
  - `project-brief.json` (from step 1) ← **Artifact from previous step**
- **Actions**:
  - Loads template: `.claude/templates/prd.md`
  - Creates PRD with user stories
  - Defines acceptance criteria
- **Outputs**:
  - `prd.json` → Saved to `.claude/context/artifacts/prd.json`
  - `reasoning: .claude/context/history/reasoning/1735123456-abc123/02-pm.json`
- **Validation**:
  - Schema: `.claude/schemas/product_requirements.schema.json`
  - Gate: `.claude/context/history/gates/1735123456-abc123/02-pm.json`
  - Status: ✅ Pass

**6. Steps 3-9: Continue Sequentially**

- Each step follows the same pattern
- Each step uses outputs from previous steps
- Each step validates before proceeding

**7. Completion**

- All steps validated successfully
- All artifacts created
- Quality gates passed
- Workflow complete

### Validation and Error Handling

#### Validation Process

Each step can specify validation:

```yaml
validation:
  schema: .claude/schemas/project_brief.schema.json
  gate: .claude/context/history/gates/{{workflow_id}}/01-analyst.json
```

**Validation Steps:**

1. Run: `node .claude/tools/workflow_runner.js --workflow <yaml> --step <N> --id <workflow_id>`
2. Script loads schema and validates output JSON
3. Creates gate file with validation results
4. Returns exit code 0 (success) or 1 (failure)

#### Error Handling

**If Validation Fails:**

1. Gate file contains error details
2. System provides feedback to agent
3. Agent corrects output (max 3 retries)
4. Re-validate until passing

**Common Issues:**

- **Missing Artifacts**: Previous step didn't create required artifact
- **Schema Mismatch**: Output doesn't match expected schema structure
- **Template Variables**: Variables not resolved (e.g., `{{workflow_id}}` not provided)
- **Agent Errors**: Agent failed to understand task or generate correct output

### Manual Workflow Execution

You can also manually execute workflows:

**1. Select Workflow**

- Choose from available workflows in `config.yaml`
- Or use slash command: `/run-workflow <workflow-name>`

**2. Initialize Session**

```bash
WORKFLOW_ID=$(date +%s)-$(uuidgen | cut -d'-' -f1)
mkdir -p .claude/context/history/gates/$WORKFLOW_ID
```

**3. Execute Steps**
For each step:

```bash
# Execute step 1
node .claude/tools/workflow_runner.js \
  --workflow .claude/workflows/greenfield-fullstack.yaml \
  --step 1 \
  --id $WORKFLOW_ID
```

**4. Handle Failures**

- Review gate file for errors
- Provide feedback to agent
- Retry step or adjust approach

### Workflow vs Skill vs Agent

**Workflow**: Multi-step orchestration

- Coordinates multiple agents
- Passes artifacts between steps
- Validates each step
- Example: `/code-quality` (5 steps, 4 agents)

**Skill**: Single utility function

- Performs one specific task
- No multi-step orchestration
- Example: `/scaffold` (generates code)

**Agent**: Specialized AI assistant

- Activated by keywords or workflow
- Performs specific role (Developer, Architect, etc.)
- Can be used standalone or in workflows

## Customer User Journeys (CUJs)

We have **48 documented Customer User Journeys** that show complete workflows from start to finish (CUJ-031/032/033 are reserved/removed):

- **Onboarding & Setup** (CUJ-001 to CUJ-003)
- **Planning & Architecture** (CUJ-004 to CUJ-008)
- **Development** (CUJ-009 to CUJ-012)
- **Quality Assurance** (CUJ-013 to CUJ-015)
- **Documentation** (CUJ-016 to CUJ-018)
- **Specialized Workflows** (CUJ-019 to CUJ-022)
- **Maintenance & Operations** (CUJ-023 to CUJ-024)

See `.claude/docs/cujs/CUJ-INDEX.md` for the complete index and individual CUJ files for detailed workflows.

## Example Prompts & Workflows

> **Note**: For detailed workflow execution flow, see the "How Workflows Work" section above.

### Building a New Feature

**Prompt:**

```
"I need a task management dashboard with user authentication"
```

**What Happens:**

1. **Workflow Selection**: Keywords "new", "dashboard" match `fullstack` workflow
2. **Step 0**: Planner creates comprehensive plan
3. **Step 1**: Analyst creates project brief (uses plan from Step 0)
4. **Step 2**: PM creates PRD with user stories (uses plan + project brief)
5. **Step 3**: UX Expert designs interface (uses plan + PRD)
6. **Step 4**: Architect designs system (uses plan + PRD + UX spec)
7. **Step 5**: Database Architect designs schema (uses plan + system architecture)
8. **Step 6**: QA creates test plan (uses plan + architecture + database)
9. **Step 7**: Developer implements (uses plan + all previous artifacts)
10. **Step 8**: Technical Writer documents (uses plan + dev manifest)
11. **Step 9**: QA validates quality gates (uses plan + dev manifest + test plan)

**Artifact Flow:**

- Each step saves outputs to `.claude/context/artifacts/`
- Next step reads artifacts as inputs
- All steps reference the plan from Step 0

### Quick Bug Fix

**Prompt:**

```
/quick-ship Fix the login button alignment
```

**What Happens:**

- Quick flow workflow activates
- Step 1: Developer fixes the issue
- Step 2: QA validates the fix

### UI Perfection Loop (Iterative)

**Prompt:**

```
/ui-perfection --component app/components/Dashboard.tsx --score 98 --glassmorphism --images designs/ref-1.png designs/ref-2.png
```

**What Happens:**

- Phase 1: UX Expert + Accessibility Expert (parallel audit)
- Phase 2: Model Orchestrator (Gemini validation, scoring)
- Phase 3: Developer + Mobile Developer (implementation)
- Phase 4: QA (verification with anti-hallucination protocol)
- **Iterates** until score >= 98 or max iterations (5) reached
- Each iteration preserves context and compares scores

### Code Quality Review

**Prompt:**

```
/code-quality
```

**What Happens:**

- Code-reviewer analyzes code quality
- Refactoring-specialist creates transformation plan
- Compliance-auditor validates standards
- QA runs final validation

### Performance Optimization

**Prompt:**

```
/performance --target api/users
```

**What Happens:**

- Performance-engineer profiles and identifies bottlenecks
- Architect reviews optimization strategy
- Developer implements optimizations
- QA validates performance improvements

### AI System Development

**Prompt:**

```
/ai-system
```

**What Happens:**

- Model-orchestrator plans multi-model routing
- LLM-architect designs RAG pipeline and prompt engineering
- API-designer creates API specification
- Developer implements AI features
- QA validates AI quality and safety

### Mobile Development

**Prompt:**

```
/mobile
```

**What Happens:**

- Mobile-developer plans platform strategy
- UX-expert designs mobile interface
- Developer implements mobile features
- QA tests on multiple devices

### Incident Response

**Prompt:**

```
/incident
```

**What Happens:**

- Incident-responder analyzes the crisis
- DevOps implements fixes
- Security-architect reviews security implications
- QA validates resolution

### Using Skills Directly

**Prompt:**

```
"Select rules for this Next.js TypeScript project"
```

**What Happens:**

- rule-selector skill activates
- Auto-detects tech stack
- Configures optimal rules in manifest.yaml

**Prompt:**

```
"Scaffold a UserProfile component with authentication"
```

**What Happens:**

- scaffolder skill activates
- Generates rule-compliant component code
- Includes types, tests, and proper structure

**Prompt:**

```
"Audit src/components/ against our rules"
```

**What Happens:**

- rule-auditor skill activates
- Validates code against loaded rules
- Generates compliance report with violations and fixes

**Prompt:**

```
"Validate this commit message: feat(auth): add OAuth2 support"
```

**What Happens:**

- commit-validator skill activates
- Validates against Conventional Commits format
- Returns pass/fail with suggestions if invalid

### Using A2A Protocol

**Prompt:**

```
"Generate AgentCards for all agents"
```

**What Happens:**

- A2A agent-card-generator creates cards for all 35 agents
- Served at `/.well-known/agent-card.json`
- Includes capabilities, skills, security metadata

**Prompt:**

```
"Discover external A2A agents at https://example.com"
```

**What Happens:**

- A2A external-agent-discovery fetches external AgentCards
- Caches discovery results for 30 minutes
- Returns agent capabilities and communication endpoints

**Prompt:**

```
"Start A2A discovery server"
```

**What Happens:**

- A2A discovery-endpoint starts HTTP server
- Serves AgentCards at `/.well-known/agent-card.json`
- Enables external agents to discover your capabilities

## Slash Commands (2.1.2+)

Quick access to frequently-used skills and workflows via slash commands.

### Available Commands

| Command              | Description              | Example                      |
| -------------------- | ------------------------ | ---------------------------- |
| `/rule-auditor`      | Audit code against rules | `/rule-auditor src/`         |
| `/rate-plan`         | Rate plan quality        | `/rate-plan plan.md`         |
| `/generate-tests`    | Generate test code       | `/generate-tests Button.tsx` |
| `/generate-docs`     | Generate documentation   | `/generate-docs api/`        |
| `/validate-security` | Security validation      | `/validate-security auth/`   |

### Usage

Simply type the command in Claude Code:

```
/rule-auditor src/components/
```

For detailed help on any command:

```
/rule-auditor --help
```

See `.claude/commands/` for all available commands.

---

## Troubleshooting

### Workflow Issues

#### Workflow Not Triggering

**Problem**: Natural language prompt doesn't trigger expected workflow

**Solutions**:

1. Check keywords match workflow in `config.yaml`
   - View `.claude/config.yaml` → `workflow_selection` section
   - Ensure your prompt contains matching keywords
2. Use slash command for direct invocation:
   ```
   /code-quality  # Directly triggers code-quality workflow
   ```
3. Check priority: Lower number = higher priority
   - Incident (0) > Quick (1) > Full Stack (2) > Others (3)
4. Verify workflow file exists:
   - Check `.claude/workflows/{workflow-name}.yaml` exists

#### Workflow Step Failing

**Problem**: Step validation fails or agent doesn't produce expected output

**Solutions**:

1. Check gate file for errors:
   ```bash
   cat .claude/context/history/gates/{workflow_id}/{step}-{agent}.json
   ```
2. Review agent reasoning file:
   ```bash
   cat .claude/context/history/reasoning/{workflow_id}/{step}-{agent}.json
   ```
3. Verify previous step outputs exist:
   ```bash
   ls .claude/context/artifacts/
   # Check that required artifacts from previous steps exist
   ```
4. Check artifact naming matches:
   - Step outputs must match step inputs exactly
   - Use kebab-case: `project-brief.json` (not `project_brief.json`)
5. Verify schema validation:
   - Check schema file exists: `.claude/schemas/{schema-name}.schema.json`
   - Validate JSON structure matches schema

#### Artifacts Not Passing Between Steps

**Problem**: Step can't find artifact from previous step

**Solutions**:

1. Verify artifact was created:
   ```bash
   ls .claude/context/artifacts/
   # Should see artifact from previous step
   ```
2. Check artifact name matches exactly:
   - Output: `project-brief.json`
   - Input: `project-brief.json` (must match exactly)
3. Verify template variables resolved:
   - `{{workflow_id}}` must be provided via `--id` argument
   - Check artifact name doesn't contain unresolved variables
4. Check step number in reference:
   - `artifact.json (from step 1)` - step number must be correct

#### Validation Errors

**Problem**: Schema validation fails

**Solutions**:

1. Check schema file exists and is valid JSON
2. Verify output JSON structure matches schema
3. Review gate file for specific validation errors
4. Manually validate JSON:
   ```bash
   node -e "const schema = require('./.claude/schemas/plan.schema.json'); const data = require('./.claude/context/artifacts/plan-{id}.json'); console.log('Valid:', require('ajv')().compile(schema)(data));"
   ```

### Agents Not Activating

1. Check `CLAUDE.md` is in project root (not inside `.claude/`)
2. Verify `.claude/config.yaml` exists
3. Restart Claude Code after copying files
4. Check agent file exists: `.claude/agents/{agent-name}.md`

### Hooks Not Running

1. Enable hooks in Preferences > Claude Code > Hooks
2. Point to `.claude/hooks` directory
3. Check hook files are executable (Linux/Mac)

**Available Hooks:**

- **security-pre-tool.sh** (PreToolUse): Blocks dangerous commands before execution
- **audit-post-tool.sh** (PostToolUse): Logs all tool executions for audit trail

**Testing Hooks:**

```bash
# Test security hook blocks dangerous command
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | bash .claude/hooks/security-pre-tool.sh
# Expected: {"decision": "block", "reason": "Blocked dangerous command pattern"}

# Test audit hook logs execution
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | bash .claude/hooks/audit-post-tool.sh
cat ~/.claude/audit/tool-usage.log
```

### Slash Commands Not Found

1. Commands load from `.claude/commands/*.md`
2. Restart Claude Code after adding commands
3. Check file extension is `.md`

### A2A Protocol Issues (NEW)

#### A2A Tests Failing

**Problem**: A2A test suite shows failures

**Solutions**:

1. Run specific test suite to identify failing component:

   ```bash
   pnpm test:a2a:framework    # Test framework
   pnpm test:a2a:poc          # AgentCard generation
   pnpm test:a2a:memory       # Memory bridge
   pnpm test:a2a:lifecycle    # Task lifecycle
   pnpm test:a2a:federation   # External federation
   ```

2. Check feature flags configuration:
   - Feature flags at `.claude/config/feature-flags.json`
   - Safe defaults: all flags OFF
   - Enable flags incrementally: `a2a.agent_card_generation`, `a2a.memory_bridge`, etc.

3. Verify A2A modules exist:
   ```bash
   ls .claude/tools/a2a/
   # Should see: agent-card-generator.mjs, discovery-endpoint.mjs, etc.
   ```

#### AgentCard Generation Issues

**Problem**: AgentCards not generating or serving

**Solutions**:

1. Run AgentCard generator directly:

   ```bash
   node .claude/tools/a2a/agent-card-generator.mjs
   ```

2. Check agent definitions exist:

   ```bash
   ls .claude/agents/
   # Should see 35 agent .md files
   ```

3. Verify AgentCard schema:
   - Each agent file should have frontmatter with capabilities
   - Format: YAML frontmatter with `role`, `model`, `capabilities`

#### External Agent Discovery Issues

**Problem**: Can't discover external A2A agents

**Solutions**:

1. Check URL is accessible:

   ```bash
   curl https://example.com/.well-known/agent-card.json
   # Should return valid JSON
   ```

2. Verify cache settings:
   - Cache duration: 30 minutes default
   - Clear cache: Restart discovery endpoint

3. Check network connectivity:
   - Ensure no firewall blocking outbound HTTPS
   - Verify DNS resolution

#### Memory-A2A Conversion Issues

**Problem**: Memory conversion to A2A Artifact format failing

**Solutions**:

1. Test memory bridge directly:

   ```bash
   node .claude/tools/a2a/memory-a2a-bridge.mjs
   ```

2. Verify memory system working:

   ```bash
   # Check hierarchical memory
   ls .claude/tools/memory/
   # Should see: hierarchical-memory.mjs, entity-memory.mjs, etc.
   ```

3. Check conversion performance:
   - Target: <200ms conversion time
   - Actual: ~1ms (200x faster)
   - If slower: Check memory file sizes

## Hooks System

### Available Hooks

The Agent Studio system includes two native Claude Code hooks that provide security and audit capabilities:

**1. security-pre-tool.sh (PreToolUse Hook)**

- **Purpose**: Validates and blocks dangerous operations before execution
- **Location**: `.claude/hooks/security-pre-tool.sh`
- **When it runs**: Before every tool execution
- **Blocks**:
  - Dangerous shell commands (`rm -rf /`, `sudo rm`, `mkfs`, `dd`, etc.)
  - Code injection patterns (`eval`, `python -c`, `node -e`, etc.)
  - Remote code execution (`curl|bash`, `wget|sh`, etc.)
  - SQL injection attempts (`DROP DATABASE`, etc.)
  - Credential file modifications (`.env`, `.pem`, `.key`, etc.)
  - Force push to main/master branches
  - PowerShell encoded commands (Windows)

**2. audit-post-tool.sh (PostToolUse Hook)**

- **Purpose**: Logs all tool executions for audit trail
- **Location**: `.claude/hooks/audit-post-tool.sh`
- **When it runs**: After every tool execution
- **Logs**:
  - Timestamp of execution
  - Tool name and command/file path
  - Stores in `~/.claude/audit/tool-usage.log`
  - Auto-rotates logs to prevent disk bloat (max 10MB)

### Enabling Hooks

**Method 1: Via Claude Code UI**

1. Open Claude Code in your project
2. Go to **Preferences > Claude Code > Hooks**
3. Point to `.claude/hooks` directory
4. Enable both hooks:
   - PreToolUse: `.claude/hooks/security-pre-tool.sh`
   - PostToolUse: `.claude/hooks/audit-post-tool.sh`

**Method 2: Manual Configuration**
Add to your Claude Code settings:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "command": "bash .claude/hooks/security-pre-tool.sh"
      }
    ],
    "PostToolUse": [
      {
        "command": "bash .claude/hooks/audit-post-tool.sh"
      }
    ]
  }
}
```

### Testing Hooks

```bash
# Test security hook blocks dangerous command
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | bash .claude/hooks/security-pre-tool.sh
# Expected: {"decision": "block", "reason": "Blocked dangerous command pattern: rm -rf /"}

# Test security hook allows safe command
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | bash .claude/hooks/security-pre-tool.sh
# Expected: {"decision": "approve"}

# Test audit hook logs execution
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | bash .claude/hooks/audit-post-tool.sh
cat ~/.claude/audit/tool-usage.log
```

### Customizing Hooks

**Adding Blocked Patterns:**
Edit `.claude/hooks/security-pre-tool.sh` and add patterns to `DANGEROUS_PATTERNS` array.

**Protecting Additional Files:**
Add file patterns to the file protection section in `security-pre-tool.sh`.

**Custom Audit Format:**
Modify the logging format in `audit-post-tool.sh`.

See `.claude/hooks/README.md` for detailed hook documentation.

## Security Features

### Guardrails

Additional guardrails are enforced via `.claude/tools/guardrails-enforcer.mjs`:

- **Latency guardrails**: Blocks long-running operations (>30s)
- **Hallucination detection**: Requires source citations for technical claims
- **Jailbreak mitigation**: Blocks suspicious prompt patterns
- **Prompt leak prevention**: Detects potential system prompt exposure
- **Consistency enforcement**: Ensures code follows templates and patterns

**Usage:**

```bash
# Check prompt for issues
node .claude/tools/guardrails-enforcer.mjs check "<prompt>"

# Check for jailbreak attempts
node .claude/tools/guardrails-enforcer.mjs jailbreak "<prompt>"

# Check command latency
node .claude/tools/guardrails-enforcer.mjs latency "<command>"
```

## Cross-Platform Skill Usage

### Claude Code

```
# Natural language invocation
"Select rules for this project"
"Scaffold a UserProfile component"
"Audit src/components/ against our rules"
```

### Cursor IDE

```
# @ symbol invocation
Use @rule-selector to configure rules
Use @scaffolder to create a new component
Use @rule-auditor to check this code
```

### Factory Droid

```
# Task tool invocation
Run Task tool with skill rule-selector
Run Task tool with skill scaffolder
Run Task tool with skill rule-auditor
```

### Cross-Platform Handoff

```
# Claude to Cursor
"Sync this context to Cursor for implementation"

# Cursor to Factory
Use @context-bridge to hand off to Factory

# Factory to Claude
Run Task tool with skill context-bridge to sync to Claude
```

## Enterprise Features

### Cost Tracking

Monitor token usage and costs per agent session:

```bash
# View cost report
node .claude/tools/cost-tracker.mjs report

# Get cost stats for specific agent
node .claude/tools/cost-tracker.mjs stats developer 30

# Get cost forecast
node .claude/tools/cost-tracker.mjs forecast 30
```

### Session Management

Track and manage agent sessions:

```bash
# Create new session
node .claude/tools/session-manager.mjs create developer

# List active sessions
node .claude/tools/session-manager.mjs list

# Get session details
node .claude/tools/session-manager.mjs get <session-id>

# Close session
node .claude/tools/session-manager.mjs close <session-id> "completed"
```

### Context Monitoring

Track context usage to optimize token consumption:

```bash
# Generate context usage report
node .claude/tools/context-monitor.mjs report

# Get stats for specific agent
node .claude/tools/context-monitor.mjs stats developer 7
```

### Analytics

Track usage and performance metrics:

```bash
# Track event
node .claude/tools/analytics-api.mjs track "agent_activation" '{"agent":"developer"}'

# Get usage stats
node .claude/tools/analytics-api.mjs stats 7d developer

# Generate report
node .claude/tools/analytics-api.mjs report 7d
```

### Testing & Evaluation

Define success criteria and run evaluations:

```bash
# Define evaluation criteria
node .claude/tools/eval-framework.mjs define "code-quality" '<criteria-json>'

# Run evaluation
node .claude/tools/eval-framework.mjs run "code-quality" '<test-case-json>'

# Generate report
node .claude/tools/eval-framework.mjs report "code-quality" 7
```

See `.claude/docs/ENTERPRISE_FEATURES.md` for complete enterprise feature documentation.

## Next Steps

1. **Customize agents**: Edit files in `.claude/agents/` to match your team's style
2. **Customize skills**: Edit skill files in `.claude/skills/` for your patterns
3. **Add rules**: Create technology-specific rules in `.claude/rules/`
4. **Create commands**: Add custom workflows in `.claude/commands/`
5. **Configure MCP**: Set up integrations in `.claude/.mcp.json`
6. **Enable enterprise features**: Set up cost tracking, session management, and analytics
7. **Configure hooks**: Enable security and audit hooks for production use

## Documentation

### Setup & Configuration

- **Full Setup Guide**: `.claude/docs/setup-guides/CLAUDE_SETUP_GUIDE.md`
- **Migration Guide**: `.claude/docs/MIGRATION_GUIDE.md`
- **Context Optimization**: `.claude/docs/CONTEXT_OPTIMIZATION.md`

### Enterprise Features

- **Enterprise Features**: `.claude/docs/ENTERPRISE_FEATURES.md`
- **Enterprise Deployment**: `.claude/docs/ENTERPRISE_DEPLOYMENT.md`
- **Implementation Summary**: `.claude/docs/IMPLEMENTATION_SUMMARY.md`

### Workflows & Tools

- **Workflow Guide**: `.claude/workflows/WORKFLOW-GUIDE.md`
- **UI Perfection Tools**: `.claude/docs/UI_PERFECTION_TOOLS.md`
- **Agent Details**: `.claude/agents/` (each agent has full documentation)

### Hooks & Security

- **Hooks Documentation**: `.claude/hooks/README.md`
- **Guardrails**: `.claude/system/guardrails/guardrails.md`
- **Permissions**: `.claude/system/permissions/permissions.md`

## Quick Reference

### All Slash Commands

| Command              | Purpose                  | Example                                               |
| -------------------- | ------------------------ | ----------------------------------------------------- |
| `/review`            | Code review              | `/review` or `/review src/components/`                |
| `/fix-issue <n>`     | Fix GitHub issue         | `/fix-issue 123`                                      |
| `/quick-ship`        | Fast iteration           | `/quick-ship Fix button alignment`                    |
| `/run-workflow`      | Execute workflow         | `/run-workflow code-quality`                          |
| `/select-rules`      | Configure rules          | `/select-rules`                                       |
| `/audit`             | Validate code            | `/audit src/` or `/audit --format json`               |
| `/scaffold`          | Generate code            | `/scaffold component UserProfile`                     |
| `/code-quality`      | Code quality workflow    | `/code-quality`                                       |
| `/performance`       | Performance optimization | `/performance --target api/`                          |
| `/ai-system`         | AI/LLM development       | `/ai-system`                                          |
| `/mobile`            | Mobile development       | `/mobile`                                             |
| `/incident`          | Incident response        | `/incident`                                           |
| `/ui-perfection`     | UI perfection loop       | `/ui-perfection --component Dashboard.tsx --score 98` |
| `/rule-auditor`      | Audit code against rules | `/rule-auditor src/`                                  |
| `/rate-plan`         | Rate plan quality        | `/rate-plan plan.md`                                  |
| `/generate-tests`    | Generate test code       | `/generate-tests Button.tsx`                          |
| `/generate-docs`     | Generate documentation   | `/generate-docs api/`                                 |
| `/validate-security` | Security validation      | `/validate-security auth/`                            |

### All Hooks

| Hook                   | Event       | Purpose                   | Location                             |
| ---------------------- | ----------- | ------------------------- | ------------------------------------ |
| `security-pre-tool.sh` | PreToolUse  | Blocks dangerous commands | `.claude/hooks/security-pre-tool.sh` |
| `audit-post-tool.sh`   | PostToolUse | Logs tool executions      | `.claude/hooks/audit-post-tool.sh`   |

### All Enterprise Tools

| Tool                          | Purpose                | Command                                                         |
| ----------------------------- | ---------------------- | --------------------------------------------------------------- |
| `cost-tracker.mjs`            | Cost monitoring        | `node .claude/tools/cost-tracker.mjs report`                    |
| `session-manager.mjs`         | Session management     | `node .claude/tools/session-manager.mjs list`                   |
| `context-monitor.mjs`         | Context usage tracking | `node .claude/tools/context-monitor.mjs report`                 |
| `analytics-api.mjs`           | Usage analytics        | `node .claude/tools/analytics-api.mjs report 7d`                |
| `eval-framework.mjs`          | Testing & evaluation   | `node .claude/tools/eval-framework.mjs report <name>`           |
| `guardrails-enforcer.mjs`     | Safety guardrails      | `node .claude/tools/guardrails-enforcer.mjs check "<prompt>"`   |
| `validate-commit.mjs`         | Commit validation      | `echo "message" \| node .claude/tools/validate-commit.mjs`      |
| `subagent-context-loader.mjs` | Context loading        | `node .claude/tools/subagent-context-loader.mjs load developer` |

### All A2A Protocol Tools (NEW)

| Tool                            | Purpose                      | Command                                                     |
| ------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `agent-card-generator.mjs`      | Generate AgentCards          | `node .claude/tools/a2a/agent-card-generator.mjs`           |
| `discovery-endpoint.mjs`        | Start discovery server       | `node .claude/tools/a2a/discovery-endpoint.mjs`             |
| `external-agent-discovery.mjs`  | Discover external agents     | `node .claude/tools/a2a/external-agent-discovery.mjs <url>` |
| `memory-a2a-bridge.mjs`         | Memory-A2A conversion        | `node .claude/tools/a2a/memory-a2a-bridge.mjs`              |
| `entity-a2a-converter.mjs`      | Entity conversion            | `node .claude/tools/a2a/entity-a2a-converter.mjs`           |
| `message-wrapper.mjs`           | Message format conversion    | `node .claude/tools/a2a/message-wrapper.mjs`                |
| `task-state-manager.mjs`        | 8-state task lifecycle       | `node .claude/tools/a2a/task-state-manager.mjs`             |
| `push-notification-handler.mjs` | Webhook management           | `node .claude/tools/a2a/push-notification-handler.mjs`      |
| `streaming-handler.mjs`         | Server-Sent Events streaming | `node .claude/tools/a2a/streaming-handler.mjs`              |
| `federation-manager.mjs`        | Federation orchestration     | `node .claude/tools/a2a/federation-manager.mjs`             |

### Example Prompts by Use Case

**New Feature Development:**

```
"I need a task management dashboard with user authentication"
→ Triggers greenfield-fullstack workflow
```

**UI/UX Optimization:**

```
/ui-perfection --component Dashboard.tsx --score 98 --glassmorphism
→ Iterative UI perfection loop until 98% score
```

**Code Quality:**

```
/code-quality
→ Comprehensive code review and refactoring
```

**Performance Issues:**

```
/performance --target api/users
→ Performance profiling and optimization
```

**AI Feature:**

```
/ai-system
→ AI/LLM system design and implementation
```

**Quick Fix:**

```
/quick-ship Fix the login button alignment
→ Fast iteration workflow
```

**Rule Configuration:**

```
"Select rules for this Next.js TypeScript project"
→ Auto-detects stack and configures rules
```

**Code Generation:**

```
"Scaffold a UserProfile component with authentication"
→ Generates rule-compliant component code
```

**Code Validation:**

```
"Audit src/components/ against our rules"
→ Validates code compliance
```

**A2A Agent Discovery:**

```
"Generate AgentCards for all agents"
→ Creates A2A-compliant agent manifests
→ Serves at /.well-known/agent-card.json
```

**A2A External Federation:**

```
"Discover external A2A agents at https://example.com"
→ Fetches external AgentCards
→ Caches for 30 minutes
→ Returns agent capabilities
```

**A2A Task Management:**

```
"Create an A2A task with 8-state lifecycle"
→ SUBMITTED → WORKING → COMPLETED
→ Full task state management
→ Webhook notifications
```

## Support

- **First-Time Users**: Start with `FIRST_TIME_USER.md`
- **CUJ Documentation**: `.claude/docs/cujs/CUJ-INDEX.md` - All 47 user journeys
- **Onboarding Tool**: Run `node .claude/tools/onboarding.mjs` to validate setup
- **A2A Integration**: `.claude/context/reports/a2a-integration-completion-report.md` - Complete A2A protocol documentation
- **A2A Testing**: Run `pnpm test:a2a` to validate A2A integration (290 tests)
- Issues: https://github.com/anthropics/claude-code/issues
- Documentation: `.claude/docs/`
- Workflow Guide: `.claude/workflows/WORKFLOW-GUIDE.md` - Now with Planner integration!
- Enterprise Features: `.claude/docs/ENTERPRISE_FEATURES.md`

---

**Happy coding with your AI agent team!**
