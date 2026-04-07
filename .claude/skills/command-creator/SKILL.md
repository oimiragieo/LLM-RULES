---
name: command-creator
description: Creates command files for the Claude Code framework. Commands are user-facing shortcuts that delegate to skills.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
args: '--name <command-name> --skill <target-skill> [--description <desc>]'
best_practices:
  - Commands are thin delegation wrappers
  - Always set disable-model-invocation: true
  - Keep command files minimal (YAML frontmatter + one delegation line)
error_handling: graceful
streaming: supported
output_location: .claude/commands/
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
---

# Command Creator

Create command files that delegate to skills. Commands live in `.claude/commands/` and are auto-discovered by Claude Code as `/commandname`.

## Step 0: Check for Existing Command

Before creating, check if command already exists:

```bash
test -f .claude/commands/<command-name>.md && echo "EXISTS" || echo "NEW"
```

If EXISTS → use `Read` to inspect the current command file, then `Edit` to apply changes directly. Run the post-creation integration steps (Step 4) after updating.

If NEW → continue with Step 0.5.

## Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("command", "{command-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

## When to Use

- Creating user-facing shortcuts to skills
- Simplifying complex skill invocations
- Providing memorable command names for common workflows

## Command File Format

All commands use this pattern:

```markdown
---
description: Brief description of what this command does
disable-model-invocation: true
---

Invoke the {skill-name} skill and follow it exactly as presented to you
```

**Example: `/tdd` command**

```markdown
---
description: Test-driven development workflow with Iron Laws
disable-model-invocation: true
---

Invoke the tdd skill and follow it exactly as presented to you
```

## Creation Workflow

### Step 1: Validate Inputs

```javascript
// Validate command name (lowercase, hyphens only)
const commandName = args.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

// Validate target skill exists
const skillExists = await fileExists(`.claude/skills/**/${args.skill}/SKILL.md`);
if (!skillExists) {
  throw new Error(`Target skill not found: ${args.skill}`);
}
```

### Step 2: Create Command File

```javascript
const commandPath = `.claude/commands/${commandName}.md`;
const description = args.description || `Invoke the ${args.skill} skill`;

const content = `---
description: ${description}
disable-model-invocation: true
---

Invoke the ${args.skill} skill and follow it exactly as presented to you
`;

await writeFile(commandPath, content);
```

### Step 3: Update Command Catalog

```javascript
const catalogPath = '.claude/context/artifacts/catalogs/command-catalog.md';
const catalogContent = await readFile(catalogPath, 'utf-8');

// Add entry to catalog
const newEntry = `| /${commandName} | ${description} | ${args.skill} |`;

// Insert alphabetically
```

### Step 4: Run Post-Creation Integration

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

await runIntegrationChecklist('command', commandPath);
await queueCrossCreatorReview('command', commandPath, {
  artifactName: commandName,
  createdBy: 'command-creator',
});
```

## Post-Creation Integration

After command creation, run integration checklist:

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

// 1. Run integration checklist
const result = await runIntegrationChecklist('command', '.claude/commands/<command-name>.md');

// 2. Queue cross-creator review
await queueCrossCreatorReview('command', '.claude/commands/<command-name>.md', {
  artifactName: '<command-name>',
  createdBy: 'command-creator',
});

// 3. Review impact report
// Check result.mustHave for failures - address before marking complete
```

**Integration verification:**

- [ ] Command added to command-catalog.md
- [ ] Target skill exists and is valid
- [ ] Command file has proper YAML frontmatter
- [ ] Command is discoverable via `/commandname`

## Usage Examples

### Create TDD Command

```javascript
Skill({
  skill: 'command-creator',
  args: '--name tdd --skill tdd --description "Test-driven development workflow"',
});
```

### Create Debug Command

```javascript
Skill({
  skill: 'command-creator',
  args: '--name debug --skill debugging --description "Systematic debugging workflow"',
});
```

## Related Skills

- `skill-creator` - Create the skills that commands delegate to
- `skill-updater` - Update the underlying skill a command delegates to

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New command pattern → `.claude/context/memory/learnings.md`
- Command creation issue → `.claude/context/memory/issues.md`
- Delegation decision → `.claude/context/memory/decisions.md`

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
