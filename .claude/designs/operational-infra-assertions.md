# Operational Infrastructure — Testable Behavioral Assertions

> Milestone: `operational-infra`
> Modules: `.claude/lib/services/`, `.claude/lib/readiness/`
> Runtime: CommonJS (.cjs), `node:test`, AJV for schemas, Windows-compatible

---

## 1. services.yaml Command Registry (SY)

### VAL-SY-001: Valid services.yaml passes AJV schema validation

A well-formed services.yaml with all seven canonical commands (install, test, lint, build, validate, typecheck, benchmark) and valid service definitions passes AJV schema validation and returns `{ valid: true, errors: null }`.
Evidence: Call the schema validator with a fixture containing all canonical commands and a minimal service definition; assert `valid === true` and `errors` is null.

### VAL-SY-002: Missing services.yaml returns a structured fallback

When `services.yaml` does not exist at the expected path, the registry loader returns a default/empty registry object (not null, not an exception) with an `exists: false` flag so callers can distinguish missing from malformed.
Evidence: Point the loader at a nonexistent path; assert return shape `{ exists: false, commands: {}, services: {} }` and no thrown exception.

### VAL-SY-003: Malformed YAML produces a validation error

A services.yaml with invalid YAML syntax (e.g., unclosed quotes, bad indentation) produces a parse error result with `valid: false` and a human-readable `errors` array, not an uncaught exception.
Evidence: Feed a string `"commands:\n  install: 'pnpm install\n"` to the loader; assert `valid === false` and `errors.length >= 1`.

### VAL-SY-004: Unknown canonical command key is rejected

Adding a key outside the seven canonical commands (e.g., `deploy: ./deploy.sh`) to the `commands` block causes AJV schema validation to fail with `additionalProperties` error, unless an `extras` escape-hatch field is used.
Evidence: Construct YAML with an `deploy` key under `commands`; validate; assert `valid === false` and error references the unexpected key.

### VAL-SY-005: Command mapping to nonexistent binary is detected

When a canonical command maps to a binary that does not exist on the system (e.g., `build: cargo build` when `cargo` is absent), the registry's `resolveCommand('build')` returns `{ resolved: false, reason: 'binary_not_found', binary: 'cargo' }`.
Evidence: Register a command referencing a fake binary (`__nonexistent_bin_xyz__`); call `resolveCommand`; assert `resolved === false` and `reason === 'binary_not_found'`.

### VAL-SY-006: Compound commands are parsed and each binary is validated

A compound command like `pip install -r requirements.txt && cargo build` is split on `&&` / `||` / `;` separators; each sub-command's leading binary is individually checked for existence. The result lists each binary with its resolved/unresolved status.
Evidence: Register a compound command with two binaries (one real like `node`, one fake); assert the result contains two entries, one resolved and one not.

### VAL-SY-007: Service definitions require start, healthcheck, and port

A service entry under `services:` must have at minimum `start` and `port` fields. Missing required fields cause AJV validation to report the specific missing properties.
Evidence: Create a service entry with only `start` (no `port`); validate; assert `valid === false` and error mentions `port`.

### VAL-SY-008: Port conflict detection across services

When two services declare the same `port` value, the registry's `detectConflicts()` returns a list containing the conflicting services and the shared port.
Evidence: Define two services both claiming port 3000; call `detectConflicts()`; assert result includes `{ port: 3000, services: ['svcA', 'svcB'] }`.

### VAL-SY-009: Multi-language project support via extras or language tags

A services.yaml can declare language-specific command overrides (e.g., `install.python: pip install`, `install.node: pnpm install`) and the registry resolves the correct command for a given language context.
Evidence: Register multi-language install commands; call `resolveCommand('install', { language: 'python' })`; assert it returns the python-specific variant.

---

## 2. init.sh Bootstrap System (BS)

### VAL-BS-001: Successful bootstrap writes bootstrap-state.json with all components passed

After a successful init run, a `bootstrap-state.json` file is written containing `{ status: 'complete', components: { ... } }` where each component has `{ status: 'ok', timestamp }`.
Evidence: Run the bootstrap function against a mock environment where all checks pass; read the resulting JSON file; assert overall `status === 'complete'` and every component has `status === 'ok'`.

### VAL-BS-002: Critical component failure halts bootstrap and records failure

When a critical component (e.g., `node` version check) fails, bootstrap halts immediately — subsequent components are not attempted. The bootstrap-state.json records the failed component with `status: 'failed'` and a `reason` string, and overall status is `'halted'`.
Evidence: Mock `node --version` to return a version below 18; run bootstrap; assert state has `status === 'halted'`, the node component has `status === 'failed'`, and later components have `status === 'skipped'`.

### VAL-BS-003: Idempotent re-run skips already-satisfied components

If `bootstrap-state.json` already records a component as `status: 'ok'`, and the binary is still present (`command -v` / `where` succeeds), re-running bootstrap skips that component and preserves the original timestamp.
Evidence: Pre-seed bootstrap-state.json with node component `status: 'ok'`; run bootstrap again; assert the node component timestamp is unchanged and a `skipped: true` flag is present on the component.

### VAL-BS-004: Re-run after partial failure retries only failed/skipped components

Given a bootstrap-state.json with one component `'failed'` and subsequent components `'skipped'`, re-running bootstrap retries the failed component and then continues with the skipped ones, leaving previously `'ok'` components untouched.
Evidence: Seed state with `{ nodeCheck: 'ok', pnpmInstall: 'failed', postInstall: 'skipped' }`; mock pnpm to succeed; run bootstrap; assert pnpmInstall becomes `'ok'`, postInstall is attempted, and nodeCheck timestamp is unchanged.

### VAL-BS-005: Syntax error in bootstrap script is caught and reported

If the bootstrap script content has a syntax error (when parsed/evaluated by the engine), the system catches the error and writes bootstrap-state.json with `status: 'error'` and a `parseError` field containing the error message, rather than crashing.
Evidence: Feed a bootstrap definition with invalid syntax; run the bootstrap engine; assert no uncaught exception, state file has `status === 'error'`, and `parseError` is a non-empty string.

### VAL-BS-006: Component install timeout is enforced

Each bootstrap component has a configurable timeout (default 60s). If a component exceeds its timeout, the component is marked `status: 'timeout'` and bootstrap proceeds to the halt logic (same as critical failure for critical components).
Evidence: Register a component that sleeps/hangs for 5 seconds with a 1-second timeout; run bootstrap; assert the component ends with `status === 'timeout'` within 3 seconds wall-clock.

### VAL-BS-007: Windows compatibility — uses platform-appropriate commands

On Windows (`process.platform === 'win32'`), binary existence checks use `where` instead of `command -v`, and path separators are handled correctly. The bootstrap state file is written with OS-appropriate paths.
Evidence: Mock `process.platform` to `'win32'`; run bootstrap; assert that the spawned check command is `where` (not `command -v` or `which`) and file paths use backslashes or are normalized.

---

## 3. Readiness Scoring Engine (RS)

### VAL-RS-001: All 9 pillars are evaluated and present in the output report

Running the readiness scorer against any repo produces a JSON report with exactly 9 pillar keys: `styleAndValidation`, `buildSystem`, `testing`, `documentation`, `developmentEnvironment`, `debuggingAndObservability`, `security`, `taskDiscovery`, `productAndExperimentation`. No extra, no missing.
Evidence: Run the scorer against a minimal fixture repo; parse the JSON output; assert `Object.keys(report.pillars).length === 9` and each expected key is present.

### VAL-RS-002: Pillar weights match the specification

The weighted score calculation uses exactly these weights: styleAndValidation(1.0), buildSystem(1.0), testing(1.5), documentation(0.8), developmentEnvironment(0.8), debuggingAndObservability(1.0), security(1.2), taskDiscovery(0.7), productAndExperimentation(0.5). The overall score is `sum(pillar_score * weight) / sum(weights)`.
Evidence: Feed known pillar scores (e.g., all 100); compute expected weighted average manually; assert `report.overallScore` matches the expected value exactly.

### VAL-RS-003: Each pillar executes real commands and checks exit codes

For each pillar, the engine runs the configured command (e.g., `pnpm lint` for styleAndValidation). A zero exit code means the pillar check passed; nonzero means it failed. The report records both the exit code and the command that was run.
Evidence: Mock a repo where `lint` exits 0 and `test` exits 1; run scorer; assert `pillars.styleAndValidation.passed === true` and `pillars.testing.passed === false` with recorded exit codes.

### VAL-RS-004: 5-level AMM correctly classifies readiness

The engine maps the overall weighted score to one of five levels: L1-Functional (0-39%), L2-Documented (40-59%), L3-Standardized (60-79%), L4-Optimized (80-94%), L5-Autonomous (95-100%). Boundary values are correctly assigned.
Evidence: Test with scores 0, 39, 40, 59, 60, 79, 80, 94, 95, 100; assert each maps to the expected level. Particularly: 79 → L3, 80 → L4, 94 → L4, 95 → L5.

### VAL-RS-005: 80% gate threshold per level is enforced

To advance from level N to N+1, at least 80% of the level N+1 pillar requirements must be met. If only 70% are met, the report shows `gateStatus: 'blocked'` with the shortfall percentage and the failing pillar names.
Evidence: Configure a scenario where 7 of 9 pillars pass for L2 (77.8%); assert `gateStatus === 'blocked'` and `shortfall` lists the 2 failing pillars.

### VAL-RS-006: Command timeout produces a partial pillar score (not a crash)

If a pillar command exceeds its timeout (configurable, default 30s), the pillar is scored as `{ passed: false, reason: 'timeout', exitCode: null }` and the remaining pillars are still evaluated.
Evidence: Register a pillar command that sleeps for 5s with a 1s timeout; run scorer; assert that pillar shows `reason === 'timeout'` and other pillars still have valid scores.

### VAL-RS-007: JSON output contract is stable and machine-parseable

The readiness report JSON strictly conforms to a defined schema: `{ repoPath, timestamp, level, overallScore, pillars: { [name]: { score, passed, weight, command, exitCode, reason? } }, gateStatus, recommendations[] }`. AJV validation of the output against this schema passes.
Evidence: Run the scorer; validate the output JSON against the readiness-report schema; assert `valid === true`.

### VAL-RS-008: Running against agent-studio repo itself produces a valid report

The readiness engine can be pointed at the agent-studio repository root and produces a valid report without errors, demonstrating real-world viability (even if some pillars fail).
Evidence: Run scorer with `repoPath` set to the agent-studio project root; assert no uncaught exceptions, report has all 9 pillars, and `overallScore` is a number between 0 and 100.

---

## 4. Readiness Auto-Remediation (RR)

### VAL-RR-001: --fix flag generates remediation tasks for failing pillars

When the scorer is run with `--fix` (or `{ fix: true }` option), each failing pillar produces a remediation task object with `{ pillar, action, description, files[] }` describing what would be fixed.
Evidence: Run scorer with `fix: true` against a repo missing lint config; assert `remediations.length >= 1` and at least one entry has `pillar === 'styleAndValidation'`.

### VAL-RR-002: Scaffolding creates missing config files

When a remediation runs for a missing config (e.g., `.devcontainer/devcontainer.json`, `AGENTS.md`, `.pre-commit-config.yaml`), the file is created from a template with sensible defaults. The file exists on disk after remediation.
Evidence: Run remediation for `developmentEnvironment` on a repo lacking `.devcontainer/`; assert the file now exists and contains valid JSON.

### VAL-RR-003: Dry-run mode reports changes without modifying the filesystem

When the remediation is run with `{ dryRun: true }`, the returned plan lists all files that _would_ be created/modified, but no files are actually written. A hash of the working tree before and after is identical.
Evidence: Snapshot the target directory's file listing before dry-run; run remediation with `dryRun: true`; snapshot again; assert listings are identical and the returned plan has `dryRun: true` with `plannedFiles.length >= 1`.

### VAL-RR-004: Failed remediation is reported without aborting other remediations

If one remediation action fails (e.g., template file missing, write permission denied), the failure is captured in the results as `{ pillar, status: 'failed', error }` and other remediations still execute.
Evidence: Mock a filesystem where one target directory is read-only; run multiple remediations; assert one has `status === 'failed'` with an error message and others have `status === 'completed'`.

### VAL-RR-005: Repos with no git are handled gracefully

When remediation targets a repository that has no `.git` directory (not a git repo), branch/PR creation steps are skipped and the remediation result includes `{ gitAvailable: false, branchCreated: false }`. File scaffolding still works.
Evidence: Run remediation on a temp directory with no `.git`; assert no git errors thrown, `gitAvailable === false`, and scaffolded files still exist on disk.

### VAL-RR-006: Each remediation targets a separate branch (when git is available)

When git is available, each remediation action creates a uniquely-named branch (e.g., `fix/readiness-styleAndValidation-{timestamp}`) and commits the scaffolded files there. The original branch is restored after all remediations.
Evidence: Run two remediations on a git repo; assert two new branches exist with the naming pattern; assert the active branch after completion matches the original branch.

---

**Total assertions: 28** (SY: 9, BS: 7, RS: 8, RR: 6)
