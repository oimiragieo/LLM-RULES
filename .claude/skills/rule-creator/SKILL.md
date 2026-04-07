---
name: rule-creator
description: Creates rule files for the Claude Code framework. Rules are markdown files in .claude/rules/ that are auto-loaded by Claude Code.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
args: '--name <rule-name> --content <rule-content> [--category <category>]'
best_practices:
  - Rules are concise guidelines (not detailed workflows)
  - Use markdown formatting for clarity
  - Group related rules into sections
  - Keep rules under 50 lines unless detailed guidance needed
error_handling: graceful
streaming: supported
output_location: .claude/rules/
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
---

# Rule Creator

Create rule files in `.claude/rules/`. Rules are auto-discovered by Claude Code and loaded into agent context.

## Step 0: Check for Existing Rule

Before creating, check if rule already exists:

```bash
test -f .claude/rules/<rule-name>.md && echo "EXISTS" || echo "NEW"
```

If EXISTS → use `Read` to inspect the current rule file, then `Edit` to apply changes directly. Run the post-creation integration steps (Step 4) after updating.

If NEW → continue with Step 0.5.

## Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("rule", "{rule-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

## When to Use

- Creating project-specific coding guidelines
- Documenting framework conventions
- Establishing team standards
- Defining workflow protocols

## Rule File Format

Rules are simple markdown files:

```markdown
# Rule Name

## Section 1

- Guideline 1
- Guideline 2

## Section 2

- Guideline 3
- Guideline 4
```

**Example: testing.md**

```markdown
# Testing

## Test-Driven Development

- Use TDD for new features and bug fixes (Red-Green-Refactor cycle)
- Write failing test first, then minimal code to pass, then refactor
- Never write production code without a failing test first

## Test Organization

- Add unit tests for utilities and business logic
- Add integration tests for API boundaries
- Keep tests deterministic and isolated (no shared state)
- Place test files in `tests/` directory mirroring source structure
```

## Creation Workflow

### Step 1: Validate Inputs

```javascript
// Validate rule name (lowercase, hyphens only)
const ruleName = args.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

// Validate content is not empty
if (!args.content || args.content.trim().length === 0) {
  throw new Error('Rule content cannot be empty');
}
```

### Step 2: Create Rule File

```javascript
const rulePath = `.claude/rules/${ruleName}.md`;

// Format content as markdown
const content = args.content.startsWith('#')
  ? args.content
  : `# ${ruleName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n${args.content}`;

await writeFile(rulePath, content);
```

### Mandatory: Register in index

```bash
pnpm index-rules
```

Verify `total_rules` count increased. Rule is invisible to agents until indexed.

### Step 3: Verify Auto-Discovery

Rules in `.claude/rules/` are automatically loaded by Claude Code. No manual registration needed.

```javascript
// Verify file was created
const fileExists = await exists(rulePath);
if (!fileExists) {
  throw new Error('Rule file creation failed');
}
```

### Step 4: Run Post-Creation Integration

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

await runIntegrationChecklist('rule', rulePath);
await queueCrossCreatorReview('rule', rulePath, {
  artifactName: ruleName,
  createdBy: 'rule-creator',
});
```

## Post-Creation Integration

After rule creation, run integration checklist:

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

// 1. Run integration checklist
const result = await runIntegrationChecklist('rule', '.claude/rules/<rule-name>.md');

// 2. Queue cross-creator review
await queueCrossCreatorReview('rule', '.claude/rules/<rule-name>.md', {
  artifactName: '<rule-name>',
  createdBy: 'rule-creator',
});

// 3. Review impact report
// Check result.mustHave for failures - address before marking complete
```

**Integration verification:**

- [ ] Rule file created in `.claude/rules/`
- [ ] Rule is auto-discovered by Claude Code
- [ ] Rule content is clear and actionable
- [ ] No conflicts with existing rules

## Usage Examples

### Create Code Standards Rule

```javascript
Skill({
  skill: 'rule-creator',
  args: `--name code-standards --content "# Code Standards

## Organization
- Prefer small, cohesive files over large ones
- Keep interfaces narrow; separate concerns by feature

## Style
- Favor immutability; avoid in-place mutation
- Validate inputs and handle errors explicitly"`,
});
```

### Create Git Workflow Rule

```javascript
Skill({
  skill: 'rule-creator',
  args: `--name git-workflow --content "# Git Workflow

## Commit Guidelines
- Keep changes scoped and reviewable
- Use conventional commits: feat:, fix:, refactor:, docs:, chore:

## Branch Workflow
- Create feature branches from main
- Never force-push to main/master"`,
});
```

## Related Skills

- `skill-creator` - Create detailed workflows (for complex guidance needing a full SKILL.md)
- `hook-creator` - Create enforcement hooks that accompany governance rules

## Iron Laws

1. **Every artifact MUST have a companion schema** — Rules without a schema have no contract for structured validation. Create a JSON schema in `.claude/schemas/` if the rule produces structured output or has configurable parameters.
2. **Every artifact MUST be wired to at least one agent** — A rule not referenced by any agent or skill is orphaned. Verify the rule is relevant to at least one agent's context (rules in `.claude/rules/` are auto-loaded, but domain-specific rules should be referenced in agent prompts).
3. **Every artifact MUST be indexed in its catalog** — Rules not tracked in the catalog are hard to discover and audit. Add an entry or verify presence in the appropriate catalog.
4. **Every artifact MUST pass integration validation** — Run `node .claude/tools/cli/validate-integration.cjs <rule-path>` before marking creation complete. A rule that fails validation may have broken references or conflicts.
5. **Every artifact MUST record a memory entry** — Write the rule creation pattern, decisions, and any issues to `.claude/context/memory/` (learnings.md, decisions.md, issues.md). Without memory, the creation is invisible to future sessions.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New rule pattern → `.claude/context/memory/learnings.md`
- Rule creation issue → `.claude/context/memory/issues.md`
- Guideline decision → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. When research uncovers gaps, trigger the appropriate companion creator:

| Gap Discovered                           | Required Artifact | Creator to Invoke                      | When                              |
| ---------------------------------------- | ----------------- | -------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | `Skill({ skill: 'skill-creator' })`    | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | `Skill({ skill: 'skill-updater' })`    | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | `Skill({ skill: 'agent-creator' })`    | Agent to own the capability       |
| Existing agent needs capability update   | agent update      | `Skill({ skill: 'agent-updater' })`    | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | `Skill({ skill: 'template-creator' })` | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | `Skill({ skill: 'hook-creator' })`     | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | `Skill({ skill: 'workflow-creator' })` | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | `Skill({ skill: 'schema-creator' })`   | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | `Skill({ skill: 'command-creator' })`  | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | `Skill({ skill: 'tool-creator' })`     | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only     | Too specific to generalize        |

---

## Ecosystem Alignment Contract (MANDATORY)

This creator skill is part of a coordinated creator ecosystem. Any artifact created here must align with and validate against related creators:

- `agent-creator` for ownership and execution paths
- `skill-creator` for capability packaging and assignment
- `tool-creator` for executable automation surfaces
- `hook-creator` for enforcement and guardrails
- `rule-creator` and `semgrep-rule-creator` for policy and static checks
- `template-creator` for standardized scaffolds
- `workflow-creator` for orchestration and phase gating
- `command-creator` for user/operator command UX

### Cross-Creator Handshake (Required)

Before completion, verify all relevant handshakes:

1. Artifact route exists in `.claude/CLAUDE.md` and related routing docs.
2. Discovery/registry entries are updated (catalog/index/registry as applicable).
3. Companion artifacts are created or explicitly waived with reason.
4. `validate-integration.cjs` passes for the created artifact.
5. Skill index is regenerated when skill metadata changes.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new patterns, templates, or workflows, research is mandatory:

1. Use Exa for implementation and ecosystem patterns:
   - `mcp__Exa__web_search_exa({ query: '<topic> 2025 best practices' })`
   - `mcp__Exa__get_code_context_exa({ query: '<topic> implementation examples' })`
2. Search arXiv for academic research (mandatory for AI/ML, agents, evaluation, orchestration, memory/RAG, security):
   - Via Exa: `mcp__Exa__web_search_exa({ query: 'site:arxiv.org <topic> 2024 2025' })`
   - Direct API: `WebFetch({ url: 'https://arxiv.org/search/?query=<topic>&searchtype=all&start=0' })`
3. Record decisions, constraints, and non-goals in artifact references/docs.
4. Keep updates minimal and avoid overengineering.

**arXiv is mandatory (not fallback) when topic involves:** AI agents, LLM evaluation, orchestration, memory/RAG, security, static analysis, or any emerging methodology.

### Regression-Safe Delivery

- Follow strict RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for changed modules.
- Run lint/format on changed files.
- Keep commits scoped by concern (logic/docs/generated artifacts).
