<!-- Agent: technical-writer | Task: #5 | Session: 2026-04-02 -->
# scripts/ — Build, Validation, and Maintenance Scripts

This directory contains Node.js scripts that support the build pipeline, validation suite, and project maintenance tasks. Scripts are invoked via `pnpm` commands or directly with `node`. They are not importable library modules — those belong in `.claude/lib/`.

---

## Top-Level Scripts

These scripts sit directly in `scripts/` and are referenced by `package.json`:

| Script | Invocation | Purpose |
|--------|-----------|---------|
| `setup.cjs` | `pnpm run setup` | Interactive first-time setup wizard — installs deps, compiles registries, indexes code |
| `validate-all-references.mjs` | `pnpm validate:refs` | Validates all cross-references (agents, skills, hooks, workflows) for broken links |
| `validate-model-names.mjs` | `pnpm validate:models` | Checks agent frontmatter and config for valid, current model names |
| `validate-workflow.mjs` | `pnpm validate:workflows` | Validates workflow YAML/JSON against schema contracts |
| `validate-doc-stale-patterns.mjs` | `pnpm validate:docs` | Detects stale documentation patterns (outdated agent counts, broken references) |
| `validate-index.mjs` | `pnpm validate:index` | Validates the skill/agent registry index files |
| `validate-package-scripts.mjs` | (internal) | Ensures `package.json` scripts reference real files |
| `validate-env-budget.mjs` | (internal) | Validates environment variable budget — checks for undocumented vars |
| `verify-dependencies.mjs` | `pnpm verify:deps` | Verifies all declared dependencies are installed and compatible |
| `generate-prebuilt-rule-index.mjs` | (internal) | Generates the prebuilt rule index from `.claude/rules/` |
| `generate-rule-index.mjs` | (internal) | Generates the rule index used by hook resolution |
| `inject-memory-search.cjs` | (internal) | Injects memory search hooks into agent spawn prompts |
| `heal-docs.cjs` | `pnpm docs:heal` | Auto-repairs common doc inconsistencies (heading levels, broken tables) |
| `update-updaters.cjs` | (internal) | Regenerates updater skill registrations |
| `reset-context.cjs` | (manual) | Clears `.claude/context/runtime/` transient state between sessions |
| `check-memory-bloat.cjs` | (manual) | Reports memory file sizes and flags oversized entries |
| `prune-reflection-log.cjs` | (manual) | Trims old entries from `reflection-spawn-request.json` |
| `archive-old-decisions.cjs` | (manual) | Moves decisions older than 90 days to cold storage |
| `analyze-session-transcript.mjs` | (manual) | Parses and summarizes session transcripts for debugging |
| `reduce-debug-log.cjs` | (manual) | Strips verbose entries from debug logs to reduce file size |
| `strip-memory-context.mjs` | (manual) | Removes context-window bloat from memory files |
| `worker-pool-start.mjs` | (internal) | Starts the worker pool for parallel embedding generation |
| `a2a-server-start.mjs` | (internal) | Starts the agent-to-agent (A2A) protocol server |
| `wait-for-handoff.mjs` | (internal) | Polls for session handoff completion before launching new session |
| `spawn-new-session.cjs` | (internal) | Launches a new Claude Code session with correct context |
| `test-tools-runner.cjs` | `pnpm test:tools` | Runs tool-specific tests outside the main test suite |
| `migrate-hook-timeouts.cjs` | (one-time) | Migrates hooks to use standardized timeout values |
| `install.mjs` | `pnpm run install-hooks` | Installs git hooks and sets up pre-commit validation |

---

## Subdirectories

### `scripts/validation/`

The primary validation subsystem. All scripts here are invoked through `pnpm validate:*` commands or the CI gate.

| Script | Purpose |
|--------|---------|
| `ci-validation-gate.cjs` | Master CI gate — runs all validations in sequence, exits non-zero on failure |
| `validate-config.mjs` | Validates `config.yaml` structure, model names, and required fields |
| `validate-sync.mjs` / `validate-sync.sh` | Checks that generated files are in sync with their sources |
| `validate-all-references.mjs` | Validates cross-references across the entire framework |
| `validate-full-sequential.cjs` | Runs all validators sequentially (used in CI, avoids parallelism issues) |
| `validate-model-names.mjs` | Validates model identifiers against the allowed model list |
| `validate-workflow.mjs` | Validates workflow definitions against JSON schemas |
| `validate-workflow-skill-contracts.mjs` | Validates that skills referenced in workflows exist |
| `validate-rule-index-paths.mjs` | Checks that all rule index paths resolve to real files |
| `validate-hooks-doc-sync.cjs` | Ensures hook documentation is in sync with actual hook files |
| `validate-no-silent-catch.cjs` | Detects empty catch blocks that swallow errors silently |
| `validate-tool-stub-policy.cjs` | Validates that tool stubs follow the declared policy |
| `validate-tool-manifest-drift.cjs` | Detects drift between tool manifests and actual files |
| `validate-intent-keyword-overlap.cjs` | Checks routing intent keywords for dangerous overlap |
| `validate-enforcement-env-sync.cjs` | Validates hook enforcement env vars are consistent |
| `validate-module-size-guardrail.cjs` | Flags modules exceeding the size guardrail (~15K tokens) |
| `validate-windows-hide-spawn.cjs` | Validates Windows spawn calls use `windowsHide: true` |
| `validate-archived-tests.mjs` | Ensures archived test files have the `.archived` suffix |
| `sync-skill-catalog.mjs` | Regenerates `.claude/context/artifacts/catalogs/skill-catalog.md` |
| `fix-primary-agent-skills.cjs` | Auto-fixes agent files missing the `skills` frontmatter field |
| `workflow-validation-helpers.mjs` | Shared helpers used by workflow validators |
| `_archive/` | Superseded validators kept for historical reference |

**Run the full validation suite:**
```bash
pnpm validate:full
```

**Run CI gate only:**
```bash
node scripts/validation/ci-validation-gate.cjs
```

---

### `scripts/generation/`

Scripts that generate derived files from source of truth.

| Script | Purpose |
|--------|---------|
| `generate-prebuilt-rule-index.mjs` | Generates prebuilt rule index from `.claude/rules/` for fast hook resolution |
| `generate-rule-index.mjs` | Regenerates the runtime rule index |

---

### `scripts/installation/`

One-time and recurring installation utilities.

| Script | Purpose |
|--------|---------|
| `install.mjs` | Installs git hooks, configures `.env` defaults, checks runtime prerequisites |

---

### `scripts/maintenance/`

Scripts for ongoing project hygiene.

| Script | Purpose |
|--------|---------|
| `format-tracked.mjs` | Runs Prettier on all git-tracked files (used by `pnpm format`) |
| `patch-hook-exits.cjs` | Patches hook files to use correct exit codes (0/2, never 1) |

---

### `scripts/testing/`

Test infrastructure utilities.

| Script | Purpose |
|--------|---------|
| `count-all-tests.mjs` | Counts total test cases across the test suite (active and archived) |
| `test-version-validation.mjs` | Tests that version validation logic works correctly |
| `_archive/` | Archived test scripts no longer in active use |

---

### `scripts/benchmarks/`

Performance benchmarks (not part of the standard test run).

| Script | Purpose |
|--------|---------|
| `hook-latency.cjs` | Measures hook execution latency under load |
| `tree-cursor-benchmark.cjs` | Benchmarks AST tree-cursor traversal for the code indexer |

---

### `scripts/channels/`

Telegram channel daemon and integration. See `scripts/channels/README.md` for full docs.

| Script | Purpose |
|--------|---------|
| `telegram-relay.mjs` | MCP server — tools-only mode in main session (`TELEGRAM_DISABLE_POLLING=1`) |
| `telegram-ctl.cjs` | CLI: `start` / `stop` / `status` / `restart` the channel daemon |
| `daemon/` | Standalone channel daemon (11 files) — clawhip-style event router with KAIROS memory |
| `_archive/` | Archived: old VBScript/BAT system, manual launcher, intermediate poller |

---

### `scripts/shims/`

Language shims for runtime compatibility.

| File | Purpose |
|------|---------|
| `typescript-language-server.cs` | C# shim for TypeScript Language Server compatibility on Windows |

---

## Common Workflows

**First-time setup:**
```bash
pnpm run setup
```

**Before committing:**
```bash
pnpm lint:fix
pnpm format
pnpm validate
```

**Full validation (CI equivalent):**
```bash
pnpm validate:full
```

**Regenerate registries after adding an agent or skill:**
```bash
pnpm agents:registry
pnpm skills:index
```
