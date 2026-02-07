# Archived Dead Skills

**Archival Date:** 2026-02-07
**Pipeline:** #16B Skills System Structural Cleanup
**Reason:** Zero invocations (dead code removal)
**Count:** 214 skills archived

## Context

These 214 skills (70.9% of the original 302 skills) were never invoked by any agent, workflow, or command in the Claude Code Enterprise Framework. They were archived to:

- Reduce cognitive overhead for skill discovery
- Improve catalog accuracy
- Focus maintenance efforts on actively used skills
- Preserve history for potential future restoration

## Archival Criteria

Skills were archived if they met ALL of these criteria:

1. **Zero invocations** - Never referenced in `Skill({ skill: "name" })` calls across:
   - Agent files (`.claude/agents/**/*.md`)
   - Workflow files (`.claude/workflows/**/*.md`)
   - Command files (`.claude/commands/**/*.md`)

2. **Zero agent assignments** - Not listed in any agent frontmatter `skills:` arrays

3. **Not core infrastructure** - Not part of the creator/memory/validation toolchain

## Audit Report

Full analysis available at:
`.claude/context/reports/architecture/skills-system-audit-2026-02-07.md`

**Key Findings:**

- **Total skills before cleanup:** 302
- **Active skills after cleanup:** 87
- **Dead skills archived:** 214 (70.9%)
- **Health score improvement:** 62/100 → 85/100 (projected)
- **Catalog accuracy:** 68% → 100%

## Restoration

If a skill is needed in the future, restore with:

```bash
# Restore a specific skill
git mv .claude/skills/_archive/dead/{skill-name} .claude/skills/{skill-name}

# Then register it with the framework
Skill({ skill: "skill-creator", args: "register {skill-name}" })
```

**Post-restoration steps:**

1. Update `.claude/context/artifacts/catalogs/skill-catalog.md`
2. Assign to at least one agent in `.claude/agents/`
3. Add invocation examples to relevant workflows
4. Document in `.claude/context/memory/learnings.md`

## Categories Archived (by Dead Ratio)

| Category | Dead/Total | Dead % | Examples |
|----------|------------|--------|----------|
| Framework Configuration | 26/26 | 100% | babel-configuration, tsconfig-json-rules, form-validation-with-zod |
| Agent Behavior | 11/12 | 92% | assistant-behavior-rules, communication-tone, persona-senior-full-stack-developer |
| Other Specialized | 21/22 | 95% | gamedev-expert (archived but restored on demand), toon-format, use-case-example |
| Project Structure | 7/8 | 88% | folder-structure, directory-naming-convention |
| Code Style & Linting | 15/18 | 83% | comment-usage, dry-principle (archived but restored on demand) |
| DevOps & Infrastructure | 13/19 | 68% | aws-cloud-ops (archived but restored on demand), gcloud-cli, kubernetes-flux (archived but restored on demand) |
| Languages | 11/16 | 69% | angular-expert, astro-expert, elixir-expert, php-expert (archived but restored on demand) |
| Frameworks | 18/26 | 69% | angular-expert, astro-expert, chrome-extension-expert |

## Preserved Skills (87 active)

**Core categories:**

- **Development (10):** tdd, debugging, ripgrep, code-quality-expert, code-analyzer, code-semantic-search, code-structural-search, code-style-validator, etc.
- **Planning & Architecture (6):** plan-generator, architecture-review, complexity-assessment, diagram-generator, etc.
- **Security (6):** security-architect, auth-security-expert, binary-analysis-patterns, memory-forensics, protocol-reverse-engineering
- **Creator Tools (11):** research-synthesis, agent-creator, skill-creator, hook-creator, workflow-creator, template-creator, schema-creator, etc.
- **Memory & Context (9):** context-compressor, session-handoff, task-management-protocol, operational-modes, etc.

**See full catalog:** `.claude/context/artifacts/catalogs/skill-catalog.md`

## Related Documentation

- **ADR-099:** Dead skills archival decision (2026-02-07)
- **Pipeline #16B:** Skills System Structural Cleanup
- **Architect Audit:** skills-system-audit-2026-02-07.md
- **File Placement:** `.claude/docs/FILE_PLACEMENT_RULES.md` (archive pattern)

---

**Provenance:** Pipeline #16B | Task #124 | Agent: developer | Date: 2026-02-07
