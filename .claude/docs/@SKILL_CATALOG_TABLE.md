# Workflow Enhancement Skills

**Source:** CLAUDE.md Section 8.5
**Version:** v2.2.1
**Last Updated:** 2026-02-15

---

## PURPOSE

Catalog of active workflow-enhancement skills available via `Skill()` tool for improving agent workflows, testing, research, and development processes. Includes hybrid search integration (`code-semantic-search`, `code-structural-search`, `ripgrep`) across core/specialized/domain agents. Archived skills live under `.claude/skills/_archive/dead/`.

---

## CONTENT

| Skill                                | When to Use                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `project-onboarding`                 | unfamiliar codebase                                                                    |
| `thinking-tools`                     | self-reflection at critical phases                                                     |
| `summarize-changes`                  | after non-trivial coding                                                               |
| `session-handoff`                    | before ending long sessions                                                            |
| `interactive-requirements-gathering` | structured user input                                                                  |
| `artifact-lifecycle`                 | manage artifact updates/deprecation                                                    |
| `workflow-creator`                   | create multi-agent workflows                                                           |
| `agent-updater`                      | refresh existing agents with risk-scored diffs                                         |
| `skill-updater`                      | refresh existing skills with research + TDD gates                                      |
| `workflow-updater`                   | refresh existing workflows with gate/idempotency checks                                |
| `memory-quality-auditor`             | audit memory retrieval quality and groundedness                                        |
| `eval-harness-updater`               | refresh live/fallback eval harness reliability                                         |
| `troubleshooting-regression`         | debug-log-first regression diagnosis and validation                                    |
| `template-creator`                   | create templates                                                                       |
| `schema-creator`                     | create JSON schemas                                                                    |
| `hook-creator`                       | create safety/validation hooks                                                         |
| `spec-init`                          | unified spec creation (progressive disclosure)                                         |
| `spec-gathering`                     | start new features                                                                     |
| `complexity-assessment`              | analyze complexity                                                                     |
| `insight-extraction`                 | capture learnings                                                                      |
| `ripgrep`                            | enhanced search for .mjs/.cjs/.mts/.cts                                                |
| `code-semantic-search`               | semantic code search (hybrid: vectors + BM25)                                          |
| `code-structural-search`             | AST-based pattern matching (ast-grep)                                                  |
| `chrome-browser`                     | browser automation/testing                                                             |
| `arxiv-mcp`                          | arXiv search/retrieve                                                                  |
| `checklist-generator`                | quality checklists (IEEE + contextual)                                                 |
| `template-renderer`                  | render templates with token replacement                                                |
| `tdd`                                | test-driven development workflow                                                       |
| `debugging`                          | systematic debugging approach                                                          |
| `git-expert`                         | token-efficient git operations                                                         |
| `security-architect`                 | OWASP Top 10, threat modeling                                                          |
| `context-compressor`                 | reduce token usage while preserving context                                            |
| `verification-before-completion`     | evidence-based completion gates                                                        |
| `code-analyzer`                      | static code analysis and metrics                                                       |
| `code-quality-expert`                | clean code, style guides, refactoring                                                  |
| `code-style-validator`               | programmatic style validation (AST-based)                                              |
| `agent-evaluation`                   | LLM-as-judge 5-dimension rubric for agent output quality                               |
| `context-degradation`                | token severity zones, early-warning indicators, corrective routing                     |
| `property-based-testing`             | fast-check patterns for JS/TS, 6 canonical property categories                         |
| `multi-agent-architecture-reference` | 6-topology decision matrix with token economics and failure modes                      |
| `agent-tool-design`                  | Agent Tool Contract: 5 principles and anti-pattern table                               |
| `sharp-edges`                        | catalogue of confirmed SE-01–SE-07 hazards (paths, prototype pollution, ReDoS, etc.)   |
| `debug-log-analysis`                 | structured debug log workflow: copy, reduce, categorize, cross-reference, report       |
| `enhance-prompt`                     | transform vague UI/feature requests into structured specs with design system awareness |
| `next-upgrade`                       | 9-step Next.js version migration workflow with codemod automation (13→14→15→16)        |
| `vercel-deploy`                      | zero-auth Vercel deployment with framework auto-detection for 20+ frameworks           |
| `shadcn-ui`                          | shadcn/ui: Tailwind CSS v4, Radix UI, dark mode, Next.js App Router setup              |
| `web-perf`                           | 5-phase Core Web Vitals audit: LCP, CLS, INP thresholds and Chrome DevTools            |
| `next-cache-components`              | Next.js 16 `'use cache'` directive, `cacheLife()`, `cacheTag()`, PPR patterns          |

### Skill Discovery

**Skill Catalog Location:** `.claude/context/artifacts/catalogs/skill-catalog.md`

**Discovery Process:**

1. Read catalog
2. Search by category or keyword
3. Invoke with: `Skill({ skill: "<skill-name>" })`

### Invocation Pattern

```javascript
// CORRECT: Use Skill() tool
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });

// WRONG: Reading skill files does NOT invoke them
Read('.claude/skills/tdd/SKILL.md');
```

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Creator skills (agent-creator, skill-creator, etc.)
- **@ENTERPRISE_WORKFLOWS.md** - Enterprise workflow paths
- **CLAUDE.md Section 7** - Skill Invocation Protocol

---

## BACK TO MAIN

See **CLAUDE.md** Section 8.5 for inline summary.
