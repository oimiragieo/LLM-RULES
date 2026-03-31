---
name: init
description: Auto-evolution skill to initialize a new repository with AGENTS.md localized context.
---

# Ecosystem Initialization (Init Skill)

NOTE: This is an auto-evolution skill designed to run when Agent Studio is first deployed into a new repository (e.g., when AGENTS.md does not yet exist).

## When to Use This Skill

Use this skill when you first enter a new codebase, or when the user explicitly asks to "initialize the repository" or "generate AGENTS.md".

## Work Procedure

This skill executes a rigorous 3-stage "Deep Ecosystem Evolution" pipeline.

### Stage 1: Context Gathering & Generation

Analyze the repository root to understand the technology stack and architecture. Specifically, look for and read:

- `README.md`
- `.cursorrules` or `.cursor/rules/`
- `.github/copilot-instructions.md`
- Package manager files (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, etc.)
- Framework config files (`tsconfig.json`, `next.config.js`, `vite.config.ts`, etc.)

**Generate AGENTS.md**
Create or update a centralized `AGENTS.md` file in the repository root containing explicit, localized instruction sets for future Agents working in this codebase.
Include: exact test/build CLI commands, architecture notes, and environment quirks. Do not hallucinate support links. Do not include generic fluff. Show the proposed content to the user for confirmation if `AGENTS.md` already existed but is stale.

### Stage 2: Capability Gap Analysis

Cross-reference the discovered tech stack and repository complexity against the current available global tools (using the `.claude/CLAUDE.md` matrix).

- **If a required capability is missing** (e.g., the repo is heavily dependent on a specific framework like PyO3, but we only have a generic python-engineer):
- Explicitly prompt the user to authorize invoking the `agent-creator` or `skill-creator` to generate bespoke, hyper-localized expert components (e.g., `tensor-grep-rust-worker`).

### Stage 3: Targeted Staleness Audit

Identify **ONLY the subset** of pre-existing agents and skills that are mathematically applicable to this repository's stack (e.g., if it's a TS web app, target `typescript`, `react`, `jest`, `frontend`). _Do not evaluate all 200+ unrelated framework assets._

For each applicable asset:

1. Execute `node .claude/tools/cli/skill-freshness-report.cjs --name [asset-name]` (or manually inspect its YAML frontmatter / git logs) to check its `lastUpdated` or `createdAt` timestamp.
2. **If the applicable asset is > 30 days old**, immediately alert the user and propose spawning an `agent-updater` or `skill-updater` to refresh its instruction context against modern best practices.

## Example Handoff

```json
{
  "salientSummary": "Initialized the repository by scanning package.json and README.md. Detected a Next.js frontend with a Go backend. Generated AGENTS.md with explicit pnpm and Go build commands, testing strategies, and a high-level component map.",
  "whatWasImplemented": "Created AGENTS.md in the repository root. Extracted 4 core architecture rules from .cursorrules. Verified that the test commands provided in AGENTS.md actually execute cleanly.",
  "verification": {
    "commandsRun": [
      {
        "command": "cat package.json | grep 'test'",
        "exitCode": 0,
        "observation": "Found vitest testing configuration."
      }
    ]
  }
}
```
