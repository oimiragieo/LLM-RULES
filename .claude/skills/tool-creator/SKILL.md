---
name: tool-creator
description: Creates tool files for the Claude Code framework. Tools are executable utilities organized by category in .claude/tools/.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash]
args: '--name <tool-name> --category <category> --implementation <code>'
best_practices:
  - Tools are CLI-executable scripts (.cjs or .mjs)
  - Keep tools focused (single responsibility)
  - Add help text and usage examples
  - Include error handling
error_handling: graceful
streaming: supported
output_location: .claude/tools/
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
source: builtin
trust_score: 100
provenance_sha: ae79e0adf62bacae
---

# Tool Creator

Create executable tool files in `.claude/tools/<category>/`. Tools are organized into categories like `cli`, `analysis`, `validation`, `integrations`, etc.

## Step 0: Check for Existing Tool

Before creating, check if tool already exists:

```bash
find .claude/tools/ -name "<tool-name>.*" -type f
```

If EXISTS → use `Read` to inspect the current tool file, then `Edit` to apply changes directly. Run the post-creation integration steps (Step 4) after updating.

If NEW → continue with Step 0.1.

## Step 0.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'tool',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `tool-updater` skill instead: `Skill({ skill: 'tool-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to next step.

**Override**: If user explicitly passes `--force`, skip this check entirely.

---

## Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("tool", "{tool-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

## When to Use

- Creating reusable command-line utilities
- Building analysis or validation scripts
- Implementing framework automation tools
- Adding workflow integration utilities

## Tool File Format

Tools are CommonJS or ESM modules with:

```javascript
#!/usr/bin/env node
/**
 * Tool Name - Brief description
 *
 * Usage:
 *   node .claude/tools/<category>/<tool-name>.cjs [options]
 *
 * Options:
 *   --help     Show help
 *   --option   Description
 */

const main = async () => {
  // Tool implementation
};

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
```

## Tool Categories

| Category        | Purpose                      | Examples                    |
| --------------- | ---------------------------- | --------------------------- |
| `cli`           | Command-line utilities       | validators, formatters      |
| `analysis`      | Code analysis tools          | complexity, dependencies    |
| `validation`    | Validation scripts           | schema, lint                |
| `integrations`  | External integration tools   | API clients, webhooks       |
| `maintenance`   | Framework maintenance        | cleanup, migration          |
| `optimization`  | Performance optimization     | indexing, caching           |
| `runtime`       | Runtime utilities            | config readers, loaders     |
| `visualization` | Diagram and graph generation | mermaid, graphviz           |
| `workflow`      | Workflow automation          | task runners, orchestrators |
| `gates`         | Quality gates and checks     | coverage, security          |
| `context`       | Context management           | compression, handoff        |

## Creation Workflow

### Step 1: Validate Inputs

```javascript
// Validate tool name (lowercase, hyphens, no spaces)
const toolName = args.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

// Validate category exists
const validCategories = [
  'cli',
  'analysis',
  'validation',
  'integrations',
  'maintenance',
  'optimization',
  'runtime',
  'visualization',
  'workflow',
  'gates',
  'context',
];

if (!validCategories.includes(args.category)) {
  throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
}
```

### Step 2: Create Tool File

```javascript
const toolPath = `.claude/tools/${args.category}/${toolName}.cjs`;

// Create tool directory if it doesn't exist
await mkdir(`.claude/tools/${args.category}`, { recursive: true });

// Generate tool content
const content = `#!/usr/bin/env node
/**
 * ${toolName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${args.description || 'Tool description'}
 *
 * Usage:
 *   node .claude/tools/${args.category}/${toolName}.cjs [options]
 *
 * Options:
 *   --help     Show this help message
 */

${args.implementation}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
`;

await writeFile(toolPath, content);

// Make executable (Unix-like systems)
if (process.platform !== 'win32') {
  await chmod(toolPath, '755');
}
```

### Step 3: Update Tool Catalog

```javascript
const catalogPath = '.claude/context/artifacts/catalogs/tool-catalog.md';

// Add entry to catalog under appropriate category
const newEntry = `| ${toolName} | ${args.description} | .claude/tools/${args.category}/${toolName}.cjs | active |`;

// Insert into catalog preserving category structure
```

### Step 4: Run Post-Creation Integration

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

await runIntegrationChecklist('tool', toolPath);
await queueCrossCreatorReview('tool', toolPath, {
  artifactName: toolName,
  createdBy: 'tool-creator',
  category: args.category,
});
```

## Post-Creation Integration

After tool creation, run integration checklist:

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

// 1. Run integration checklist
const result = await runIntegrationChecklist('tool', '.claude/tools/<category>/<tool-name>.cjs');

// 2. Queue cross-creator review
await queueCrossCreatorReview('tool', '.claude/tools/<category>/<tool-name>.cjs', {
  artifactName: '<tool-name>',
  createdBy: 'tool-creator',
  category: '<category>',
});

// 3. Review impact report
// Check result.mustHave for failures - address before marking complete
```

**Integration verification:**

- [ ] Tool added to tool-catalog.md under correct category
- [ ] Tool file is executable (Unix) or runnable (Windows)
- [ ] Tool has help text and usage examples
- [ ] Tool passes basic smoke test

## Usage Examples

### Create Validation Tool

```javascript
Skill({
  skill: 'tool-creator',
  args: `--name schema-validator --category validation --implementation "
const validateSchema = async () => {
  console.log('Validating schema...');
};

const main = async () => {
  await validateSchema();
};
"`,
});
```

### Create Analysis Tool

```javascript
Skill({
  skill: 'tool-creator',
  args: `--name complexity-analyzer --category analysis --implementation "
const analyzeComplexity = async (filePath) => {
  console.log('Analyzing complexity for:', filePath);
};

const main = async () => {
  const [,, filePath] = process.argv;
  await analyzeComplexity(filePath);
};
"`,
});
```

## Related Skills

- `skill-creator` - Create skills that invoke tools
- `hook-creator` - Create pre/post hooks that wrap tool execution

## Iron Laws

1. **Every artifact MUST have a companion schema** — Tools without a schema have no contract; consumers cannot validate inputs/outputs. Create a JSON schema in `.claude/schemas/` for the tool's CLI interface.
2. **Every artifact MUST be wired to at least one agent** — A tool not assigned to any agent is never invoked. Assign the tool to relevant agents via their `tools:` frontmatter array.
3. **Every artifact MUST be indexed in its catalog** — Tools not in `tool-catalog.md` are invisible to discovery. Add an entry to `.claude/context/artifacts/catalogs/tool-catalog.md` under the correct category.
4. **Every artifact MUST pass integration validation** — Run `node .claude/tools/cli/validate-integration.cjs <tool-path>` before marking creation complete. A tool that fails validation has broken references.
5. **Every artifact MUST record a memory entry** — Write the tool creation pattern, decisions, and any issues to `.claude/context/memory/` (learnings.md, decisions.md, issues.md). Without memory, the creation is invisible to future sessions.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New tool pattern → `.claude/context/memory/learnings.md`
- Tool creation issue → `.claude/context/memory/issues.md`
- Category decision → `.claude/context/memory/decisions.md`

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

## Optional: Evaluation Quality Gate

Run the shared evaluation framework to verify tool quality:

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs --skill tool-creator
```

Grader assertions for tool artifacts:

- **`--help` response**: Tool responds to `--help` (or `-h`) with a usage summary including required/optional arguments and at least one example invocation
- **`shell: false` for child processes**: Any `child_process.spawn` or `execFile` call uses `shell: false` with array arguments (never `shell: true` per SE-security rules)
- **Graceful missing input handling**: Tool exits with a non-zero code and a human-readable error message when required arguments are absent; no unhandled exceptions or crash dumps
- **Catalog entry present**: Tool is registered in `.claude/context/artifacts/catalogs/tool-catalog.md` with category, description, and wiring status
- **Timeout safety**: Long-running operations have explicit timeouts; no infinite loops on missing input

See `.claude/skills/skill-creator/EVAL_WORKFLOW.md` for full evaluation protocol and grader/analyzer agent usage.
