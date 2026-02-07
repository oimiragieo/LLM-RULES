## 2026-02-07: Rules System Overhaul Implementation (Pipeline #9 - Complete)

**Context:** Rules system overhaul (Pipeline #9, Task #105): create critical rules, merge, expand all, fix path conflicts, update registries.

**Key Learnings:**

1. **Rules are auto-loaded into system prompt — every line costs tokens.** Thin rules (3 lines) are worse than no rules — set minimum 6+ directives. Each rule should provide clear, actionable guidance with project-specific context.

2. **When merging files, search entire codebase for references to deleted filenames.** Merged `coding-style.md` + `patterns.md` into `code-standards.md`. Found 5 broken references in:
   - `@DIRECTORY_STRUCTURE.md` (directory tree listing)
   - `templates/README.md` (deleted files note)
   - `templates/_archive/README.md` (archive tracking)
   - `rules-system-security-review-2026-02-07.md` (enforcement table)
   Pattern: After any file deletion/rename, `grep -r "old-filename" .claude/` and update all matches.

3. **Memory protocol and task tracking were critical gaps — now have dedicated rules.** These behaviors are mandatory for every agent (CLAUDE.md Sections 8 and 5.5-5.6) but had zero rule coverage. Created `memory-protocol.md` and `task-tracking.md` to enforce via system prompt auto-loading.

4. **rule-index.json must stay in sync with filesystem.** After creating 2 rules, merging 2 into 1, and expanding 7 existing rules, updated rule-index.json to v1.3.0 with 10 rules total and complete descriptions.

5. **ADR status must reflect implementation completion.** Updated ADR-091 from "Proposed" to "Accepted (Implementation Complete: 2026-02-07)" to reflect that all 8 implementation tasks from the plan were executed successfully.

**Outcome:** 10 rules (was 9), all 33-54 lines (was 3-8), 2 critical gaps filled, 5 broken references fixed, registry updated, ADR-091 accepted.

---

## 2026-02-07: Rules System Deep Dive Architecture (Pipeline #9 - Task #102)

**Context:** Comprehensive architecture audit of `.claude/rules/` (9 files, ~128 lines, ~4.3KB).

**Key Learnings:**

1. **Rules auto-load as system prompt -- no wiring needed.** Claude Code loads all `.claude/rules/*.md` files into every conversation's system prompt automatically. They do not need `require()`, `import`, or explicit references. The "wiring" question for rules is not "is the file imported?" but "is the content accurate and useful?"

2. **Thin rules are worse than no rules.** A 3-line rule file provides minimal value while consuming system prompt tokens. Each rule should have 6+ actionable directives with project-specific detail. Generic platitudes ("prefer composition over inheritance") add noise without signal.

3. **Rule-index.json must match filesystem.** The index had 8 entries but 9 files existed (workspace-conventions.md was missing). Any programmatic rule discovery system will have blind spots. Pattern: after creating/deleting/renaming any rule file, always update rule-index.json.

4. **Cross-document path conflicts are insidious.** workspace-conventions.md (canonical, per ADR-078/ADR-081) and FILE_PLACEMENT_RULES.md (stale v2.0) disagree on plan and report paths. Agents reading different documents will write to different locations. Pattern: after any ADR that changes paths, grep the entire codebase for the old paths and update ALL references.

5. **The most critical behaviors need rule coverage.** Memory protocol (CLAUDE.md Section 8) and task tracking (Sections 5.5-5.6) are mandatory for every agent but had zero rule coverage. Rules are the most reliable enforcement layer because they auto-load for every conversation -- unlike CLAUDE.md sections which spawned agents may not fully absorb.

6. **workspace-conventions.md is the best-integrated rule.** Referenced by 46+ agent definitions, all 6 creator skills, the universal spawn template, and multiple docs. It is the model for what a rule file should look like: specific, actionable, cross-referenced, and hook-enforced.

**Evidence:**
- Architecture plan: `.claude/context/plans/rules-overhaul-architecture-2026-02-07.md`
- ADR-091: Proposed (`.claude/context/memory/decisions.md`)

---

## 2026-02-07: Rules System Security Review (Pipeline #9 - COMPLETE)

**Context:** Comprehensive security review of `.claude/rules/` system (9 markdown instruction files) for Pipeline #9.

**Key Findings:**

**Verdict:** ✅ APPROVED (Security Score: 88/100) — 2 MEDIUM, 2 LOW findings

**What was analyzed:**

1. **Content Security:** No credentials exposure, no prompt injection risk (static markdown)
2. **OWASP Top 10 Coverage:** 40% covered (A01, A03, A04, A08), 60% gaps
3. **Hook Enforcement:** 6/9 rules have hook enforcement, 3 advisory-only
4. **STRIDE Analysis:** Low risk across all categories (markdown = no execution)

**Key Learnings:**

1. **Rules System Security-by-Design Pattern:** Markdown-only instruction files eliminate execution risk. Rules cannot be exploited via:
   - Code injection (no execution)
   - Path traversal (no file operations)
   - Command injection (no shell access)
   - Privilege escalation (advisory instructions only)
   This demonstrates that **passive instruction systems** (markdown rules loaded by Claude Code) are inherently more secure than **active execution systems** (hooks, scripts, tools).

2. **Advisory vs Enforced Rules Dichotomy:** Rules fall into two categories:
   - **Enforced Rules** (6/9): Backed by hooks (routing-guard.cjs for agents.md, pre-commit.cjs for git-workflow.md, ESLint for coding-style.md, validators for workspace-conventions.md)
   - **Advisory Rules** (3/9): No hook enforcement (testing.md, patterns.md, performance.md)
   **Pattern:** Advisory-only rules are often ignored under time pressure. For critical rules (security, testing), always add hook enforcement. From memory: SEC-TOOL-001 (decision-handler.mjs `new Function()` vulnerability) occurred despite existing security rules against dynamic code execution — demonstrating advisory rules alone are insufficient.

3. **OWASP Coverage Audit Pattern:** When reviewing security guidance, map rules to OWASP Top 10:
   - ✅ Covered: A01 (Access Control), A03 (Injection), A04 (Insecure Design), A08 (Data Integrity)
   - ❌ Missing: A06 (Vulnerable Components), A09 (Logging Failures), A10 (SSRF)
   - ⚠️ Partial: A02 (Cryptography), A05 (Misconfiguration), A07 (Authentication)
   **Gap:** 60% of OWASP categories have no guidance in `security.md`. However, comprehensive guidance exists in `security-architect` and `auth-security-expert` skills (500+ lines each). **Decision:** Keep rules concise and memorable; skills are the source of truth for deep guidance.

4. **Security Lint Integration Pattern:** The rule "Never commit secrets" (security.md) has no automated enforcement. Tool exists (`security-lint.cjs`) but not integrated into pre-commit hook. **Pattern:** For any security rule, create enforcement hook:
   ```javascript
   // In .claude/hooks/git/pre-commit.cjs
   execSync('node .claude/tools/validation/security-lint.cjs', { stdio: 'inherit' });
   ```
   This prevents accidental violations (similar to ESLint preventing code style violations).

5. **Path Exposure in Documentation Anti-Pattern:** Documentation files (`workspace-conventions.md`) contained hardcoded Windows paths:
   ```markdown
   NEVER write to project root (`C:\dev\projects\agent-studio\`)
   NEVER write to user home (`C:\Users\`)
   ```
   These reveal: (1) Exact project location, (2) Username structure, (3) Directory layout. **Pattern:** Always use placeholders in documentation:
   ```markdown
   NEVER write to project root (`<PROJECT_ROOT>/`)
   NEVER write to user home (`<USER_HOME>/`)
   ```
   Prevents reconnaissance data leakage if documentation is publicly exposed.

6. **Agent Routing Rules as Defense-in-Depth:** The `agents.md` routing table enforces defense-in-depth:
   ```markdown
   | security-architect | Auth, payment, PII |
   ```
   This ensures security-sensitive work is routed to specialists. However, from memory (ADR-079), the Router collapses 94% of requests to `developer` due to enforcement hooks defaulting to `warn` mode. **Pattern:** Routing rules without enforcement hooks are advisory-only. Set `SECURITY_REVIEW_ENFORCEMENT=block` to make routing mandatory.

7. **Testing Rules as Security Gate:** The `testing.md` rules (TDD, unit tests, deterministic tests) provide a security safety net. From memory:
   - Task #99: TDD test caught phantom imports in `validate-index.mjs`
   - Task #100: TDD test caught path traversal in `install.mjs` (MEDIUM-001)
   **Pattern:** Testing rules indirectly enforce security by catching vulnerabilities early. Testing is not just for correctness — it's a security control.

8. **Rules vs Skills Authority Hierarchy:** Security guidance exists at two levels:
   - **Rules** (8 lines): Concise, memorable, agent-loaded at conversation start
   - **Skills** (500+ lines): Comprehensive, OWASP-complete, agent-invoked on demand
   **Pattern:** Rules should point to skills for deep guidance. Example:
   ```markdown
   # Security
   For comprehensive security guidance, see:
   - `security-architect` skill (STRIDE, OWASP Top 10)
   - `auth-security-expert` skill (OAuth 2.1, JWT)

   Quick rules:
   - Never commit secrets
   - Validate all inputs
   ```
   This prevents rules from becoming unmanageably long while ensuring comprehensive guidance exists.

**Recommendations Implemented:**

**None yet — findings documented in security report.**

**Recommendations Proposed:**

1. **MEDIUM-001**: Expand OWASP coverage in `security.md` (6 missing categories)
   - Option A: Add pointers to skills (15 min)
   - Option B: Add 6 sections inline (2-3 hours)
   - Recommended: **Option A** (concise rules + comprehensive skills)

2. **MEDIUM-002**: Integrate `security-lint.cjs` into pre-commit hook (1 hour)
   - Prevents accidental secret commits
   - Pattern: Hook enforcement for critical security rules

3. **LOW-001**: Replace hardcoded paths with placeholders (10 min)
   - Prevents path structure leakage

4. **LOW-002**: Clarify security-architect invocation in rules (10 min)
   - Document enforcement mode requirement

**Evidence:**
- Security report: `.claude/context/reports/security/rules-system-security-review-2026-02-07.md`
- 9 rules files analyzed, 176 lines total
- 6 security-relevant rules, 3 non-security rules
- STRIDE analysis: Low risk across all categories
- OWASP coverage: 40% complete, 60% gaps
- Hook enforcement: 6/9 rules enforced, 3 advisory-only

---

## 2026-02-07: Scripts System Wiring + Security Fix (Task #100 - COMPLETE)

**Context:** Fixed final 2 gaps (GAP-5, GAP-6) from Pipeline #8 audit + addressed MEDIUM-001 security vulnerability.

**What was done:**

1. **Fixed GAP-5**: Added 3 missing package.json entries
   - `verify:deps` → `scripts/verify-dependencies.mjs` (checks optional dependencies like fastembed, sharp)
   - `test:count` → `scripts/testing/count-all-tests.mjs` (counts test files across project)
   - `verify:hooks` → `.claude/scripts/verify-hook-modules.cjs` (verifies all 46 hooks load correctly)
   - All 3 scripts now discoverable via `pnpm` (consistent with project convention)

2. **Fixed MEDIUM-001**: Path traversal vulnerability in install.mjs
   - Added validation to reject `..` in target directory paths
   - Added check for target outside CWD (requires `--force` flag)
   - Security fix prevents installation to unintended locations (e.g., `../../../etc`)
   - Created TDD regression test: `tests/scripts/install-security.test.cjs` (4 test cases, all pass)

3. **Fixed GAP-6**: Windows compatibility documentation for validate-sync.sh
   - Added 17-line comment block at top of script
   - Documents bash requirement (Git Bash, WSL, Cygwin/MSYS2 on Windows)
   - Provides alternative: cross-platform Node.js validation scripts (`pnpm validate:config`, `pnpm validate:references`, `pnpm validate:full`)
   - Suggests creating Node.js equivalent at `scripts/validation/validate-sync.mjs` for full cross-platform support

4. **Fixed typo**: `_statSync` → `statSync` in install.mjs import (line 19)

**Key Learnings:**

1. **TDD for Security Fixes Pattern:** Write failing test first (RED) showing vulnerability exists, implement fix (GREEN), verify test passes. The test serves as permanent regression guard. Pattern: create test with malicious input (path traversal, command injection), assert it's rejected, implement validation, verify rejection.

2. **Path Validation Defense-in-Depth:** Two-layer validation for user-provided paths:
   - Layer 1: Detect literal `..` in resolved path (blocks `../../../etc`)
   - Layer 2: Check if resolved path starts with safe root (blocks `/tmp/malicious`)
   - Optional confirmation for external paths via `--force` flag
   - Pattern applies to any script accepting user paths (install, copy, move, delete operations)

3. **Script Wiring Discoverability:** Unwired scripts are invisible to users. Adding package.json entries makes them discoverable via `pnpm run` tab-completion and `pnpm run` list. Pattern: For any utility script, always add a package.json entry using the established naming convention (`verb:noun` or `test:scope`).

4. **Cross-Platform Documentation Pattern:** For bash-only scripts in cross-platform projects, add prominent comment block explaining Windows incompatibility, suggesting alternatives, and documenting workarounds. Include example commands for each alternative. This prevents user frustration and reduces support requests.

**Evidence:**
- Test file: `tests/scripts/install-security.test.cjs` (4/4 tests pass)
- Fixed files: 3 (package.json, install.mjs, validate-sync.sh)
- New package.json scripts: 3 (`verify:deps`, `test:count`, `verify:hooks`)
- All 3 new scripts tested and functional
- All existing tests pass (unit, framework, tools)

---

## 2026-02-07: Scripts System Phantom Import Fixes (Task #99 - COMPLETE)

**Context:** Fixed 4 critical gaps (GAP-1 through GAP-4) from Pipeline #8 audit.

**What was done:**

1. **Fixed GAP-1 (CRITICAL)**: validate-index.mjs phantom import
   - Changed: `.claude/tools/context/context-path-resolver.mjs` → `.claude/lib/utils/context-path-resolver.mjs`
   - Unblocked: `pnpm validate:full` CI chain (was broken at step 5)

2. **Fixed GAP-2**: validate-all-references.mjs phantom paths
   - Updated 3 phantom references from old `tools/workflow/` to new `lib/workflow/` locations
   - workflow_runner.js, decision-handler.mjs, loop-handler.mjs all updated

3. **Fixed GAP-3**: Archived dead benchmark-ml-performance.cjs
   - Moved to `scripts/testing/_archive/` with README explaining reason
   - Had broken relative paths (`./.claude/lib/ml/` from script subdir)
   - Zero consumers, ML modules may not exist

4. **Fixed GAP-4**: Merged overlapping validators
   - validate-index.mjs was subset of validate-rule-index-paths.mjs
   - Updated root wrapper to delegate to superset
   - Archived subset implementation to `scripts/validation/_archive/`
   - `pnpm validate:index` still works (delegates to superset)

5. **Created TDD regression test** at `tests/scripts/script-imports.test.cjs`:
   - RED: Test failed with 4 phantom imports detected (GAP-1 + GAP-3)
   - GREEN: Fixed all imports, test passes
   - Prevents future phantom imports by validating all script `import`/`require` paths resolve

**Key Learning:**

**Script import regression prevention pattern:** Create a test that extracts all `import` and `require` paths from script files and verifies the targets exist. Catches phantom imports immediately. Pattern from Pipeline #7 (phantom-scripts.test.cjs validates package.json) extended to validate actual import statements in script code.

**Evidence:**
- Test file: `tests/scripts/script-imports.test.cjs` (passes)
- Fixed files: 2 scripts (validate-index.mjs, validate-all-references.mjs)
- Archived: 2 scripts (benchmark-ml-performance.cjs, validate-index.mjs implementation)
- validate:full chain now functional (was broken at step 5)

---

## 2026-02-07: Scripts System Deep Dive (Task #98 - Architecture Plan)

**Context:** Pipeline #8 audit of all scripts in `scripts/` (30 files) and `.claude/scripts/` (5 files).

**Key Learnings:**

1. **Phase C consumer updates must be exhaustive.** The Tools Overhaul (ADR-089) relocated 8 modules from `tools/` to `lib/` and updated 45+ consumers, but missed 2 scripts: `validate-index.mjs` (phantom import, breaks `validate:full` CI chain) and `validate-all-references.mjs` (phantom reference paths). Pattern: After any module relocation, grep for ALL old paths across the entire codebase, including `scripts/` directory -- not just `.claude/`.

2. **Wrapper-shim delegation is a proven API stability pattern.** The 11 root-level 6-line wrapper scripts (`scripts/validate-config.mjs` -> `scripts/validation/validate-config.mjs`) provide a stable external API. Package.json entries reference root-level shims. Internal reorganization does not break callers. Worth replicating for any directory with external consumers.

3. **Script boundary: `scripts/` vs `.claude/scripts/`.** Implicit but consistent: `scripts/` = project-facing utilities (validation, generation, formatting); `.claude/scripts/` = framework-internal utilities (routing, package manager, hook verification). Should be documented.

4. **Scripts are accessed via pnpm, not by direct agent references.** No agent definition references any script by file path. Agents use `pnpm validate`, `pnpm format`, etc. This is correct but makes script-to-agent relationships invisible during audits. The package.json is the wiring layer between agents and scripts.

5. **Overlapping script detection matters.** `validate-index.mjs` (99 lines) and `validate-rule-index-paths.mjs` (259 lines) do the same core task (validate rule-index.json paths). The latter is a superset. Merge and archive the subset. Pattern: When adding a new validation script, check if an existing script already covers the same domain.

**Issues Found (recorded in ADR-090):**
- GAP-1: CRITICAL phantom import in validate-index.mjs (breaks validate:full) [FIXED Task #99]
- GAP-2: Phantom reference paths in validate-all-references.mjs [FIXED Task #99]
- GAP-3: Dead/broken benchmark-ml-performance.cjs [FIXED Task #99 - archived]
- GAP-4: Overlapping validate-index.mjs / validate-rule-index-paths.mjs [FIXED Task #99 - merged]
- GAP-5: 4 unwired scripts [Pending Task #100]
- GAP-6: Windows-incompatible validate-sync.sh [Pending]

---

## 2026-02-07: Tools System Quick Wins (Task #93 - COMPLETE)

**Context:** Phase A of tools overhaul - quick wins with low risk, high impact.

**What was done:**

1. **Deleted 3 stub files** via `git rm`:
   - `optimization/token-optimizer/monitor.js` (8-line mock)
   - `optimization/token-optimizer/prune.js` (4-line mock)
   - `runtime/observability/status.js` (1-line stub)

2. **Deleted 3 __pycache__ directories** (untracked bytecode):
   - `analysis/repo-rag/__pycache__/`
   - `integrations/mcp-converter/__pycache__/`
   - `optimization/sequential-thinking/__pycache__/`
   - `.gitignore` already had `__pycache__/` pattern (line 231)

3. **Fixed 12 phantom package.json scripts** (removed references to 9 missing files):
   - Removed: `precommit`, `cleanup`, `cleanup:check`, `ship-readiness:headless`, `ship-readiness:headless:json`, `cleanup:headless:check`, `cleanup:headless`, `validate:docs-links`, `validate:agents`, `sync-cuj-registry`, `sync-cuj-registry:validate`, `cuj`, `cuj:list`, `cuj:simulate`, `cuj:validate`, `validate:workflow-gates`, `test:codex-integration`, `test:codex-integration:mock`, `test:skill-triggering`

4. **Created TDD regression test** at `tests/tools/phantom-scripts.test.cjs`:
   - RED: Test failed with 12 phantom scripts detected
   - GREEN: Fixed package.json, test passes
   - Test prevents future phantom scripts by validating all `node` commands reference existing files

**Key Learning:**

**Phantom Script Prevention Pattern:** Always create a TDD test that validates package.json integrity when removing phantom scripts. The test serves as a regression guard against future phantom script accumulation. Pattern:
```javascript
// Extract file paths from node commands
// Verify each file exists
// Assert zero phantom scripts
```

**Evidence:**
- Test file: `tests/tools/phantom-scripts.test.cjs` (passes)
- Deleted files: 3 stubs via git rm
- Fixed package.json: removed 12 phantom script entries
- All tests pass: `pnpm test:tools` (4/4 pass)

---

## 2026-02-07: Tools System Deep Dive (Enterprise Pipeline #7 - Architecture Complete)

**Context:** Comprehensive audit of `.claude/tools/` (88 source files, 13 subdirectories).

**Key Patterns:**

1. **Phantom Script Pattern (CRITICAL):**
   9 package.json scripts reference files that do not exist, breaking 15 npm commands. This happens when scripts are added speculatively during planning but the backing tool is never built. Always verify file existence before adding package.json scripts.

2. **tools/ vs lib/ Boundary Rule:**
   `tools/` should contain CLI-invokable scripts and skill backend executors. Library modules that are `require()`d or `import()`ed by other code belong in `lib/`. 7 modules were misplaced (skills-core, swarm-coordination, context-path-resolver, gate, workflow handlers).

3. **Stub Accumulation Pattern:**
   During scaffolding, placeholder files (1-8 lines of mock code) are created as "future work" markers. They never get implemented and accumulate as noise. Three stubs found: token-optimizer/monitor.js, token-optimizer/prune.js, observability/status.js.

4. **One-Time Migration Tool Lifecycle:**
   Migration tools (migrate-agent-config.cjs, conductor-state-migrate.cjs, etc.) serve their purpose once and become dead weight. Pattern: archive after migration is verified complete.

5. **Wiring Audit Methodology:**
   For tools audit: check package.json scripts, `require()` references in hooks/lib, `import` references, documentation mentions. A tool is "wired" only if active code paths invoke it. Documentation-only references count as "referenced" not "wired".

**Evidence:**
- Architecture plan: `.claude/context/plans/tools-overhaul-architecture-2026-02-07.md`
- ADR-089: Proposed (`.claude/context/memory/decisions.md`)

---

2. **Boilerplate at Scale:** 16 identical 3-line delegators (only skill name varies). At 10+ similar delegators, automation becomes tempting. Solution: keep pattern simple; if adding >50 commands, consider command-generator script.

3. **Commands as User-Controlled:** Commands are not protected by creator guard (unlike framework artifacts). Users can modify local commands. This is intentional and safe by design.

**Recommendations for Future Pipeline Work:**

1. Use Task #83 architecture phase as template for any similar system audits
2. Apply disposition matrix pattern to other inventory audits (hooks, templates, skills)
3. Create command-generator script if commands exceed 30+ entries
4. Consider auto-generating catalog sections from frontmatter metadata (future enhancement)

**Evidence:**
- QA validation report: `.claude/context/reports/qa/commands-system-qa-report-2026-02-07.md` (9/9 checks passed)
- Command catalog: `.claude/context/artifacts/catalogs/command-catalog.md` (429 lines, exemplary)
- ADR-087: Accepted (`.claude/context/memory/decisions.md`)

---

## 2026-02-07: Tools System Security Review Learnings (Task #92)

**Context:** Comprehensive security review of `.claude/tools/` directory (77 files, 15,203 LOC).

**Key Learnings:**

1. **Safe Spawn Pattern (94% Compliance):**
   Tools overwhelmingly use safe command execution patterns:
   ```javascript
   spawnSync('node', [arg1, arg2], { shell: false, cwd: SAFE_DIR });
   ```
   This prevents command injection by disabling shell interpretation and using array arguments.

2. **Expression Evaluation is Dangerous:**
   Using `new Function()` or `eval()` with user input creates arbitrary code execution vectors even with "safety checks". The decision-handler.mjs demonstrates this: regex validation is insufficient - attackers can embed code in string literals that bypass pattern matching.

3. **Path Traversal Defense Pattern:**
   Always validate paths stay within PROJECT_ROOT before file operations:
   ```javascript
   const normalized = path.resolve(userPath);
   if (!normalized.startsWith(path.resolve(PROJECT_ROOT))) {
     throw new Error('Path traversal detected');
   }
   ```

4. **Credential Handling in Containers:**
   Passing secrets as Docker environment variables (`-e TOKEN=value`) exposes them in:
   - Process list (`ps aux`)
   - Docker inspect output
   - Container logs
   Use Docker secrets or volume mounts instead.

5. **Security Lint as Defense Layer:**
   The existing `security-lint.cjs` tool provides excellent pre-commit protection with 30+ rules. Integration into pre-commit hooks is a force multiplier.

6. **Tools vs Framework Artifacts:**
   Tools (executable code, user-controlled) should NOT be protected by creator-guard, unlike framework artifacts (passive markdown with post-creation steps). This is correct by design.

7. **Input Validation Compliance is Low:**
   Only 5% (4/77) of tools validate user inputs. Centralized validation library would dramatically improve security posture.

8. **Logging Can Leak Secrets:**
   Security scanners that detect secrets must avoid logging the detected secrets themselves. Truncate sensitive content before logging.

**Patterns to Avoid:**

- `execSync` with string interpolation
- `new Function()` with user input
- `eval()` in any context
- Unvalidated `path.join()` or `path.resolve()` with user paths
- Credentials in environment variables (use secrets management)

**Patterns to Adopt:**

- `spawnSync` with array args and `shell:false`
- Centralized path validation before file operations
- Pre-commit security scanning
- Explicit user confirmation for destructive operations
- Resource limits (depth, timeout, max files) for recursive operations

**Evidence:**
- Security review report: `.claude/context/reports/security/tools-system-security-review-2026-02-07.md`
- 8 findings identified (1 HIGH, 3 MEDIUM, 4 LOW)
- 2 MUST-FIX findings: SEC-TOOL-001, SEC-TOOL-003

---

## 2026-02-07: Tools Phase C - Relocate Library Modules + SEC-TOOL-001 Fix (Task #95 - COMPLETE)

**Context:** Phase C of tools overhaul - relocate 8 misplaced library modules from tools/ to lib/, fix HIGH severity security vulnerability.

**Key Learnings:**

1. **Recursive Descent Parser for Safe Expression Evaluation:**
   When workflow expressions need evaluation, NEVER use `new Function()`, `eval()`, or regex-based sanitization. Instead, implement a recursive descent parser that only supports:
   - Literals: true, false, numbers, single/double-quoted strings, null, undefined
   - Comparisons: ===, !==, ==, !=, >=, <=, >, <
   - Logical: &&, ||, !
   - Parenthesized grouping
   - NO identifiers, function calls, property access, assignments, template literals
   This approach is 100% safe because the parser rejects anything it doesn't explicitly support.

2. **Security-Lint-Ignore Directive for Test Files:**
   Test files containing intentional malicious expression strings (for security testing) trigger false positives in security-lint.cjs. Add `// security-lint-ignore: <reason>` as the first line of the file to skip scanning. Always include a reason explaining why.

3. **ESLint eqeqeq vs Intentional Loose Equality:**
   When a parser deliberately supports both `==` and `===` operators, the code evaluating `==` triggers ESLint's `eqeqeq` rule. Use inline `// eslint-disable-line eqeqeq` with a comment explaining the intentionality.

4. **git mv Preserves History:**
   Using `git mv` for file relocations preserves git blame/log history. Always prefer `git mv` over delete+create for relocations.

5. **Consumer Discovery Pattern for Relocations:**
   Before moving any file, grep the ENTIRE codebase for:
   - The filename (e.g., `decision-handler`)
   - The directory path (e.g., `tools/workflow/`)
   - Any `require()` or `import` referencing the old path
   Update ALL consumers before committing. Missing even one import breaks the build.

6. **rootDir Computation After Relocation:**
   When moving files deeper in the directory tree, `resolve(__dirname, '../..')` must be updated to match the new depth (e.g., `resolve(__dirname, '../../..')`). This is easy to miss and causes silent failures.

**Files Created:**
- `tests/lib/workflow/decision-handler-security.test.cjs` - 41 security tests (20 malicious rejections, 16 legitimate expressions, 3 context integration, 2 complex condition)
- SafeExpressionParser class in `decision-handler.mjs` (~200 lines)

**Files Moved (8 + 1 test):**
- skills-core.js -> lib/skills/
- swarm-coordination.cjs + README.md -> lib/coordination/
- context-path-resolver.mjs -> lib/utils/
- gate.mjs -> lib/qa/
- decision-handler.mjs -> lib/workflow/
- loop-handler.mjs -> lib/workflow/
- workflow-runner.js -> lib/workflow/
- skills-core.test.js -> tests/lib/skills/

**Evidence:**
- Commit: `789f849c` (45 files changed, 946 insertions, 297 deletions)
- All 41 security tests pass
- All hooks pass (security-lint, ESLint, tool-manifest)

---

## 2026-02-07: Commands System Overhaul (Enterprise Pipeline #5 - COMPLETE)

**Context:** Overhauled `.claude/commands/` system (17 commands) per ADR-087.

**Key Patterns:**

1. **Thin Delegator Pattern (canonical for commands):**
   Commands are 3-line shims with `disable-model-invocation: true` that invoke a single skill. The skill is the source of truth for behavior. Commands are the user-facing entry point.

2. **Commands vs Skills vs Agents:**
   - Commands = user types `/name` (entry point, passive markdown)
   - Skills = agent invokes `Skill()` (behavior implementation)
   - Agents = Router spawns `Task()` (execution context)

3. **Commands NOT creator-guarded (by design):**
   Unlike skills/agents/hooks/templates, commands are passive markdown with no privilege escalation. Creator guard overhead not justified (confirmed by security review).

4. **Dead infrastructure cleanup pattern:**
   Commands referencing non-existent directories (`.claude/todos/`, `.claude/state/`, `.claude/checkpoints.log`) were deleted rather than fixed -- the backing infrastructure was never built.

**Files Changed:**
- Deleted: 4 commands (checkpoint, orchestrate, add-todo, check-todos)
- Converted: 8 stubs to delegators
- Enriched: 1 command (/learn -> memory protocol)
- Created: 4 new commands (debug, security-review, compress, analyze)
- Created: command-catalog.md
- Fixed: 5 documentation files

**Architecture:** `.claude/context/plans/commands-overhaul-architecture-2026-02-07.md`

---

## 2026-02-07: Tools System Overhaul (Pipeline #7 - COMPLETE)

**Context:** Comprehensive tools directory cleanup and restructuring across 4 phases (Tasks #93-96).

**Key Patterns:**

1. **Tools vs Library Boundary Enforcement:**
   `.claude/tools/` contains CLI-executable scripts. Library modules (imported via `require()` or `import`) belong in `.claude/lib/`. 8 modules were misplaced and relocated, creating confusion about what tools/ is for. This boundary must be enforced going forward.

2. **Archive Pattern for Dead Tools:**
   Use `git mv` to move dead tools to `_archive/` subdirectory. Preserves full git history (blame, log) for future reference. Create `_archive/README.md` explaining archival rationale and restoration process. Applied to 25 dead tools with zero codebase references.

3. **Phantom Script Prevention (TDD Pattern):**
   Created regression test `tests/tools/phantom-scripts.test.cjs` that validates all package.json `node <file>` commands reference existing files. Prevents future accumulation of phantom scripts (scripts that break because the backing tool was never built). Fixed 12 phantom scripts referencing 9 missing files.

4. **Tool Catalog as Discoverability Aid:**
   Created `.claude/context/artifacts/catalogs/tool-catalog.md` following the pattern from skill/template/command/schema catalogs. Documents all 99 tools (66 active + 25 archived + 8 relocated) with wiring status (package.json, skills, hooks). Enables agents and developers to discover available tools.

5. **Security Fix During Relocation (SEC-TOOL-001):**
   `decision-handler.mjs` used `new Function()` with user input for workflow expression evaluation. Replaced with SafeExpressionParser (recursive descent parser supporting only literals, comparisons, logical operators). Created 41 security tests (20 malicious rejections, 16 legitimate expressions). Pattern: never use `new Function()` or `eval()` - always parse with safe AST-based parser.

6. **Consumer Discovery for Relocations:**
   Before moving any file, grep ENTIRE codebase for: filename, directory path, `require()` / `import` references. Update ALL consumers before committing. Missing even one import breaks the build. For 8 relocated modules, updated 45+ consumer imports.

7. **Depth Calculation After Relocation:**
   When moving files deeper in directory tree, `resolve(__dirname, '../..')` must be updated to match new depth (e.g., `resolve(__dirname, '../../..')`). This is easy to miss and causes silent failures when computing PROJECT_ROOT.

**Files Changed:**

**Phase A (Task #93):**
- Deleted: 3 stub files (token-optimizer/monitor.js, token-optimizer/prune.js, observability/status.js)
- Deleted: 3 `__pycache__/` directories
- Fixed: 12 phantom package.json scripts
- Created: `tests/tools/phantom-scripts.test.cjs` (TDD regression guard)

**Phase B (Task #94):**
- Archived: 25 dead tools to `.claude/tools/_archive/`
- Created: `.claude/tools/_archive/README.md`

**Phase C (Task #95):**
- Relocated: 8 library modules from `tools/` to `lib/` (skills-core, swarm-coordination, context-path-resolver, gate, decision-handler, loop-handler, workflow-runner)
- Fixed: SEC-TOOL-001 (SafeExpressionParser replaced `new Function()` in decision-handler.mjs)
- Created: 41 security tests for SafeExpressionParser
- Updated: 45+ consumer imports
- Commit: `789f849c`

**Phase D (Task #96):**
- Created: `.claude/context/artifacts/catalogs/tool-catalog.md` (complete inventory: 99 tools)
- Rewrote: `.claude/tools/README.md` (accurate inventory with relocated/archived sections)
- Updated: `.claude/docs/@DIRECTORY_STRUCTURE.md` tools section
- Updated: `.claude/CLAUDE.md` Section 1.4 to reference tool catalog
- Updated: ADR-089 status to Accepted with implementation notes

**Evidence:**
- Tool catalog: 66 active + 25 archived + 8 relocated = 99 total tools documented
- Zero phantom scripts (validated by TDD test: `pnpm test:tools`)
- All library modules correctly located in `lib/`
- SEC-TOOL-001 fixed with 41 passing security tests
- Complete git history preserved for all archived/relocated tools

---

## 2026-02-07: Scripts System Security Review (Task #98 - Pipeline #8)

**Context:** Comprehensive security review of `scripts/` and `.claude/scripts/` (31 script files, ~2,800 LOC).

**Key Learnings:**

1. **Scripts Inherit Tools Security Patterns:**
   The scripts system avoids all vulnerabilities identified in Pipeline #7 (Tools System Security Review). Zero instances of `eval()`, `new Function()`, or unsafe `execSync` with string interpolation. This demonstrates that security patterns established in one codebase area successfully propagate to related systems.

2. **Safe execSync Pattern:**
   When using `execSync`, always use static command strings with validated `cwd` parameter:
   ```javascript
   // ✅ SAFE: Static command, validated directory
   execSync('pnpm install', {
     stdio: 'inherit',
     cwd: targetDir, // Already validated
   });

   // ❌ UNSAFE: String interpolation with user input
   execSync(`npm install ${userPackage}`); // Command injection risk
   ```

3. **Path Validation for User-Provided Directories:**
   When accepting directory paths from users (e.g., installation targets), always validate for path traversal:
   ```javascript
   const targetDir = resolve(userInput);

   // Detect path traversal attempts
   if (targetDir.includes('..')) {
     throw new Error('Path traversal detected');
   }

   // Optional: Warn if outside CWD
   if (!targetDir.startsWith(process.cwd()) && !forceFlag) {
     throw new Error('Target outside current directory - use --force to confirm');
   }
   ```

4. **Destructive Operations Should Default to Dry-Run:**
   Scripts that delete files or modify state should require explicit confirmation:
   ```javascript
   const shouldDryRun = parsed.dryRun || !parsed.force;

   if (!shouldDryRun && isDestructive) {
     // Add interactive prompt for confirmation
     rl.question('Are you sure? (yes/no): ', (answer) => {
       if (answer.toLowerCase() !== 'yes') {
         process.exit(0);
       }
       // Proceed with operation
     });
   }
   ```
   This pattern is implemented in `reset-context.cjs` and should be adopted by all destructive scripts.

5. **execSync Timeout Best Practice:**
   Always set a timeout for `execSync` calls to prevent indefinite hangs:
   ```javascript
   execSync('pnpm install', {
     stdio: 'inherit',
     cwd: targetDir,
     timeout: 600000, // 10 minutes
   });
   ```
   Without timeout, network issues or circular dependencies can block the script indefinitely.

6. **Symlink Detection in Recursive Scans:**
   When recursively scanning directories, check for symlinks to avoid infinite loops:
   ```javascript
   const stat = fs.lstatSync(fullPath);
   if (stat.isSymbolicLink()) {
     continue; // Skip symlinks
   }
   if (entry.isDirectory()) {
     recurse(fullPath); // Safe to recurse
   }
   ```

7. **Security Review Verdict Pattern:**
   A successful security review should include:
   - Executive summary with clear APPROVED/APPROVED WITH CONDITIONS/REJECTED verdict
   - Severity classification (CRITICAL/HIGH/MEDIUM/LOW)
   - STRIDE threat analysis for each category
   - OWASP Top 10 mapping
   - Comparison with previous findings (establish trends)
   - Positive security patterns (not just vulnerabilities)

**Comparison with Pipeline #7:**

| Pipeline #7 (Tools) | Pipeline #8 (Scripts) |
|---------------------|----------------------|
| 8 findings (1 HIGH, 3 MEDIUM, 4 LOW) | 4 findings (0 HIGH, 1 MEDIUM, 3 LOW) |
| SEC-TOOL-001: `new Function()` | ✅ No dynamic code execution |
| SEC-TOOL-002: Command injection | ✅ Static execSync commands |
| SEC-TOOL-003: Path traversal | ⚠️ MEDIUM-001: Unvalidated install target |

**Evidence:**
- Security report: `.claude/context/reports/security/scripts-system-security-review-2026-02-07.md`
- Analyzed: 31 script files, ~2,800 LOC
- Verdict: APPROVED (Security Score: 95/100)

---
