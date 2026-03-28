# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.

## Reference Skill

**Use `.claude/skills/tdd/SKILL.md` as the canonical reference skill.**

Before finalizing any skill, compare against tdd structure:

- [ ] Has all sections tdd has (Overview, When to Use, Iron Law, etc.)
- [ ] YAML frontmatter is complete (name, description, version, model, invoked_by, user_invocable, tools)
- [ ] Has Memory Protocol section (MANDATORY)
- [ ] Has proper invocation examples
- [ ] Has best_practices in frontmatter
- [ ] Has error_handling field

**Quick Comparison:**

```bash
# Compare your skill structure against tdd
diff <(grep "^## " .claude/skills/tdd/SKILL.md) <(grep "^## " .claude/skills/{skill-name}/SKILL.md)
```

---

## Cross-Reference: Creator Ecosystem

This skill is part of the Creator Ecosystem. After creating a skill, consider if companion artifacts are needed:

| Gap Discovered                           | Required Artifact | Action to Record                        | When                              |
| ---------------------------------------- | ----------------- | --------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | Handle inside this flow                 | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | Hand off to `skill-updater` if needed   | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | Add a **Follow-Up** for `agent-creator` | Agent should own the capability   |
| Existing agent needs capability update   | agent update      | Add a follow-up for `agent-updater`     | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | Add a follow-up for `template-creator`  | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | Add a follow-up for `hook-creator`      | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | Add a follow-up for `workflow-creator`  | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | Add a follow-up for `schema-creator`    | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | Add a follow-up for `command-creator`   | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | Add a follow-up for `tool-creator`      | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only      | Too specific to generalize        |

**Chain Example:**

```text
[SKILL-CREATOR] Created: <new-skill-name> skill
[SKILL-CREATOR] This skill needs a dedicated agent...
[SKILL-CREATOR] -> Added Follow-Up: agent-creator should evaluate <new-agent-name>
[FOLLOW-UP] agent-creator review queued with required skill: <new-skill-name>
```

**Integration Verification:**

After recording or completing companion follow-ups, verify the resulting chain:

```bash
# Verify skill exists
ls .claude/skills/{skill-name}/SKILL.md

# Verify agent exists (if created)
ls .claude/agents/*/{agent-name}.md

# Verify workflow exists (if created)
ls .claude/workflows/*{skill-name}*.md

# Verify all are in CLAUDE.md
grep -E "{skill-name}|{agent-name}" .claude/CLAUDE.md
```

---

## Iron Laws of Skill Creation

These rules are INVIOLABLE. Breaking them causes bugs that are hard to detect.

```
1. NO SKILL WITHOUT VALIDATION FIRST
   - Run validate-all.cjs after creating ANY skill
   - If validation fails, fix before proceeding

2. NO FILE REFERENCES WITHOUT VERIFICATION
   - Every .claude/tools/*.mjs reference must point to existing file
   - Every .claude/skills/*/SKILL.md reference must exist
   - Check with: ls <path> before committing

3. NO MULTI-LINE YAML DESCRIPTIONS
   - description: | causes parsing failures
   - Always use single-line: description: "My description here"

4. NO SKILL WITHOUT MEMORY PROTOCOL
   - Every skill MUST have Memory Protocol section
   - Agents forget everything without it

5. NO CREATION WITHOUT AGENT ASSIGNMENT
   - Skill must be added to at least one agent's skills array
   - Unassigned skills are never invoked

6. NO CREATION WITHOUT CATALOG UPDATE
   - Skill must be added to .claude/docs/skill-catalog.md
   - Uncataloged skills are hard to discover
   - Add to correct category table with description and tools

7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if skill requires new routes in CLAUDE.md
   - Check if skill requires a dedicated agent (record a Follow-Up for agent-creator if yes)
   - Check if existing workflows need updating
   - Check if CLAUDE.md agent table needs updating
   - Document all system changes made

8. NO SKILL WITHOUT REFERENCE COMPARISON
   - Compare against tdd/SKILL.md before finalizing
   - Ensure all standard sections are present
   - Verify frontmatter completeness
   - Check Memory Protocol section exists

9. NO SKILL TEMPLATES WITH MCP TOOLS
   - Unless tools are whitelisted in routing-table.cjs
   - MCP tools (mcp__*) cause routing failures
   - Standard tools only: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill

10. NO SKILL WITHOUT SYSTEM IMPACT ANALYSIS
    - Update CLAUDE.md Section 7 if skill adds new capability
    - Update skill-catalog.md with proper categorization
    - Update creator-registry.json if skill is a creator
    - Verify routing keywords if skill introduces new domain

11. PREFER EXISTING TOOLS OVER MCP SERVERS
    - FIRST: Check if WebFetch/Exa can access the same API directly
    - Many MCP servers are just API wrappers - use WebFetch instead!
    - Existing tools work immediately (no uvx/npm, no restart)
    - ONLY IF existing tools won't work: register MCP server
    - See "MCP-to-Skill Conversion" section for guidance
```

## System Impact Analysis (MANDATORY)

**After creating ANY skill, you MUST analyze and update system-wide impacts.**

### Impact Checklist

Run this analysis after every skill creation:

```
[SKILL-CREATOR] 🔍 System Impact Analysis for: <skill-name>

1. ROUTING TABLE CHECK
   - Does this skill introduce a new capability type?
   - Is there an agent that can use this skill?
   - If NO agent exists → add a Follow-Up for agent-creator review
   - If a new agent is later created → update CLAUDE.md routing table and routing-table.cjs

2. AGENT ASSIGNMENT CHECK
   - Which existing agents should have this skill?
   - Update each agent's skills: array
   - Update each agent's "Step 0: Load Skills" section

3. ROUTER UPDATE CHECK
   - Does Router know about this capability?
   - Update CLAUDE.md Core/Specialized/Domain agent tables if needed
   - Update Planning Orchestration Matrix if needed

4. WORKFLOW CHECK
   - Do any existing workflows reference this capability?
   - Should a new workflow be created?
   - Update .claude/workflows/ as needed

5. RELATED ARTIFACTS CHECK
   - Are there dependent skills that need updating?
   - Are there hooks that should be registered?
   - Are there commands that should be added?
```

### Example: Creating a New Documentation Skill

```
[SKILL-CREATOR] ✅ Created: .claude/skills/<new-skill-name>/SKILL.md

[SKILL-CREATOR] 🔍 System Impact Analysis...

1. ROUTING TABLE CHECK
   ❌ No agent handles "documentation" or "writing" tasks
   → Added Follow-Up for agent-creator to review a technical-writer agent
   → Adding to CLAUDE.md: | Documentation, docs | technical-writer | ...

2. AGENT ASSIGNMENT CHECK
   ✅ Assigned to: technical-writer, planner (for plan documentation)

3. ROUTER UPDATE CHECK
   ✅ Updated CLAUDE.md Core Agents table
   ✅ Added row to Planning Orchestration Matrix

4. WORKFLOW CHECK
   ✅ Created: .claude/workflows/documentation-workflow.md

5. RELATED ARTIFACTS CHECK
   ✅ No dependent skills
   ✅ No hooks needed
```

### System Update Commands

```bash
# Check if routing table needs update
grep -i "<capability-keyword>" .claude/CLAUDE.md || echo "NEEDS ROUTE"

# Check router agent tables
grep -i "<capability-keyword>" .claude/CLAUDE.md || echo "NEEDS ROUTER UPDATE"

# Check for related workflows
ls .claude/workflows/*<keyword>* 2>/dev/null || echo "MAY NEED WORKFLOW"

# Verify all system changes
node .claude/tools/cli/validate-agents.mjs
node .claude/skills/skill-creator/scripts/validate-all.cjs
```

### Validation Checklist (Run After Every Creation)

```bash
# Validate the new skill
node .claude/skills/skill-creator/scripts/validate-all.cjs | grep "<skill-name>"

# Check for broken pointers
grep -r ".claude/tools/" .claude/skills/<skill-name>/ | while read line; do
  file=$(echo "$line" | grep -oE '\.claude/tools/[^"]+')
  [ -f "$file" ] || echo "BROKEN: $file"
done

# Verify agent assignment
grep -l "<skill-name>" .claude/agents/**/*.md || echo "WARNING: Not assigned to any agent"

# Post-creation integration validation
node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md
```

## Post-Creation: Auto-Assign to Relevant Agents (CRITICAL)

**After creating any skill, you MUST update relevant agents to include the new skill.**

### Why This Matters

Agents only use skills that are:

1. Listed in their frontmatter `skills:` array
2. Explicitly loaded in their workflow

If you create a skill but don't assign it to agents, the skill will never be used.

### Auto-Assignment Workflow

After creating a skill, execute this workflow:

```text
[SKILL-CREATOR] ✅ Skill created: .claude/skills/<skill-name>/SKILL.md

[SKILL-CREATOR] 🔍 Finding relevant agents to update...
1. Scan agents: Glob .claude/agents/**/*.md
2. For each agent, check if skill domain matches:
   - Developer: code, testing, debugging, git skills
   - Planner: planning, analysis, documentation skills
   - Architect: architecture, design, diagramming skills
   - Security-Architect: security, compliance, audit skills
   - DevOps: infrastructure, deployment, monitoring skills
   - QA: testing, validation, coverage skills

[SKILL-CREATOR] 📝 Updating agents...
- Edit agent frontmatter to add skill to `skills:` array
- Ensure agent workflow references skill loading

[SKILL-CREATOR] ✅ Updated: developer, qa
```

### Agent-Skill Relevance Matrix

| Skill Domain                                | Relevant Agents                  |
| ------------------------------------------- | -------------------------------- |
| Testing (tdd, test-\*)                      | developer, qa                    |
| Debugging (debug*, troubleshoot*)           | developer, devops-troubleshooter |
| Documentation (doc-_, diagram-_)            | planner, architect               |
| Security (_security_, audit*, compliance*)  | security-architect               |
| Infrastructure (docker*, k8s*, terraform\*) | devops                           |
| Code Quality (lint*, style*, analyze\*)     | developer, architect             |
| Git/GitHub (git*, github*)                  | developer                        |
| Planning (plan*, sequential*)               | planner                          |
| Architecture (architect*, design*)          | architect                        |
| Communication (slack*, notification*)       | incident-responder               |

### Implementation

When creating a skill:

```bash
# 1. Create the skill
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "new-skill" --description "..."

# 2. Auto-assign to relevant agents (built into create.cjs)
# The script will:
#   - Analyze skill name and description
#   - Find matching agents from the matrix
#   - Update their frontmatter
#   - Add skill loading to workflow if needed
```

### Manual Assignment

If auto-assignment misses an agent:

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --assign "skill-name" --agent "agent-name"
```

This updates:

1. Agent's `skills:` frontmatter array
2. Agent's workflow to include skill loading step

### Skill Loading in Updated Agents

When updating an agent, ensure their workflow includes:

```markdown
### Step 0: Load Skills (FIRST)

Read your assigned skill files to understand specialized workflows:

- `.claude/skills/<skill-1>/SKILL.md`
- `.claude/skills/<skill-2>/SKILL.md`
- `.claude/skills/<new-skill>/SKILL.md` # Newly added
```

## Integration Follow-Up for Agent Coverage

The skill-creator can surface agent coverage gaps without chaining directly into `agent-creator`:

1. **New Capability Request** → skill-creator creates skill
2. **Auto-Assign** → skill-creator updates relevant agents with new skill
3. **No Matching Agent** → create a **Follow-Up** item for `agent-creator`
4. **Execute Task** → Once the follow-up is completed, the new agent loads the skill and handles requests

This preserves a clean creator boundary while still evolving the ecosystem:

- New skills are distributed to relevant agents once follow-ups are completed
- New agents still discover and include relevant skills
- The skill and agent creation paths stay decoupled

### Occupational Alignment Follow-Up

When skill creation reveals a missing specialist, the follow-up for `agent-creator` should still require **Step 2.3: Occupational Alignment Research**. That means:

1. The new agent will be grounded in BLS OOH occupational profiles (real-world task and tool data)
2. Job title variants from Ongig will be collected for routing keyword precision
3. MyMajors career skill lists will be cross-referenced for coverage gaps
4. **Any additional skill gaps discovered during Step 2.3** should become follow-up items, not inline creator chaining

**Termination condition**: The follow-up closes when all real-world skill gaps are either:

- Covered by existing skills in `.claude/skills/`
- Created as new skills through their own creator runs (and wired to the agent)
- Explicitly waived with documented reasoning

This keeps skills and agents co-aligned with real industry standards without reintroducing circular creator dependencies.

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

## Router Gap Detection

When router analysis has no matching agent/skill for recurring intent:

1. Route evidence to planner or evolution-orchestrator.
2. Run creation-feasibility gate.
3. Route a Follow-Up to the correct creator (`skill-creator` or `agent-creator`) if this creator is not the right artifact owner.
4. Complete integration wiring and validation before closing the gap.

Do not bypass this flow with direct unmanaged artifact writes.

## Optional: Evaluation-Driven Improvement

After creating a skill, you may optionally run a quality evaluation loop to measure how well the skill guides agents and identify targeted improvements. Evaluation is **opt-in** — the default creation path is unchanged.

### Flags

| Flag                  | Behavior                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| `--quick`             | Default. Skip evaluation; complete after integration steps.                          |
| `--eval`              | Run full evaluation loop (Create → Benchmark → Grade → Compare → Analyze → Iterate). |
| `--eval --tier light` | Run lightweight evaluation (Benchmark + Grade only; no compare/analyze).             |

### Evaluation Agents

Three read-only evaluation agents are available in `.claude/skills/skill-creator/agents/`:

- **grader.md** — Produces PASS/FAIL verdicts per assertion + instruction score (1-10)
- **comparator.md** — Blind A/B comparison between two skill versions with rubric scores
- **analyzer.md** — Categorized improvement suggestions (instructions/tools/examples/error_handling/structure/references)

### Running an Evaluation

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs \
  --skill .claude/skills/<skill-name>/SKILL.md \
  --output .claude/context/tmp/eval-$(date +%Y%m%d-%H%M%S)/
```

The runner scaffolds the evaluation directory structure and provides step-by-step instructions for executing the with-skill and baseline tracks.

Full workflow documented in: `.claude/skills/skill-creator/EVAL_WORKFLOW.md`

Output schema for all evaluation reports: `.claude/schemas/skill-evaluation-output.schema.json`
