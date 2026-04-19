---
name: CLAUDE
tools:
  - Read
  - MemoryRecord
skills:
  - memory-search
  - ripgrep
  - code-semantic-search
  - code-structural-search
---

# Core Agents

The foundational agents required for every pipeline. These handle the primary development lifecycle — planning, implementation, testing, documentation, and project management.

Search-First Protocol: use `pnpm search:code` or `ripgrep` to inspect the existing agent catalog before editing these index files. When updating the core catalog, document the lookup step with `Skill({ name: 'ripgrep' })` or another search skill invocation in the related worker prompt.

## Agents

| File                           | Purpose                 | Model  | Key Details                                                                                                           |
| ------------------------------ | ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `planner.md`                   | Implementation planning | opus   | Breaks complex tasks into atomic steps. Mandatory for multi-step/multi-file work. Produces plan files.                |
| `architect.md`                 | System design           | opus   | Architectural decisions, stack selection, scalability. Required before code-simplifier/devops/chaos-engineer.         |
| `developer.md`                 | TDD implementation      | sonnet | Red-Green-Refactor cycle. LAST RESORT — use specialists first. Has a `developer/` subdirectory with extended prompts. |
| `qa.md`                        | Testing & validation    | sonnet | Test strategy, execution, quality gates. Runs `pnpm test`, validates coverage, produces test reports.                 |
| `technical-writer.md`          | Documentation           | sonnet | Docs, guides, READMEs, CHANGELOG entries. Mandatory for any user-visible capability change.                           |
| `pm.md`                        | Product management      | sonnet | Backlog management, sprint planning, feature prioritization, user story creation.                                     |
| `technical-program-manager.md` | Cross-team delivery     | sonnet | Multi-team coordination, dependency tracking, phase-gate execution, milestone recovery.                               |
| `general-assistant.md`         | Q&A / brainstorming     | sonnet | Conversational assistant for explanations, brainstorming, and general interaction.                                    |
| `context-compressor.md`        | Context optimization    | haiku  | Compresses large context, deduplicates memory, manages token budget. Triggered at 80K+ tokens.                        |

## Subdirectory

| Directory    | Purpose                                            |
| ------------ | -------------------------------------------------- |
| `developer/` | Extended developer agent prompts and configuration |
