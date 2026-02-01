# Scaffold Skills → Archive Code Map

This document maps each of the **35 scaffold skills** to relevant code in `.claude.archive/.tmp`. Use it when implementing Phase 2 of the Fix Scaffold Skills plan: pull patterns, logic, or full implementations from these archived codebases.

**Archive root:** `C:\dev\projects\agent-studio\.claude.archive\.tmp` (or `.claude.archive/.tmp` from repo root)

---

## In-repo reuse (commit-validator, repo-rag, project-analyzer, code-analyzer, code-style-validator)

| Skill                    | Archive location                                                                 | What's there                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **commit-validator**     | `everything-claude-code-main/commitlint.config.js`                               | Commitlint conventional config (types, subject-case, header-max-length).                                                                |
|                          | `everything-claude-code-main/rules/git-workflow.md`                              | Conventional commits format, commit message guidance.                                                                                   |
|                          | `claude-flow-main/v3/@claude-flow/shared/src/hooks/safety/git-commit.ts`         | **Full commit hook**: conventional types, validation issues, suggestions, JIRA ticket extraction, co-author. Reusable validation logic. |
|                          | `get-shit-done-main/get-shit-done/references/git-integration.md`                 | Commit formats (initialization, task-completion), types (feat, fix, test, refactor, etc.).                                              |
| **repo-rag**             | `everything-claude-code-main/skills/tdd-workflow/SKILL.md`                       | Semantic search examples, mock embeddings, vector search patterns.                                                                      |
|                          | `everything-claude-code-main/skills/backend-patterns/SKILL.md`                   | `generateEmbedding`, `vectorSearch` patterns.                                                                                           |
|                          | `claude-flow-main/v3/src/memory/infrastructure/SQLiteBackend.ts`                 | `vectorSearch(embedding, k)` implementation.                                                                                            |
| **project-analyzer**     | `Auto-Claude-develop/apps/backend/analysis/analyzers/project_analyzer_module.py` | **Full ProjectAnalyzer**: monorepo detection (pnpm/lerna/nx/turbo/rush), services, infrastructure, conventions, dependencies.           |
|                          | `Auto-Claude-develop/apps/backend/analysis/`                                     | `project_analyzer.py`, `analyzer.py`, detectors (framework, service, database, route, etc.).                                            |
|                          | `everything-claude-code-main/scripts/lib/package-manager.js`                     | `detectFromLockFile`, `detectFromPackageJson`, project dir detection (npm/pnpm/yarn/bun).                                               |
|                          | `claude-flow-main/v2/`                                                           | `tech_stack` detection, migration-analyzer, project type detection in templates.                                                        |
| **code-analyzer**        | `Auto-Claude-develop/apps/backend/analysis/analyzers/`                           | Service/database/framework/route detectors; structure analysis.                                                                         |
|                          | `claude-flow-main/v3/plugins/code-intelligence/`                                 | Code intelligence, MCP tools, output formats (json, graphviz, mermaid).                                                                 |
| **code-style-validator** | `everything-claude-code-main/scripts/hooks/check-console-log.js`                 | Hook that checks for console.log before commit (pattern for lint-style checks).                                                         |
|                          | `everything-claude-code-main/commitlint.config.js`                               | Config-driven validation (can mirror for ESLint/TS).                                                                                    |

---

## Doc/template output (doc-generator, diagram-generator, postmortem, runbook, on-call)

| Skill                          | Archive location                                                    | What's there                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **doc-generator**              | `get-shit-done-main/get-shit-done/templates/codebase/`              | architecture.md, stack.md, structure.md, testing.md, conventions.md — template set for project docs.                                              |
|                                | `get-shit-done-main/get-shit-done/templates/research-project/`      | ARCHITECTURE.md, FEATURES.md, STACK.md, SUMMARY.md — research doc templates.                                                                      |
|                                | `everything-claude-code-main/agents/doc-updater.md`                 | Doc update workflow, architecture diagram expectations.                                                                                           |
| **diagram-generator**          | `everything-claude-code-main/agents/architect.md`                   | Architecture diagram creation steps.                                                                                                              |
|                                | `claude-flow-main/v3/plugins/code-intelligence/`                    | `outputFormat: 'mermaid'`, valid formats json/graphviz/mermaid.                                                                                   |
|                                | `claude-flow-main/v3/plugins/prime-radiant/`                        | Persistence diagram / topology (different domain but diagram generation patterns).                                                                |
| **postmortem-writing**         | `get-shit-done-main/get-shit-done/workflows/`                       | verify-phase, transition, verify-work — structured phase docs; can adapt for timeline/impact/actions.                                             |
|                                | `claude-flow-main/v3/implementation/swarm-plans/DEPLOYMENT-PLAN.md` | Incident issue creation (labels: incident, rollback).                                                                                             |
| **incident-runbook-templates** | `everything-claude-code-main/skills/security-review/`               | cloud-infrastructure-security.md, runbooks created checklist.                                                                                     |
| **on-call-handoff-patterns**   | `get-shit-done-main/get-shit-done/workflows/transition.md`          | `cleanup_handoff` step, handoff checks.                                                                                                           |
|                                | `get-shit-done-main/get-shit-done/references/git-integration.md`    | `<format name="handoff">`.                                                                                                                        |
|                                | `get-shit-done-main/commands/gsd/pause-work.md`                     | Create `.continue-here.md` handoff; collect state for handoff.                                                                                    |
|                                | `claude-flow-main/v3/implementation/hooks/README.md`                | swarm handoff: `initiateHandoff`, `acceptHandoff`, `completeHandoff`, `generateHandoffContext`; CLI `swarm-handoff`, `swarm-accept-handoff`, etc. |

---

## Test/QA (test-generator, tdd)

| Skill              | Archive location                                                         | What's there                                                                                                    |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **test-generator** | `everything-claude-code-main/skills/tdd-workflow/SKILL.md`               | Full `describe`/`it` examples (Semantic Search, Button Component, GET /api/markets).                            |
|                    | `everything-claude-code-main/skills/springboot-tdd/SKILL.md`             | Spring Boot TDD skill.                                                                                          |
|                    | `everything-claude-code-main/skills/project-guidelines-example/SKILL.md` | describe/it for WorkspacePanel.                                                                                 |
|                    | `agent-skills-main/packages/react-best-practices-build/`                 | extract-tests.ts, parser, validate — test extraction/build.                                                     |
| **tdd**            | `get-shit-done-main/get-shit-done/references/tdd.md`                     | **Full TDD reference**: when to use TDD, TDD plan structure, red-green-refactor, success criteria, commit flow. |
|                    | `everything-claude-code-main/skills/tdd-workflow/SKILL.md`               | TDD workflow, runs before commit.                                                                               |
|                    | `get-shit-done-main/get-shit-done/references/verification-patterns.md`   | Verification patterns (complements TDD).                                                                        |

---

## Thinking/workflow (sequential-thinking, progressive-disclosure)

| Skill                      | Archive location                                             | What's there                                                           |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **sequential-thinking**    | `claude-flow-main/v3/implementation/hooks/README.md`         | Hook executor, priority order, context — step/phase execution pattern. |
|                            | `get-shit-done-main/get-shit-done/workflows/`                | execute-plan, verify-phase, discovery-phase — phased step lists.       |
| **progressive-disclosure** | `get-shit-done-main/get-shit-done/references/questioning.md` | Questioning / clarification patterns.                                  |

---

## MCP / external APIs (arxiv, github, jira, linear, slack, sentry)

| Skill                                                   | Archive location                                                                | What's there                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **skill-create (conventional commits / repo analysis)** | `everything-claude-code-main/scripts/skill-create-output.js`                    | **Skill-create UX**: analyze phase (commits, patterns, file co-changes), conventional commit evidence, output formatting. No API calls but commit-pattern analysis. |
| **github**                                              | `Auto-Claude-develop/apps/frontend/src/main/ipc-handlers/github/pr-handlers.ts` | GitHub PR handling (patterns for API usage).                                                                                                                        |
| **handoff / session**                                   | `claude-flow-main/v3/implementation/hooks/README.md`                            | Handoff APIs (see on-call above).                                                                                                                                   |
| **serena**                                              | `serena/`                                                                       | MCP server (`scripts/mcp_server.py`), tools; project context — patterns for MCP/external tooling.                                                                   |

---

## CLI/ops (aws, gcloud, docker-compose, kubernetes-flux, terraform, git-expert)

| Skill                                   | Archive location                                             | What's there                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **package manager / project detection** | `everything-claude-code-main/scripts/lib/package-manager.js` | `detectFromLockFile`, `detectFromPackageJson`, runCmd/execCmd per manager — pattern for spawning CLI by detected tool. |
| **serena**                              | `serena/scripts/`                                            | Python scripts (demo_run_tools, print_tool_overview) — CLI/orchestration patterns.                                     |
| **terraform**                           | `serena/test/solidlsp/terraform/`                            | Terraform LSP tests — confirms terraform context in archive.                                                           |

No full CLI wrappers found for aws/gcloud/docker/kubectl/terraform/git; use archive only for **patterns** (e.g. package-manager.js for “detect then spawn”) and implement thin spawn wrappers in skill scripts.

---

## Creators/converters (skill-creator, agent-creator, mcp-converter, template-renderer)

| Skill                 | Archive location                                             | What's there                                                                                           |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **skill-creator**     | `everything-claude-code-main/scripts/skill-create-output.js` | Full **skill-create** output formatter: analyze phase, patterns, conventional commits, instincts.      |
|                       | `everything-claude-code-main/commands/skill-create.md`       | /skill-create CLI: --commits, --output, --instincts; “Analyze current repo”.                           |
|                       | `everything-claude-code-main/commands/instinct-import.md`    | --from-skill-creator &lt;owner/repo&gt;.                                                               |
| **agent-creator**     | `everything-claude-code-main/agents/`                        | Many .md agents (architect, doc-updater, security-reviewer, etc.) — structure/template for new agents. |
|                       | `get-shit-done-main/agents/`                                 | GSD agents — another agent template set.                                                               |
| **template-renderer** | `get-shit-done-main/get-shit-done/templates/`                | config.json, context.md, milestone.md, phase-prompt.md, etc. — template files with placeholders.       |
|                       | `claude-flow-main/v2/bin/init/templates/`                    | Command/template init patterns.                                                                        |

---

## Other (chrome-browser, debugging, smart-debug, text-to-sql, tool-search)

| Skill                                      | Archive location                                                                  | What's there                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **debugging**                              | `get-shit-done-main/get-shit-done/templates/debug-subagent-prompt.md`, `DEBUG.md` | Debug subagent prompt and debug workflow templates.                                                                                 |
| **tool-search / semantic**                 | `everything-claude-code-main/skills/tdd-workflow/SKILL.md`                        | Mock 1536-dim embedding, semantic search examples.                                                                                  |
|                                            | `everything-claude-code-main/skills/backend-patterns/SKILL.md`                    | generateEmbedding, vectorSearch.                                                                                                    |
| **doc conversion (doc-generator adjunct)** | `markitdown-main/packages/markitdown/`                                            | **Markitdown**: converters for PDF, DOCX, PPTX, XLSX, HTML, etc. → Markdown. Useful for “doc from existing files” in doc-generator. |

---

## Summary table: best bets per skill

| Skill                          | Primary archive source                                                                         | Action                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| commit-validator               | claude-flow v3 `shared/hooks/safety/git-commit.ts` + everything-claude-code commitlint         | Port validation types/rules + suggestions; or keep using repo’s validate-commit.mjs and wire from main.cjs. |
| repo-rag                       | Repo’s .claude/tools/analysis/repo-rag/ + everything-claude-code backend-patterns/tdd-workflow | Already have search.mjs; archive = patterns only.                                                           |
| project-analyzer               | **Auto-Claude-develop** `analysis/analyzers/project_analyzer_module.py` + project_analyzer.py  | Port monorepo/service/infra/conventions logic or call Python from main.cjs; repo already has analyzer.mjs.  |
| code-analyzer                  | Auto-Claude analyzers/ + claude-flow code-intelligence                                         | Port detectors or wrap existing lib.                                                                        |
| doc-generator                  | get-shit-done templates/codebase + research-project                                            | Use as template set; optional: markitdown for file→markdown.                                                |
| diagram-generator              | Repo’s generate.mjs; archive = architect.md + mermaid examples                                 | Wire main.cjs to generate.mjs.                                                                              |
| postmortem / runbook / on-call | get-shit-done workflows + references + claude-flow handoff README                              | Use handoff/phase docs as template source.                                                                  |
| test-generator / tdd           | get-shit-done **references/tdd.md** + everything-claude-code tdd-workflow SKILL                | TDD structure and describe/it examples; implement stub generator from templates.                            |
| sequential-thinking            | get-shit-done workflows (execute-plan, verify-phase)                                           | Step-list output pattern.                                                                                   |
| skill-creator                  | everything-claude-code **skill-create-output.js** + skill-create.md                            | Output formatting and CLI contract; repo has create.cjs/batch-scaffold — delegate from main.cjs.            |
| agent-creator                  | everything-claude-code + get-shit-done agents/\*.md                                            | Copy agent .md structure as template.                                                                       |
| template-renderer              | get-shit-done templates/\*.md + config.json                                                    | Token replacement logic; vars from CLI.                                                                     |
| tool-search                    | Repo’s tool_search.mjs; archive = embedding/vector search examples                             | Wire main.cjs to tool_search.mjs.                                                                           |

---

**Next step:** When implementing each scaffold skill, open the archive paths above first; reuse or port logic into the skill’s `main.cjs` (or call existing repo tools and document archive as reference).
