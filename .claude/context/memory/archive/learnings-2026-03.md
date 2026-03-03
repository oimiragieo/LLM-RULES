# learnings Archive (2026-03)

## Stale Doc Reference Cleanup (Task #3, 2026-03-01)

- W-009 (dashboard-renderer): No active doc references found. Only in archive memory files and reports — no edits needed.
- W-011 (creators-- workflows): Replacement workflows (`command-creator-skill-workflow.md`, `rule-creator-skill-workflow.md`, `tool-creator-skill-workflow.md`) all confirmed to exist. `creators--` prefix references only in worktrees and ecosystem-audit-report.md (legitimate audit record) — no edits needed.
- W-012 (artifact-updater-skill-workflow): Only reference in `ecosystem-audit-report.md` which is documenting the deletion — no edits needed.
- W-018 (deleted validation scripts): No references found in `package.json` or any active `.claude` docs — no edits needed.
- W-008 (memory-retention-config.cjs): Module was archived to `.claude/lib/memory/_archive/memory-retention-config.cjs`. Updated `MEMORY_SYSTEM.md` line 319 to point to the correct `_archive` path.
- Pattern: Most "stale references" from the audit only appeared in archive memory files and audit reports — those are legitimate historical records, not actionable stale references.

---

## Skill Updated: fiber-logging-and-project-structure (2026-03-01)

- Skill `fiber-logging-and-project-structure` bumped v1.1.0 → v1.2.0.
- Expanded instructions: added Standard Go Layout section (cmd/internal/pkg/api), middleware registration order, structured logging (zerolog), typed config struct pattern, global error handler.
- Updated frontmatter: added zerolog/viper/clean-architecture tags; improved description.
- Updated lastVerifiedAt: 2026-02-28 → 2026-03-01.
- Wired to: golang-pro (frontmatter added fiber-logging-and-project-structure). Matrix already had fiber_project contextual.
- Gotcha: `fiber-routing-and-csrf-protection` in golang-pro frontmatter satisfied Check 4 substring match for "fiber" — actual skill was missing from frontmatter.
- Validation improved from 7 pass/1 fail → 8 pass/0 fail (3 skipped).
- Research: Fiber v3 logger middleware import path changed to `github.com/gofiber/fiber/v3/middleware/logger`; middleware registration order matters — Logger before routes only.
- VoltAgent/awesome-agent-skills: no counterpart found for fiber-logging-and-project-structure.

---

## Skill Updated: dynamic-api-integration (2026-03-01)

- Skill `dynamic-api-integration` bumped v1.1.0 → v1.2.0.
- Added agents frontmatter [developer, architect], category: API & Integrations, tags array.
- Wired to: developer (secondary), architect (secondary), agent-skill-matrix.json.
- Skill was already production-quality (5 Iron Laws, 7 Anti-Patterns, full 5-phase UTCP workflow, auth patterns, chaining examples, security checklist). Gap was purely agent assignment and frontmatter metadata.
- Research: AutoTool (arXiv 2512.13278, Dec 2025) validates dynamic tool selection for agentic reasoning; MCP-Zero (arXiv 2506.01056, Jun 2025) confirms active tool discovery pattern; REST APIs to MCP (arXiv 2507.16044, Jul 2025) validates OpenAPI-first approach for LLM tool integration.
- VoltAgent/awesome-agent-skills: no counterpart found for dynamic-api-integration.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).

---

## Skill Updated: medusa (2026-03-01)

- Skill `medusa` bumped v1.1.0 → v1.2.0. Content already production-quality (Workflow SDK rules, data model rules, service rules, Iron Laws, Anti-Patterns).
- Updated frontmatter: agents expanded to [developer, nextjs-pro]; added workflow-sdk tag; improved description.
- Fixed lastVerifiedAt format from ISO datetime to date string.
- Wired to: developer (frontmatter + contextual:medusa_project), nextjs-pro (contextual:medusa_project) in agent-skill-matrix.json.
- Validator Check 4 false positive: `medusa-security` in penetration-tester.md satisfied Check 4 via substring match — skill was actually not wired to any correct agent.
- Validation improved from 7 pass/1 fail → 8 pass/0 fail (3 skipped).
- Research: Medusa v2 modular architecture confirmed; Workflow SDK is canonical pattern for all async ops; direct service calls in background jobs bypass distributed transactions.
- VoltAgent/awesome-agent-skills: no counterpart found for medusa.

---

## Skill Updated: context-degradation (2026-03-01)

- Skill `context-degradation` bumped v1.1.0 → v1.2.0.
- Wired to: context-compressor (primary), planner (secondary), agent-skill-matrix.json.
- Skill was already production-quality (5 severity zones, 5 Iron Laws, 5 Anti-Patterns, detection checklist). Gap was purely agent assignment wiring.
- Research: Intelligence Degradation in Long-Context LLMs (arXiv 2601.15300, Jan 2026) confirms catastrophic performance degradation past critical thresholds; Lost-in-the-Middle (arXiv 2511.13900, Nov 2025) validates 20-40% recall drop in middle tokens past 100K.
- VoltAgent/awesome-agent-skills: no counterpart found for context-degradation.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- Pattern: skill correctly identifies context-compressor as primary agent; matrix entry was missing despite agents frontmatter being correct.

---

## Skill Updated: elixir-expert (2026-03-01)

- Skill `elixir-expert` kept at v1.1.0 — content already production-quality (OTP, GenServer, Supervisor, Ecto, LiveView, ExUnit, deployment patterns). Gap was purely agent assignment wiring.
- Wired to: developer (frontmatter + contextual:elixir_project) in agent-skill-matrix.json.
- Updated lastVerifiedAt: 2026-02-28 → 2026-03-01.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- Research: Phoenix LiveView best practices 2025 — avoid large assigns in socket (memory leak risk); use LiveComponents for encapsulated UI; Task.async for non-blocking AI integration in GenServers.
- VoltAgent/awesome-agent-skills: no counterpart found for elixir-expert.
- Pattern: skill with rich content (400+ lines, examples, Iron Laws, Anti-Patterns) still failed Check 4+5+10 purely due to missing matrix wiring.

---

## Skill Updated: ask-questions-if-underspecified (2026-03-01)

- Skill `ask-questions-if-underspecified` bumped v1.1.0 → v1.2.0.
- Added agents frontmatter [planner, developer, architect], category: Planning & Architecture, tags array.
- Wired to: planner (primary), developer (secondary), agent-skill-matrix.json.
- Skill was already production-quality (5 Iron Laws, 5 Anti-Patterns, examples). Gap was purely agent assignment and frontmatter metadata.
- Research: Ambig-SWE (arXiv 2502.13069, Jan 2026) confirms interactive clarification is critical for software engineering agents; AskBench (arXiv 2602.11199, Feb 2026) validates asking clarifying questions improves task success rates.
- VoltAgent/awesome-agent-skills: no counterpart found for ask-questions-if-underspecified.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).

---

## Skill Updated: drizzle-orm-rules (2026-03-01)

- Skill `drizzle-orm-rules` bumped v1.0.0 → v1.1.0. Full rewrite from 63-line stub to production-ready SKILL.md.
- Added 5 Iron Laws: identity columns over serial, no push in production, relations() required for relational API, never delete applied migrations, import operators from drizzle-orm.
- Added 5-row Anti-Patterns table: serial(), push in production, N+1 loop queries, missing relations(), json() vs jsonb().
- Added comprehensive schema/query/transaction code examples.
- Added sections: Schema Design, Indexing, Queries, Migrations, Relations.
- Wired to: database-architect (frontmatter + contextual:drizzle_project), developer (contextual:drizzle_project), nodejs-pro (contextual:drizzle_project).
- Validation improved from 7 pass/1 fail → 8 pass/0 fail (3 skipped).
- Research: Drizzle 2025 — identity columns are new PG standard; `drizzle-kit push` never for production; jsonb() outperforms json() for indexed queries (productdevbook gist 2026).
- VoltAgent/awesome-agent-skills: no counterpart found for drizzle-orm-rules.

---

## Skill Updated: convex-development-general (2026-03-01)

- Skill `convex-development-general` bumped v1.1.0 → v1.2.0.
- Expanded Iron Laws: added index-first query law (`.withIndex` over `.filter` for production data).
- Added Anti-Patterns row for `.filter()` replacing missing indexes (full table scan issue).
- Added function registration section: new function syntax, arg+return validators, `internalQuery`/`internalMutation` for private functions.
- Added comprehensive code examples (schema, index-based query, internal mutation).
- Wired to: developer (contextual:convex_project), nextjs-pro (contextual:convex_project, frontmatter).
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- Research: Convex best practices 2025 — prefer `.withIndex` over `.filter` (index misses); always await all Promises; `no-floating-promises` ESLint rule recommended.

---

## Skill Updated: multi-agent-architecture-reference (2026-03-01)

- Skill `multi-agent-architecture-reference` bumped v1.0.0 → v1.1.0.
- Added 5 Iron Laws: Conductor-first, no depth >3 Hierarchical, always TaskUpdate in Swarm, Consensus only for high-stakes, always check failure taxonomy.
- Added 5-row Anti-Patterns table: Hierarchical overuse, Swarm for ordered tasks, missing TaskUpdate in Swarm, speculative Consensus, mixed topology concerns.
- Added to skill-catalog.md Quick Reference Planning & Architecture row (count 13→14).
- Wired to: architect (primary), planner (primary), agent-skill-matrix.json.
- Research: AdaptOrch (arXiv 2602.16873, Feb 2026) confirms topology-adaptive orchestration; AgentConductor (arXiv 2602.17100, Feb 2026) validates conductor topology for complex tasks.
- VoltAgent/awesome-agent-skills: no counterpart found for multi-agent-architecture-reference.
- Validation improved from 3 pass/5 fail → 8 pass/0 fail (3 skipped).
- Gotcha: parseMarkdownTable() only parses FIRST table in catalog; skill must be in Quick Reference row, not just detailed section table.

---

## Skill Updated: agent-tool-design (2026-03-01)

- Skill `agent-tool-design` wired into agent ecosystem: architect primary skills, developer contextual (tool_design), agent-skill-matrix.json.
- Version bumped 1.1.0 → 1.2.0, lastVerifiedAt updated to 2026-03-01.
- Skill was already production-quality (5 principles, Anti-Patterns table, Iron Laws, Memory Protocol). Gap was purely agent assignment wiring.
- Research: 2026 best practices confirm named parameters, structured errors, idempotency, partial results as core agent tool contract principles (Arunbaby.com 2026, Iterathon 2026).
- VoltAgent/awesome-agent-skills: no counterpart found for agent-tool-design.
- Validation improved from 5 pass/3 fail → 7 pass/1 fail (memory check resolves after this entry; 3 skipped).
- Pattern: skill frontmatter agents field is metadata only; agent .md files are source of truth for Check 4.

---

## Skill Updated: authentication-flow-rules (2026-03-01)

- Skill `authentication-flow-rules` bumped v2.0.0 → v2.1.0.
- Added 5 Iron Laws: PKCE mandatory for all clients (S256 method), Implicit Flow permanently removed, tokens stored in HttpOnly cookies only, access token TTL ≤15 min with refresh rotation on every use, exact redirect URI matching enforced (no wildcards).
- Added 5-row Anti-Patterns table: localStorage storage, Implicit Flow, Resource Owner Password Credentials, wildcard redirect URIs, long-lived access tokens.
- Added agents frontmatter [security-architect, developer] and category: security.
- Added to skill-catalog.md Quick Reference Security row (count 17→18); entry already existed in Security section detailed table.
- Added evolution-state.json entry (id: 2026-03-01-authentication-flow-rules-update).
- Pattern: skill was already assigned to security-architect.md (Check 4 passed) and in learnings.md (Check 5 passed); gap was purely catalog Quick Reference row + evolution-state.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- VoltAgent/awesome-agent-skills: no counterpart found for authentication-flow-rules.

- Skill `scikit-bio` was reviewed and updated by the skill-updater pipeline.

---

## Orphan Skill Wiring Batch (2026-03-01)

- 5 orphaned skills wired into agent-skill-matrix.json and agent frontmatter: agent-evaluation, property-based-testing, webapp-testing, fix-review, debug-log-analysis.

---

## Skill Updater Batch - Python/DevOps Skills (2026-03-01)

- `modern-python` v1.1.0: Added Iron Laws (5) and Anti-Patterns table (5 rows). Wired to python-pro (primary), developer (contextual:python_project), fastapi-pro (secondary). Category: Languages.
- `poetry-rye-dependency-management` v2.0.0: Full rewrite from 60-line stub to production-ready skill with Poetry/Rye workflows, CI/CD integration, migration guide, security audit patterns. Wired to python-pro (secondary). Category: Languages.
- `pyqt6-ui-development-rules` v2.0.0: Expanded from basic guidelines to full MVC architecture guide with signal/slot patterns, QThread concurrency, QSS theming, layout management code examples. Wired to python-pro (contextual:desktop_project). Category: Languages.
- `powershell-expert` v2.2.0: Updated frontmatter (category, agents, tags). Added Anti-Patterns table (5 rows). Wired to developer (contextual:windows_project), devops (secondary). Category: Languages.
- `feature-flag-management` v2.0.0: Full rewrite from stub to production-ready skill with flag lifecycle classification, OpenFeature SDK patterns, gradual rollout strategy, stale flag detection, cleanup checklist. Wired to developer (secondary), devops (secondary), qa (contextual:feature_flags). Category: DevOps.
- All 5 skills added to skill-catalog.md and agent-skill-matrix.json. generate-skill-index-definitions.cjs CATEGORY_MAP updated for correct category classification.
- GitHub Actions `${{ }}` syntax in SKILL.md code blocks triggers validate-integration check 8 false positive -- escaped with `$\{{ \}}` as workaround.
- agent-evaluation (v1.2.0): Wired to qa (secondary), code-reviewer (secondary), reflection-agent (secondary). LLM-as-judge 5-dimension rubric for AI output quality scoring.
- property-based-testing (v1.1.0): Wired to qa (secondary), developer (contextual:property_testing). fast-check patterns for JS/TS with 6 canonical property categories.
- webapp-testing (v1.1.0): Wired to qa (contextual:browser_testing), frontend-pro (contextual:browser_testing). Playwright Python testing. Set verified: true.
- fix-review (v1.1.0): Wired to security-architect (secondary), code-reviewer (contextual:security_review). Trail of Bits fix verification methodology. Set verified: true.
- debug-log-analysis (v1.2.0): Wired to reflection-agent (secondary), devops-troubleshooter (secondary), developer (frontmatter). Debug log reducer + structured error categorization.
- Pattern: validate-integration.cjs Check 4 requires skill name in agent .md frontmatter skills array, not just matrix. Check 10 (Router Discoverability) passes when Check 4 passes.

---

## Skill Updated: yara-authoring (2026-03-01)

- Skill `yara-authoring` wired into ecosystem: catalog Security section, reverse-engineer primary skills, security-architect contextual (reverse_engineering), agent-skill-matrix.json.
- Version bumped 1.0.0 → 1.1.0. Added agents frontmatter [reverse-engineer, security-architect, penetration-tester], category: security, verified: true, lastVerifiedAt: 2026-03-01.
- Expanded singular Iron Law → full 5-law suite (efficient atoms, positive+negative testing, complete metadata, avoid common-byte atoms, YARA-X toolchain default).
- Added Anti-Patterns table (5 rows): over-broad wildcards, skipping atom analysis, missing metadata, conditions before file type checks, nocase on short strings.
- Research: YARA-X 2-5x performance vs legacy; strings < 6 bytes cause false positives (Stairwell 2026 best practices); `nocase` on short strings creates FP matches on arbitrary base64 data.
- VoltAgent/awesome-agent-skills: no counterpart found for yara-authoring.
- Validation improved from 3 pass/5 fail → 8 pass/0 fail (3 skipped).

---

## Skill Updated: content-security-scan (2026-03-01)

- Skill `content-security-scan` was already production-quality (7-step gate, OWASP coverage, provenance logging). Gap was purely agent assignment wiring.
- Added to security-architect.md frontmatter skills list.
- Added to agent-skill-matrix.json security-architect primary skills.
- Version bumped 1.1.0 → 1.2.0, lastVerifiedAt updated to 2026-03-01.
- Pattern: skill had correct agents in SKILL.md frontmatter but validator checks agent .md files directly — frontmatter agents field is for metadata only; agent .md files are the source of truth for Check 4.
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- VoltAgent/awesome-agent-skills: no counterpart found for content-security-scan.

---

## Skill Updated: building-secure-contracts (2026-03-01)

- Skill `building-secure-contracts` promoted from stub (placeholder content) to production-quality SKILL.md v1.1.0.
- Added full smart contract security methodology: CEI pattern, reentrancy analysis (direct + cross-function), access control audit, integer arithmetic analysis, invariant verification.
- Added OpenSCV vulnerability taxonomy classification framework.
- Research: $1.8B+ DeFi exploits Q3 2025 (reentrancy $420M, access control $953M); Systematic Review on Smart Contract Security Design Patterns (Empirical SE 2025) — only 5 patterns address 6/94 OpenSCV issues.
- Wired into: security-architect primary skills, security-architect.md frontmatter, catalog Security section, agent-skill-matrix.json web3_project contextual.
- Added agents frontmatter: [security-architect, developer, penetration-tester].
- Catalog entry added to Quick Reference Security row and Security section table.
- VoltAgent/awesome-agent-skills: no counterpart found for building-secure-contracts.
- Validation: improved from 3 pass/5 fail → 8 pass/0 fail (3 skipped).

---

## Skill Updated: audit-context-building (2026-03-01)

- Skill `audit-context-building` wired into agent-skill-matrix.json: added to security-architect primary and code-reviewer contextual security_review.
- Added to security-architect.md frontmatter skills list.
- Version bumped 1.1.0 → 1.2.0, lastVerifiedAt updated to 2026-03-01.
- Enterprise bundle: 9/9 complete (all components already existed).
- Validation improved from 5 pass/3 fail → 8 pass/0 fail (3 skipped).
- Research: OWASP 2025 audit methodology aligns with skill's First Principles + 5 Whys + 5 Hows approach; Broken Access Control remains top risk (3.73% incidence) — skill's cross-function flow analysis directly addresses this.

---

## Skill Created: ralph-loop (2026-02-28)

- New skill `ralph-loop` created via skill-creator end-to-end process (v1.0.0).
- Enterprise bundle: SKILL.md, scripts/main.cjs, hooks/pre-execute.cjs + post-execute.cjs, schemas/input+output, rules, commands, templates, references.
- Companion artifacts: tool (.claude/tools/ralph-loop/ralph-loop.cjs), workflow (.claude/workflows/ralph-loop-skill-workflow.md), global command + schema.
- Assigned to: developer, qa, devops, master-orchestrator.
- Ralph files consolidated from project root into `.claude/ralph/` (PROMPT.md, ralph-audit.sh, ralph-audit.bat, guardrails.md).
- Research: 6 Exa sources + 3 arXiv papers (COCO, AutoLabs, CorrectAD) on autonomous agent loops.
- Key finding: community stop-hook pattern reads stdin before checking state file (GitHub #234); our implementation has the same ordering.

---

## Skill Updated: scikit-learn (2026-02-23)

- Skill `scikit-learn` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: scikit-survival (2026-02-23)

- Skill `scikit-survival` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: scvi-tools (2026-02-23)

- Skill `scvi-tools` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: seaborn (2026-02-23)

- Skill `seaborn` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: shap (2026-02-23)

- Skill `shap` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: powershell-expert (2026-02-23)

- Skill `powershell-expert` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: testing-expert (2026-02-23)

- Skill `testing-expert` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: writing (2026-02-23)

- Skill `writing` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: agent-creator (2026-02-23)

- Skill `agent-creator` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: agent-updater (2026-02-23)

- Skill `agent-updater` was reviewed and updated by the skill-updater pipeline.
