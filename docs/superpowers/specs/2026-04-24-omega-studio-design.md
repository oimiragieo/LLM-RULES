<!-- Agent: architect | Task: omega-studio-design | Session: 2026-04-24 -->

# omega-studio Design Specification

**Status:** Draft v1.0 (foundation document)
**Author:** architect agent
**Date:** 2026-04-24
**Target repo:** `C:\dev\projects\omega-studio` (to be created)
**Reference repos:**

- `C:\dev\projects\agent-studio` (the system being replaced)
- `C:\dev\projects\claude-code-main` (Claude Code internals — read-only contract reference)

---

## 1. Overview

**omega-studio** is a from-scratch multi-agent framework for Claude Code, built as a strict modular monolith in TypeScript. It replaces `agent-studio` after nine months of accumulated complexity made that codebase unreliable and frustrating to operate.

The core difference from `agent-studio` is **enforced minimalism**: 5 hooks instead of 50+, 24 agents instead of 119, no custom memory tier system, no specialist-first routing ambiguity. The framework leans on TypeScript project references and `dependency-cruiser` to make module boundaries compiler-enforced rather than convention-based, and on a strict test pyramid (unit + integration + contract) to prevent the silent regressions that plagued the predecessor.

omega-studio is a **reference-only consumer** of `claude-code-main`: it implements the documented hook protocol and `settings.json` schema, but never vendors, forks, or shells out to Claude Code internals.

---

## 2. Goals & Non-Goals

### Goals

- **Reliability over features.** Every hook has a contract test. Every public function has a unit test. CI gates on 100% line coverage for `src/hooks/` and `src/core/`.
- **Compiler-enforced module isolation.** TypeScript project references make cross-module access impossible without explicit re-export.
- **Single install, single build, single test command.** No micro-package sprawl.
- **Deterministic agent behavior.** `developer` always implements; specialists audit. No router-time disambiguation.
- **Honest dependencies.** Reference Claude Code's documented contracts; never reach into its internals.
- **Built-in memory only.** Lean on Claude Code's `MEMORY.md` index; no custom STM/MTM/LTM tiers.
- **TDD for hooks.** Every hook starts as a contract test, then implementation.

### Non-Goals

- No npm package publishing (single repo, single install).
- No backward compatibility with `agent-studio` artifacts (clean break).
- No custom memory schemas, tiers, or `MemoryRecord` tool.
- No specialist-first routing (developer always executes; specialists review).
- No vendoring of `claude-code-main` source.
- No marketing site in v1 (placeholder static landing page only).
- No support for runtime `tsx` execution; all hooks ship from `dist/`.

---

## 3. Architecture Overview

### 3.1 Repository Layout

```
omega-studio/
├── package.json                    # single root manifest, pnpm workspaces NOT used
├── pnpm-lock.yaml
├── tsconfig.base.json              # shared compiler options
├── tsconfig.json                   # solution file with project references
├── biome.json                      # lint + format (replaces eslint+prettier)
├── vitest.config.ts                # root vitest config with project refs
├── dependency-cruiser.config.cjs   # module boundary enforcement
├── .changeset/                     # changelog automation (optional)
├── .github/workflows/ci.yml
├── .env.example
├── README.md
├── CHANGELOG.md
├── LICENSE
├── CLAUDE.md                       # router rules at repo root (Claude Code reads this)
│
├── src/
│   ├── shared/                     # types, constants, pure utils (zero deps)
│   │   ├── tsconfig.json           # composite: true; no references
│   │   ├── src/
│   │   │   ├── index.ts            # public API barrel (only exports here cross boundary)
│   │   │   ├── types/
│   │   │   ├── errors/
│   │   │   └── utils/
│   │   └── tests/
│   │
│   ├── core/                       # task state, hook runner, agent registry
│   │   ├── tsconfig.json           # references: ../shared
│   │   ├── src/
│   │   │   ├── index.ts            # public API barrel
│   │   │   ├── tasks/
│   │   │   ├── hooks/              # hook runner (not the hook implementations)
│   │   │   └── agents/             # agent loader + registry
│   │   └── tests/
│   │
│   ├── hooks/                      # 5 hook implementations
│   │   ├── tsconfig.json           # references: ../shared, ../core
│   │   ├── src/
│   │   │   ├── tool-lockdown.ts
│   │   │   ├── pre-completion-validation.ts
│   │   │   ├── commit-validator.ts
│   │   │   ├── routing-guard.ts
│   │   │   └── safety-rules.ts
│   │   └── tests/                  # contract + integration tests per hook
│   │
│   ├── agents/                     # agent .md generation + validation
│   │   ├── tsconfig.json           # references: ../shared, ../core
│   │   ├── src/
│   │   │   ├── workflow-12/        # 12 workflow agents
│   │   │   ├── domain-pack/        # 12 domain audit agents
│   │   │   └── frontmatter-schema.ts
│   │   └── tests/
│   │
│   └── tasks/                      # task lifecycle utilities
│       ├── tsconfig.json           # references: ../shared, ../core
│       ├── src/
│       └── tests/
│
├── .claude/                        # Claude Code runtime config (committed)
│   ├── CLAUDE.md                   # symlink or copy of root CLAUDE.md
│   ├── settings.json               # references dist/hooks/*.cjs paths
│   ├── agents/                     # generated from src/agents/ at build time
│   ├── skills/                     # curated skill catalog (subset)
│   └── rules/                      # workspace conventions, code standards
│
├── tests/                          # cross-module integration + e2e tests
│   ├── integration/
│   ├── contract/                   # hook protocol contract tests
│   └── fixtures/
│
├── dist/                           # tsc -b output (gitignored)
│   ├── shared/
│   ├── core/
│   ├── hooks/                      # *.cjs files referenced by settings.json
│   ├── agents/
│   └── tasks/
│
└── docs/
    ├── architecture.md             # high-level overview
    ├── hook-protocol.md            # contract reference
    ├── adr/                        # architecture decision records
    │   └── 0001-modular-monolith.md
    └── site/                       # static landing page
        └── index.html
```

### 3.2 Build Topology

```
shared (no deps)
   ↑
   └── core (depends on: shared)
          ↑
          ├── hooks  (depends on: shared, core)
          ├── agents (depends on: shared, core)
          └── tasks  (depends on: shared, core)
```

`tsc -b` walks this graph in topological order. `dependency-cruiser` rejects PRs that introduce edges outside this graph (e.g., `hooks → agents`).

---

## 4. Module Boundaries

Each module under `src/` has its own `tsconfig.json` declaring `composite: true` and listing references. The compiler refuses to import symbols not re-exported from a module's `src/index.ts` barrel.

### 4.1 `shared`

**Purpose:** Pure types, constants, and zero-dependency utilities.

| Aspect     | Detail                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Public API | `Result<T, E>`, `TaskId`, `AgentId`, `HookName`, `HookEvent`, `ToolName`, `safeParseJson`, structured `OmegaError` class, type guards. |
| Depends on | Nothing (zero runtime deps; only `zod` for schema definitions).                                                                        |
| Exposes    | Branded types, error class hierarchy, schema validators.                                                                               |
| Forbidden  | I/O, `fs`, `child_process`, network calls.                                                                                             |

### 4.2 `core/tasks`

**Purpose:** Task state machine and persistence.

| Aspect      | Detail                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Public API  | `Task`, `TaskStatus` (`pending`/`in_progress`/`blocked`/`completed`), `TaskStore`, `TaskTransition`. |
| Depends on  | `shared`.                                                                                            |
| Exposes     | CRUD + transition guard functions; pure reducer for status changes.                                  |
| Persistence | JSONL file at `.claude/runtime/tasks.jsonl` (append-only, with snapshot compaction).                 |

### 4.3 `core/hooks`

**Purpose:** Hook runner and protocol harness (NOT hook implementations).

| Aspect     | Detail                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Public API | `runHook(hook: HookFunction, payload: HookPayload): Promise<HookResult>`, `defineHook(spec)`, `HookContext`, `HookProtocolError`. |
| Depends on | `shared`, `core/tasks`.                                                                                                           |
| Exposes    | Standardized stdin parser, stdout writer, exit-code semantics, error envelope serializer.                                         |
| Forbidden  | Knowledge of any specific hook's logic.                                                                                           |

### 4.4 `core/agents`

**Purpose:** Agent registry, frontmatter parser, agent metadata.

| Aspect     | Detail                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Public API | `Agent`, `AgentRegistry`, `parseAgentFile(path)`, `validateFrontmatter(meta)`, `listAgents()`. |
| Depends on | `shared`.                                                                                      |
| Exposes    | Read-only registry built from `.claude/agents/*.md`.                                           |

### 4.5 `hooks`

**Purpose:** The 5 enforcement hooks.

| Aspect     | Detail                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Public API | None — each hook compiles to a standalone `dist/hooks/<name>.cjs` invoked by Claude Code via `settings.json`. |
| Depends on | `shared`, `core` (only the runner harness; nothing about other hooks).                                        |
| Exposes    | One CommonJS executable per hook.                                                                             |
| Hooks      | `tool-lockdown`, `pre-completion-validation`, `commit-validator`, `routing-guard`, `safety-rules`.            |

### 4.6 `agents`

**Purpose:** Source-of-truth definitions for the 24 agents (Workflow-12 + Domain-12).

| Aspect     | Detail                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Public API | `AgentSpec` TypeScript objects exporting agent metadata + prompt body. Build step writes them to `.claude/agents/<name>.md`. |
| Depends on | `shared`, `core/agents`.                                                                                                     |
| Exposes    | `agents.json` manifest (generated at build time) and the `.claude/agents/*.md` files.                                        |

### 4.7 `tasks`

**Purpose:** Task lifecycle helpers consumed by hooks.

| Aspect     | Detail                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| Public API | `claimTask`, `completeTask`, `failTask`, `getActiveTasks`, `verifyCompletionGates(taskId)`. |
| Depends on | `shared`, `core/tasks`.                                                                     |
| Exposes    | High-level convenience functions used by `pre-completion-validation` and `routing-guard`.   |

---

## 5. Hook Contract

Every hook implements the same wire protocol. Claude Code spawns the hook as a CommonJS process, writes a JSON payload to stdin, and reads JSON (or empty) from stdout. The exit code determines the outcome.

### 5.1 Input Schema (stdin)

```json
{
  "$schema": "https://omega-studio.dev/schema/hook-input.json",
  "type": "object",
  "required": ["cwd", "event", "session_id"],
  "properties": {
    "cwd": {
      "type": "string",
      "description": "Absolute working directory of the Claude Code session."
    },
    "event": {
      "type": "string",
      "enum": [
        "PreToolUse",
        "PostToolUse",
        "UserPromptSubmit",
        "Stop",
        "SubagentStart",
        "SubagentStop",
        "Notification"
      ]
    },
    "session_id": { "type": "string", "description": "UUID of the current session." },
    "tool_name": {
      "type": ["string", "null"],
      "description": "Tool being invoked (PreToolUse/PostToolUse only)."
    },
    "tool_input": { "type": ["object", "null"], "description": "Verbatim tool arguments." },
    "tool_output": {
      "type": ["object", "string", "null"],
      "description": "Tool result (PostToolUse only)."
    },
    "agent_type": {
      "type": ["string", "null"],
      "description": "Subagent type (Subagent* events)."
    },
    "task_id": { "type": ["string", "null"] },
    "metadata": { "type": "object", "additionalProperties": true }
  },
  "additionalProperties": false
}
```

### 5.2 Output Schema (stdout)

stdout MAY be empty. If non-empty, it MUST parse as JSON conforming to:

```json
{
  "$schema": "https://omega-studio.dev/schema/hook-output.json",
  "type": "object",
  "properties": {
    "decision": { "type": "string", "enum": ["allow", "block", "warn"] },
    "reason": { "type": "string", "maxLength": 1000 },
    "context": { "type": "object", "additionalProperties": true }
  },
  "additionalProperties": false
}
```

### 5.3 Exit Code Semantics

| Exit code | Meaning                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `0`       | Allow. Tool/event proceeds. stdout may contain `{decision:"allow"}` or be empty.                      |
| `2`       | Block. Tool/event rejected. stderr MUST contain a single-line JSON `{reason, context}` for the user.  |
| Any other | Treated as hook crash. Logged to `.claude/runtime/hook-errors.jsonl`; tool/event allowed (fail-open). |

### 5.4 Structured Stderr

When exiting with code `2`, hooks MUST write exactly one line to stderr:

```
{"hook":"tool-lockdown","reason":"Bash blocked for router agent","context":{"tool":"Bash","agent":"router"}}
```

The `core/hooks` runner serializes this automatically — hook authors call `block(reason, context)` and the runner handles formatting.

---

## 6. Agent Definition Contract

Every agent `.md` file under `.claude/agents/` MUST have YAML frontmatter that validates against:

```yaml
---
name: developer # required, unique, kebab-case
type: workflow # required, enum: workflow | domain
model: sonnet # required, enum: haiku | sonnet | opus
role: Implementation # required, ≤80 chars
description: | # required, ≤500 chars
  TDD implementer. Always called for code changes.
tools: # required, array of allowed tool names
  - Read
  - Write
  - Edit
  - Bash
skills: # optional, array of skill names
  - tdd
  - verification-before-completion
spawn_when: # required, plain-text trigger description
  - 'User asks to implement, fix, or refactor code'
  - 'Architect produces a design that needs implementation'
audit_pack: # required only for type: domain
  reviews: [developer] # which agent's output this domain agent audits
schema_version: 1 # required, integer
---
```

Validation lives in `src/agents/frontmatter-schema.ts` (Zod schema). The build step rejects any agent file whose frontmatter fails validation.

| Field            | Required           | Notes                                                                 |
| ---------------- | ------------------ | --------------------------------------------------------------------- |
| `name`           | yes                | Must match filename (`developer.md` ⇒ `name: developer`).             |
| `type`           | yes                | `workflow` (one of the 12 core) or `domain` (one of the 12 audit).    |
| `model`          | yes                | Resolved by router; can be overridden per-task.                       |
| `role`           | yes                | One-line summary.                                                     |
| `description`    | yes                | Used by routing-guard for keyword matching.                           |
| `tools`          | yes                | Enforced by `tool-lockdown`. Must be a subset of Claude Code's tools. |
| `skills`         | no                 | Auto-loaded skills.                                                   |
| `spawn_when`     | yes                | Plain-text triggers; humans-only (router uses LLM, not regex).        |
| `audit_pack`     | only `type:domain` | Tells the framework whose work this domain agent audits.              |
| `schema_version` | yes                | Allows migration when frontmatter shape changes.                      |

---

## 7. Test Pyramid Contract

### 7.1 Tier Definitions

| Tier        | Tool   | Asserts                                                                                                                   | Lives in                            |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Unit        | Vitest | Pure functions: input → output. No I/O. No mocks unless trivial.                                                          | `src/<module>/tests/*.unit.test.ts` |
| Integration | Vitest | Cross-module behavior: a hook actually calls the task store; an agent loader actually parses real `.md` files.            | `tests/integration/*.test.ts`       |
| Contract    | Vitest | Wire-level: hooks accept the input schema and produce the output schema; agent files validate against frontmatter schema. | `tests/contract/*.test.ts`          |

### 7.2 Coverage Gates (CI)

| Path              | Threshold           | Enforced by                            |
| ----------------- | ------------------- | -------------------------------------- |
| `src/hooks/`      | 100% lines+branches | `vitest --coverage` + CI fail-on-drop  |
| `src/core/`       | 100% lines+branches | same                                   |
| `src/shared/`     | 100% lines          | same                                   |
| `src/agents/`     | 90% lines           | same                                   |
| `src/tasks/`      | 95% lines           | same                                   |
| Integration suite | All green           | `pnpm test:integration` exits non-zero |
| Contract suite    | All green           | `pnpm test:contract` exits non-zero    |

Coverage is collected with V8 instrumentation (Vitest's default) and reported to `coverage/coverage-summary.json`. The CI step `coverage-gate` parses that file and fails the job if any threshold drops below the floor.

### 7.3 TDD Enforcement

- PR template requires authors to confirm: "Hook/feature was driven by a failing test first."
- `commit-validator` hook scans commit messages for the pattern `^(feat|fix|refactor)\(([a-z-]+)\):` and warns (not blocks) when a `feat` commit modifies `src/hooks/` without a sibling test file modification in the same commit.
- Contract tests are written **before** the hook implementation. Slice 2 ships the contract test scaffolding; Slice 3 implements the first hook to satisfy it.

---

## 8. Build & Dev Workflow

All commands are run from the repo root.

| Command              | Purpose                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm install`       | Install all dependencies (single root install; no workspaces).                                                   |
| `pnpm build`         | Run `tsc -b` across all project references. Output to `dist/`. Builds hooks as `.cjs` via per-module `tsconfig`. |
| `pnpm dev`           | `tsx --watch src/hooks/` for live hook iteration during development. Never used at runtime.                      |
| `pnpm test`          | Run all Vitest suites (unit + integration + contract) with coverage.                                             |
| `pnpm test:unit`     | Unit suite only. Fastest feedback loop.                                                                          |
| `pnpm test:contract` | Contract suite only. Run before commit.                                                                          |
| `pnpm test:watch`    | Vitest watch mode for the unit suite.                                                                            |
| `pnpm lint`          | `biome lint .` — read-only.                                                                                      |
| `pnpm lint:fix`      | `biome check --write .` — auto-fix.                                                                              |
| `pnpm format`        | `biome format --write .`.                                                                                        |
| `pnpm typecheck`     | `tsc -b --noEmit` across all references.                                                                         |
| `pnpm boundaries`    | `depcruise --config dependency-cruiser.config.cjs src/` — fails on illegal cross-module imports.                 |
| `pnpm validate`      | Composite: `typecheck && lint && boundaries && test`.                                                            |
| `pnpm gen:agents`    | Generate `.claude/agents/*.md` from `src/agents/` source.                                                        |

### 8.1 CI Pipeline

```
install → typecheck → lint → boundaries → build → test (with coverage) → coverage-gate
```

Any step failing fails the job. PRs cannot merge with a red pipeline.

---

## 9. Implementation Slices

The planner refines these into concrete tasks. Each slice ships independently and leaves the repo green.

### Slice 0 — Repo Bootstrap

- `package.json` (Node ≥22.5, pnpm, scripts table from §8)
- `tsconfig.base.json` + root `tsconfig.json` solution file
- `biome.json` (lint + format config replacing eslint+prettier)
- `vitest.config.ts` with project references
- `dependency-cruiser.config.cjs` enforcing the §3.2 graph
- `.github/workflows/ci.yml` (full pipeline from §8.1)
- `.claude/CLAUDE.md` stub (router rules placeholder)
- `.gitignore`, `.env.example`, `LICENSE`, empty `README.md`/`CHANGELOG.md`
- Smoke test: `pnpm validate` passes on an empty repo.

### Slice 1 — Core Types + Task State

- `src/shared/` complete: `Result`, branded IDs, error classes, `safeParseJson`.
- `src/core/tasks/` complete: `Task`, `TaskStatus`, `TaskStore`, transition reducer.
- Unit tests achieve 100% coverage for both modules.
- `pnpm boundaries` confirms `core/tasks` only imports `shared`.

### Slice 2 — Hook Runner Skeleton + Contract Test Scaffolding

- `src/core/hooks/` complete: `runHook`, `defineHook`, `HookContext`, error envelope.
- `tests/contract/hook-protocol.test.ts`: parameterized over a fixture of hook payloads; asserts every hook spec satisfies the input/output schemas.
- The harness can run a no-op hook end-to-end (stdin → stdout → exit code).

### Slice 3 — First Hook End-to-End: `tool-lockdown`

- Red: write contract test asserting router cannot use `Bash` (other than the whitelist).
- Green: implement `src/hooks/tool-lockdown.ts` to make the test pass.
- Refactor: extract reusable agent-tool-lookup into `src/core/agents/`.
- Confirm `dist/hooks/tool-lockdown.cjs` is callable from `.claude/settings.json`.
- Manual smoke test in Claude Code session.

### Slice 4 — Workflow-12 Agent Definitions

- 12 agent specs in `src/agents/workflow-12/`: `router`, `planner`, `architect`, `developer`, `code-reviewer`, `qa`, `technical-writer`, `researcher`, `security-architect`, `devops`, `code-simplifier`, `general-assistant`.
- `pnpm gen:agents` emits `.claude/agents/*.md`.
- Contract tests assert every emitted file validates against §6 frontmatter schema.

### Slice 5 — Remaining 4 Hooks

- `pre-completion-validation` — checks CHANGELOG entry exists, lint passes for the touched files.
- `commit-validator` — Conventional Commits + Co-Authored-By line.
- `routing-guard` — epic-tier work must route through `planner`.
- `safety-rules` — destructive ops (`rm -rf`, `git push --force`) require explicit user confirmation token.
- TDD cycle for each: contract test → implementation.

### Slice 6 — Domain Audit Pack (12 Agents)

- 12 specs in `src/agents/domain-pack/`: `python-pro`, `typescript-pro`, `nodejs-pro`, `frontend-pro`, `nextjs-pro`, `react-pro`, `database-architect`, `postgres-pro`, `api-designer`, `kubernetes-specialist`, `terraform-engineer`, `mlops-engineer`.
- All have `audit_pack.reviews: [developer]` and `tools: [Read, Grep, Glob]` only (audit-only, no write access).
- Documentation explains the "developer implements, specialists audit" model.

### Slice 7 — CLAUDE.md Routing Rules + Skill Catalog Seed

- Root `CLAUDE.md` with the routing table, hook list, agent table, and tool lockdown reference.
- `.claude/skills/` seeded with a curated subset (≤30) of skills the workflow agents actually invoke.
- `pnpm gen:agents` extended to also emit a `.claude/agent-registry.json`.

### Slice 8 — README + CHANGELOG + .env.example

- `README.md`: install, build, test, agent list, hook list, philosophy.
- `CHANGELOG.md`: backfilled with one entry per slice.
- `.env.example`: every env var the framework reads (e.g., `OMEGA_LOG_LEVEL`, `OMEGA_HOOK_TIMEOUT_MS`).

### Slice 9 — Static Landing Page

- `docs/site/index.html`: single static HTML, no build step, no JS framework.
- Contains: project tagline, install snippet, link to repo, link to docs.
- Defer real marketing site to a future project.

---

## 10. Risks & Open Questions

### Risks

| Risk                                                                         | Mitigation                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Project references add build-config complexity that scares contributors      | One-page `docs/build-system.md` walkthrough; `pnpm validate` hides the moving parts.                     |
| 100% coverage gate becomes a goal-displacement problem (coverage theater)    | Pair coverage gate with mutation testing on `src/hooks/` once the suite stabilizes (Slice 5+).           |
| Claude Code's hook protocol changes between versions                         | Pin a `claude-code-min-version` field in `package.json`; add a CI smoke test against the pinned version. |
| Domain audit agents drift toward implementation (becoming `developer` again) | `tools: [Read, Grep, Glob]` only — they literally cannot write code. Enforced by `tool-lockdown`.        |
| Built-in Claude Code memory is insufficient for cross-session continuity     | Accepted trade-off. Re-evaluate after 1 month of use; do not pre-build a tier system.                    |
| `dependency-cruiser` and TypeScript project refs disagree on what's allowed  | Compiler is source of truth; `dependency-cruiser` is belt-and-suspenders. CI runs both.                  |
| Single-repo monolith grows unwieldy at >50k LOC                              | Re-evaluate at threshold; split is mechanical (each module already has its own tsconfig + barrel API).   |

### Open Questions

1. **CHANGELOG automation:** Use `changesets` (per-PR fragments) or hand-edited `CHANGELOG.md`? Recommendation: hand-edited for v1; revisit at Slice 8.
2. **Hook timeout policy:** What's the wall-clock budget per hook? Proposal: 2000ms default, configurable via `OMEGA_HOOK_TIMEOUT_MS`. Confirm in Slice 2.
3. **Agent registry distribution:** Should `.claude/agents/*.md` be committed (Slice 4 generates them) or `.gitignore`d and built fresh? Proposal: committed, so Claude Code sessions work without `pnpm build`. Build step verifies they're up to date.
4. **`general-assistant` scope:** Is this needed if `router` exists? Proposal: keep it as the fallback for non-actionable Q&A; router routes Q&A to it.
5. **Domain agent tool whitelist edge case:** Should `terraform-engineer` and `kubernetes-specialist` get `Bash` for `terraform plan` / `kubectl get`? Proposal: no — they audit Terraform/K8s manifests via `Read`; actual execution is `developer`'s job. Revisit if it proves too restrictive.
6. **Contract test fixtures location:** `tests/fixtures/` shared across all contract tests, or co-located with each contract test file? Proposal: shared, with a JSON catalogue describing each fixture's purpose.
7. **Replacing `agent-studio`:** Migration plan? Proposal: omega-studio runs in parallel; switch personal workflow over slice-by-slice; archive `agent-studio` only when omega-studio reaches feature parity for the user's daily commands.

---

## Appendix A — Why These Decisions

| Decision                                      | Rationale                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Modular monolith (no separate npm packages)   | Avoids `pnpm workspace` complexity; one install, one lockfile. Project references give isolation without distribution.     |
| TypeScript everywhere, no runtime `tsx`       | `tsx` startup latency adds 200-400ms per hook invocation; unacceptable for `PreToolUse` hooks that run on every tool call. |
| Biome over ESLint+Prettier                    | Single tool, single config, ~10x faster, no plugin churn.                                                                  |
| Vitest over Jest                              | Native ESM, native TS, ~3x faster, native coverage via V8.                                                                 |
| `dependency-cruiser` belt over compiler alone | Catches cycles and forbidden patterns the TypeScript compiler permits (e.g., type-only imports across boundaries).         |
| 5 hooks, not 50                               | `agent-studio` had ~50 hooks; ~40 were never triggered or duplicated other hooks. 5 covers the genuine enforcement needs.  |
| 24 agents, not 119                            | `agent-studio`'s 119 agents had massive overlap and routing ambiguity. 12+12 covers all real workflows with clear roles.   |
| Developer always implements                   | Eliminates the "specialist-first vs developer-first" routing argument that consumed hours of debugging in `agent-studio`.  |
| Built-in memory only                          | Custom STM/MTM/LTM in `agent-studio` was the source of more bugs than features. Claude Code's `MEMORY.md` is sufficient.   |

---

## Appendix B — Glossary

| Term              | Definition                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Workflow-12       | The 12 core agents that handle the development lifecycle (router → planner → architect → developer …). |
| Domain-12         | The 12 specialist agents that audit `developer` output for domain correctness.                         |
| Hook contract     | The stdin/stdout/exit-code protocol defined in §5.                                                     |
| Audit pack        | A group of domain agents that review a workflow agent's output (defined per-agent in frontmatter).     |
| Project reference | TypeScript feature that lets `tsc -b` build a graph of dependent compilations with strict isolation.   |
