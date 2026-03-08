# GEMINI.md - Agent Studio Context

## Project Overview

**Agent Studio** is a portable, multi-agent ecosystem designed for Claude Code, Cursor IDE, and Factory Droid. It packages agents, skills, rules, hooks, schemas, and validation tooling into a reproducible, local-first stack.

### Core Technologies

- **Runtime:** Node.js (>=18.0.0), pnpm.
- **Search:** Hybrid lazy search model combining **ripgrep** (literal/text) and **LanceDB** (semantic ranking via `@xenova/transformers` or `fastembed`).
- **Memory:** SQLite entity graph + LanceDB vector store for persistent findings, decisions, and observational memory.
- **Validation:** **ast-grep** for structural checks, **ajv** for schema validation, and custom JS scripts for ecosystem consistency.
- **Orchestration:** Event-driven via an internal `EventBus`.

### Repository Structure

- `.claude/`: Core logic (agents, skills, rules, hooks, tools, schemas, docs).
- `scripts/`: Validation and maintenance scripts.
- `tests/`: Unit, integration, and framework tests.
- `context/`: Runtime artifacts and persistent memory.

---

## Building and Running

### Initial Setup

```bash
pnpm install
pnpm memory:init
pnpm agents:registry
pnpm routing:prototypes
pnpm agents:catalog
```

### Discovery & Search

- **Code Search:** `pnpm search:code "query"` (Hybrid text + semantic).
- **Structure:** `pnpm search:structure` (Repo map + entrypoints).
- **Daemon Mode:** `pnpm search:daemon:start` (Reduces latency for repeated queries).

### Validation & Testing

- **Full Validation:** `pnpm validate:full` (Checks config, models, workflows, schemas, and commands).
- **Run Tests:** `pnpm test:all` or `pnpm test:framework`.
- **Linting:** `pnpm lint` and `pnpm format:check`.

---

## Development Conventions

### Artifact Lifecycle (Agents & Skills)

The project follows a strict, contract-first lifecycle for creating or updating artifacts:

1.  **Step 0 - Check:** Verify if the artifact already exists; if so, delegate to the `updater` flow.
2.  **Research:** Use `Exa` or `WebSearch` to gather best practices and domain terminology.
3.  **Generate:** Use managed template contracts (e.g., `.claude/skills/agent-creator/scripts/main.cjs`) instead of freehand creation.
4.  **Validate:** Run blocking validation gates (e.g., `validate-agents.mjs`).
5.  **Integrate:** Update `CLAUDE.md` routing tables, `routing-table.cjs` keywords, and regenerate registries (`agents:registry`).

### Coding Style & Standards

- **Naming:** Lowercase kebab-case (e.g., `ux-reviewer`, `data-engineer`).
- **Documentation:** Use the **Lazy-Load Rule**: Prefix `.claude/` paths with `@` in markdown (e.g., `@.claude/docs/GUIDE.md`) to minimize prompt tokens.
- **Context Control:** You MUST proactively summarize your context and execute `token-saver-context-compression` or manual truncation BEFORE accumulating 150K tokens. Reading massive log files or directories without `grep` will cause API crash errors.
- **Shell Security:** Background tasks must initialize CWD to `PROJECT_ROOT` and avoid dangerous patterns (rm -rf, eval).
- **Task Tracking:** Every agent MUST use `TaskUpdate` to track progress (`in_progress`, `completed`).

### Memory Protocol

- **Assume Interruption:** Context may reset at any time. If it's not in memory, it didn't happen.
- **Record Everything:** Append new patterns to `learnings.md`, roadblocks to `issues.md`, and choices to `decisions.md`.
- **Read First:** Always `cat .claude/context/memory/learnings.md` before starting a task.

---

## Key Files & Directories

- `CLAUDE.md`: The "Source of Truth" for system architecture, routing tables, and rules.
- `.claude/config/agent-config.json`: Tool defaults and agent configurations.
- `.claude/lib/routing/routing-table.cjs`: Intent-to-agent mapping and keyword scoring.
- `.env.example`: Template for environment variables (`HYBRID_EMBEDDINGS`, `AGENT_STUDIO_ENV`, etc.).
- `package.json`: Definitive source for runnable workflows and scripts.
