# .claude/tools/ Directory

This directory contains CLI-executable tools and utilities for the agent-studio framework.

**Boundary Rule:** Tools here are CLI scripts meant to be executed directly. Library modules (imported via `require()` or `import`) belong in `.claude/lib/`, not here.

**Total Active Tools:** 66 source files across 13 subdirectories

---

## Quick Reference

| Category       | Count  | Description                                                                               |
| -------------- | ------ | ----------------------------------------------------------------------------------------- |
| CLI Validators | 3      | Validation utilities (doctor, validate-agents, security-lint)                             |
| CLI Utilities  | 4      | General CLI tools (detect-orphans, validate-commit, tool_search, git-notes-verify)        |
| Analysis       | 4 dirs | Code and project analysis (project-analyzer, ecosystem-assessor, find-polluter, repo-rag) |
| Integrations   | 4 dirs | External services (aws, github, kubernetes, mcp-converter)                                |
| Optimization   | 2 dirs | Performance (token-optimizer, sequential-thinking)                                        |
| Runtime        | 1 dir  | Observability and monitoring                                                              |
| Visualization  | 1 dir  | Diagram generation                                                                        |
| Workflow       | 2      | Workflow tracking and validation                                                          |
| Context        | 1      | Context cleanup                                                                           |
| Gates          | 1      | Framework integration testing                                                             |
| Root-level     | 4      | Standalone utilities                                                                      |

**Complete Inventory:** See `.claude/context/artifacts/catalogs/tool-catalog.md`

---

## Directory Structure

```
.claude/tools/
├── _archive/          # Archived dead tools (25 tools)
├── cli/               # CLI validators and utilities
├── analysis/          # Code and project analysis
├── integrations/      # External service connectors
├── optimization/      # Performance tools
├── runtime/           # Runtime observability
├── visualization/     # Diagram and graph generation
├── workflow/          # Workflow execution
├── context/           # Context management
├── gates/             # Quality gates
└── *.mjs              # Root-level standalone utilities
```

---

## Active Tools by Category

### CLI Validators

Stand-alone validation utilities:

| Tool                  | Purpose                         | Usage                  |
| --------------------- | ------------------------------- | ---------------------- |
| `doctor.mjs`          | System health diagnostics       | `pnpm doctor`          |
| `validate-agents.mjs` | Validate agent definitions      | `pnpm validate:agents` |
| `security-lint.cjs`   | Security vulnerability scanning | `pnpm lint:security`   |

### CLI Utilities

General-purpose command-line tools:

| Tool                   | Purpose                        | Usage                                         |
| ---------------------- | ------------------------------ | --------------------------------------------- |
| `detect-orphans.mjs`   | Find orphaned files/references | `node .claude/tools/cli/detect-orphans.mjs`   |
| `validate-commit.mjs`  | Validate commit messages       | skill: `commit-validator`                     |
| `tool_search.mjs`      | Search for tools by capability | `node .claude/tools/cli/tool_search.mjs`      |
| `git-notes-verify.cjs` | Audit trail verification       | `node .claude/tools/cli/git-notes-verify.cjs` |

### Analysis

Code analysis, dependency scanning, project assessment:

| Directory             | Purpose                                         | Usage                                                  |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `project-analyzer/`   | Analyze project structure and tech stack        | skill: `code-analyzer`                                 |
| `ecosystem-assessor/` | Assess ecosystem health (hooks, MCPs)           | `node .claude/tools/analysis/ecosystem-assessor/*.mjs` |
| `find-polluter/`      | Find test pollution sources                     | skill: `debugging`                                     |
| `repo-rag/`           | Repository RAG (retrieval-augmented generation) | `node .claude/tools/analysis/repo-rag/*.py`            |

### Integrations

External service integrations:

| Directory          | Purpose                       | Integration         |
| ------------------ | ----------------------------- | ------------------- |
| `aws-cloud-ops/`   | AWS cloud operations          | AWS CLI, boto3      |
| `github/`          | GitHub API integration        | skill: `github-mcp` |
| `kubernetes-flux/` | Kubernetes Flux integration   | kubectl, flux CLI   |
| `mcp-converter/`   | MCP server to skill converter | Python MCP SDK      |

### Optimization

Performance and resource optimization:

| Directory              | Purpose                          | Technology |
| ---------------------- | -------------------------------- | ---------- |
| `token-optimizer/`     | Monitor and optimize token usage | Node.js    |
| `sequential-thinking/` | Step-by-step reasoning helper    | Python     |

### Runtime

Runtime coordination and monitoring:

| Directory        | Purpose                       | Usage         |
| ---------------- | ----------------------------- | ------------- |
| `observability/` | Runtime status and monitoring | Not yet wired |

### Visualization

Diagram and graph generation:

| Directory            | Purpose                        | Usage                         |
| -------------------- | ------------------------------ | ----------------------------- |
| `diagram-generator/` | Generate architecture diagrams | skill: architecture workflows |

### Workflow

Workflow execution, gates, and handlers:

| Tool                           | Purpose                       | Usage         |
| ------------------------------ | ----------------------------- | ------------- |
| `workflow-context-tracker.mjs` | Track workflow context        | Not yet wired |
| `workflow-validator.mjs`       | Validate workflow definitions | Not yet wired |

### Context

Context management and resolution:

| Tool                  | Purpose                | Usage                                            |
| --------------------- | ---------------------- | ------------------------------------------------ |
| `context-cleanup.cjs` | Clean up context files | `node .claude/tools/context/context-cleanup.cjs` |

### Gates

Quality and validation gates:

| Tool                                           | Purpose                        | Usage                                 |
| ---------------------------------------------- | ------------------------------ | ------------------------------------- |
| `run-agent-framework-integration-headless.mjs` | Headless agent framework tests | `pnpm validate:framework-integration` |

### Root-Level Utilities

Standalone utilities at tools root:

| Tool                                        | Purpose                        | Usage                              |
| ------------------------------------------- | ------------------------------ | ---------------------------------- |
| `cuj-validator-unified.mjs`                 | Unified CUJ validation         | `pnpm validate:cujs`               |
| `validate-commands.mjs`                     | Validate command definitions   | `pnpm validate:commands`           |
| `validate-latest-integration-artifacts.mjs` | Validate integration artifacts | `pnpm validate:latest-integration` |

---

## Recently Relocated to lib/

**Date:** 2026-02-07 (Phase C of tools overhaul)
**Reason:** Library modules (imported, not executed) belong in `.claude/lib/`, not `.claude/tools/`

| Module                      | Old Location      | New Location        |
| --------------------------- | ----------------- | ------------------- |
| `skills-core.js`            | `tools/runtime/`  | `lib/skills/`       |
| `swarm-coordination.cjs`    | `tools/runtime/`  | `lib/coordination/` |
| `context-path-resolver.mjs` | `tools/context/`  | `lib/utils/`        |
| `gate.mjs`                  | `tools/gates/`    | `lib/qa/`           |
| `decision-handler.mjs`      | `tools/workflow/` | `lib/workflow/`     |
| `loop-handler.mjs`          | `tools/workflow/` | `lib/workflow/`     |
| `workflow-runner.js`        | `tools/workflow/` | `lib/workflow/`     |

**If you're looking for these modules:** Check `.claude/lib/<category>/` instead.

**Security Note:** `decision-handler.mjs` was patched during relocation to replace `new Function()` with SafeExpressionParser (SEC-TOOL-001 fix).

---

## Archived Tools

**Location:** `.claude/tools/_archive/`
**Total:** 25 archived tools
**Reason:** Dead tools with zero references in codebase
**Archive Date:** 2026-02-07

Archived tools include:

- One-time migration tools (conductor-state-migrate, fix-spawn-log-task-ids, migrate-agent-config, migrate-memory)
- Duplicate CLI utilities (archive-memory, compact-lancedb, detect-orphans, tool_search)
- Unused ESLint fix utilities (eslint-batch-fix, eslint-unused-var-fix, eslint-useless-escape-fix)
- Zero-reference analysis tools (document-query, kb-search, cost-report)
- Unused monitoring tools (monitoring-dashboard)
- Orphaned validation tools (validate-agent, validate-agent-routing, validate-agent-tools)

**Restoration:** If you need an archived tool, see `.claude/tools/_archive/README.md` for instructions.

**Preservation:** All archived tools were moved via `git mv` to preserve full git history.

---

## Usage

### Execute Directly

Most tools can be executed directly with Node.js:

```bash
# CLI validators
pnpm doctor
pnpm validate:agents
pnpm lint:security

# Direct execution
node .claude/tools/cli/detect-orphans.mjs
node .claude/tools/analysis/project-analyzer/analyzer.mjs
```

### Via Skills

Some tools are wrapped by skills for agent invocation:

```javascript
// Code analysis
Skill({ skill: 'code-analyzer' }); // -> analysis/project-analyzer/

// Commit validation
Skill({ skill: 'commit-validator' }); // -> cli/validate-commit.mjs

// Debugging
Skill({ skill: 'debugging' }); // references -> analysis/find-polluter/

// GitHub operations
Skill({ skill: 'github-mcp' }); // -> integrations/github/
```

### Via Package.json Scripts

Check available scripts:

```bash
pnpm run
```

Key scripts:

- `pnpm doctor` - System diagnostics
- `pnpm validate:agents` - Validate agent definitions
- `pnpm lint:security` - Security scanning
- `pnpm validate:framework-integration` - Framework integration tests
- `pnpm validate:cujs` - Critical user journey validation
- `pnpm validate:commands` - Command definition validation

---

## Adding New Tools

When adding new tools:

1. **Placement:** Choose the appropriate category subdirectory
2. **Catalog:** Update `.claude/context/artifacts/catalogs/tool-catalog.md`
3. **README:** Add entry to this README's category tables
4. **package.json:** If CLI-invokable, add a script
5. **Skill:** If skill-backed, reference in the skill's SKILL.md
6. **Tests:** Add tests alongside the tool when applicable

**Boundary Check:** If your tool is imported via `require()` or `import` by other code, it belongs in `.claude/lib/`, not here.

---

## Related Documentation

- **Complete Tool Catalog:** `.claude/context/artifacts/catalogs/tool-catalog.md` - Full inventory with wiring status
- **Archive README:** `.claude/tools/_archive/README.md` - Details on archived tools
- **Directory Structure:** `.claude/docs/@DIRECTORY_STRUCTURE.md` - Framework-wide layout
- **ADR-089:** `.claude/context/memory/decisions.md` - Decision rationale for tools overhaul
- **Security Review:** `.claude/context/reports/security/tools-system-security-review-2026-02-07.md` - Security findings

---

## Maintenance Notes

**Phase A (Complete):** Deleted 3 stubs, cleaned **pycache**, fixed 12 phantom package.json scripts
**Phase B (Complete):** Archived 25 dead tools to \_archive/
**Phase C (Complete):** Relocated 8 library modules to lib/, fixed SEC-TOOL-001
**Phase D (In Progress):** Documentation updates (this file)

**Next:** QA validation, lint, commit, push
