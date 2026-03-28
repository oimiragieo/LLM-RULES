# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.

## MANDATORY PRE-CREATION CHECK (BLOCKING)

**BEFORE creating any skill file, check if it already exists:**

### Step 0: Existence Check and Updater Delegation (MANDATORY - FIRST STEP)

**This step prevents duplicate skills and delegates updates to the artifact-updater workflow.**

1. **Check if skill already exists:**

   ```bash
   test -f .claude/skills/<skill-name>/SKILL.md && echo "EXISTS" || echo "NEW"
   ```

2. **If skill EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke artifact-updater workflow instead:**

     ```javascript
     // Delegate to updater
     Skill({
       skill: 'artifact-updater',
       args: '--type skill --path .claude/skills/<category>/<skill-name>/SKILL.md --changes "<description of requested changes>"',
     });
     ```

   - **Return updater result to user**
   - **STOP HERE** - Do not continue with creation steps

3. **If skill is NEW:**
   - Continue to Step 6 below (creation steps)

**Why this matters:** Creating a skill that already exists leads to:

- Lost version history
- Broken agent assignments
- Duplicate catalog entries
- Overwriting custom modifications

The artifact-updater workflow safely handles updates with:

- Backup before modification
- Protected section validation
- Registry synchronization
- Version tracking

**Enforcement:** This check is MANDATORY. Bypassing it via direct Write operations is blocked by `unified-creator-guard.cjs`.

---

### Step 0.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'skill',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `skill-updater` skill instead: `Skill({ skill: 'skill-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to Step 0.5 (companion check).

**Override**: If user explicitly passes `--force`, skip this check entirely.

---

### Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("skill", "{skill-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

#### Gap C: Companion Rules File for Agent-Invoked Skills (IMPORTANT)

If the skill is intended for invocation by agents that use rule injection (i.e., the skill provides runtime guidance that should influence agent behavior), it SHOULD have a companion rules file at `.claude/rules/{skill-name}.md`.

**Check during companion review:**

```bash
ls .claude/rules/<skill-name>.md 2>/dev/null && echo "Rules file exists" || echo "Rules file MISSING"
```

**When a rules file is needed:**

- The skill instructs agents on coding standards, security practices, or behavioral constraints
- The skill's guidance should be available to agents even when not explicitly invoked
- The skill is used by the `developer`, `qa`, `code-reviewer`, or `security-architect` agents

**When a rules file is NOT needed:**

- The skill is a pure execution script (no agent behavioral guidance)
- The skill is only invoked on-demand with explicit `Skill({ skill: '...' })` calls and has no persistent behavioral effect

**Template for companion rules file:**

```markdown
# {Skill Name} Rules

## Core Principles

[Key principles the skill enforces]

## Anti-Patterns

[What to avoid when using this skill]

## Integration Points

[Related agents, skills, workflows]
```

Record the missing rules file in post-creation integration notes if you skip creation.

---

## MANDATORY POST-CREATION STEPS (BLOCKING)

After creating ANY skill file, you MUST complete these steps in order. Skill creation is INCOMPLETE until all steps pass.

### Step 6: Update CLAUDE.md Skill Documentation (MANDATORY - BLOCKING)

This step is AUTOMATIC and BLOCKING. Do not skip.

1. **Determine what needs updating in CLAUDE.md:**
   - Skill has an associated orchestrator agent -> Add row to Section 3 quick routing table
   - Skill is a new workflow/tool type -> Section 3 quick routing table row (if agent introduced)
   - Skill is user-invocable and important -> Section 7 (Skill Invocation) mention
   - Infrastructure/tool skills -> Usually no CLAUDE.md entry needed

2. **Generate skill entry in this exact format:**

````markdown
### {Skill Name (Title Case)}

Use when {trigger condition}:

```javascript
Skill({ skill: '{skill-name}' });
```
````

{Brief description of what the skill does in 1-2 sentences.}

````

3. **Insert in appropriate section using Edit tool:**
   - Find the end of the target section (before the next ## heading)
   - Insert the new skill entry

4. **Verify update with:**
```bash
grep "{skill-name}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md NOT UPDATED - BLOCKING!"
````

**BLOCKING**: If CLAUDE.md update fails or skill is not found, skill creation is INCOMPLETE. Do not proceed.

### Step 7: Assign to Relevant Agents (MANDATORY - BLOCKING)

Based on skill domain and purpose, auto-assign to matching agents.

1. **Analyze skill keywords and domain** from name and description
2. **Find matching agents** in `.claude/agents/` using the relevance matrix below
3. **For each matching agent:**
   a. Read agent file
   b. Check if agent has YAML frontmatter with `skills:` array
   c. Add skill to `skills:` array if not present
   d. Determine tier placement (primary/supporting/on-demand based on relevance)
   e. Update agent file using Edit tool

**Tier Placement Guide:**

- **Primary**: Skill is core to the agent's domain (always loaded in Step 0)
- **Supporting**: Skill is frequently useful but not always needed
- **On-demand**: Skill is only loaded for specific task types

1. **Record assignments** in skill's SKILL.md under "Assigned Agents" section

**Matching Rules:**

| Skill Domain  | Keywords                                   | Assign To Agents                 |
| ------------- | ------------------------------------------ | -------------------------------- |
| Testing       | tdd, test, qa, validate                    | qa, developer                    |
| Security      | security, audit, compliance, vulnerability | security-architect, developer    |
| Planning      | plan, design, architect, analyze           | planner, architect               |
| Coding        | code, implement, refactor, debug           | developer, all domain-pro agents |
| Documentation | doc, write, readme, comment                | technical-writer, planner        |
| DevOps        | deploy, docker, k8s, terraform, ci, cd     | devops, devops-troubleshooter    |
| Git/GitHub    | git, github, commit, pr, branch            | developer, devops                |
| Communication | slack, notify, alert, message              | incident-responder               |
| Database      | sql, database, migration, schema           | database-architect, developer    |
| API           | api, rest, graphql, endpoint               | developer, architect             |

**Example agent update:**

```yaml
# Before
skills: [tdd, debugging]

# After
skills: [tdd, debugging, new-skill-name]
```

**BLOCKING**: At least one agent must be assigned. Unassigned skills are never invoked.

### Step 8: Update Skill Catalog + Routing Docs (MANDATORY - BLOCKING)

Update the skill catalog and routing docs to ensure the new skill and any new agent are discoverable.

#### 8a. Skill Catalog (`@SKILL_CATALOG_TABLE.md`)

1. **Read current catalog:**

   Use `Read` on `.claude/docs/@SKILL_CATALOG_TABLE.md`.

2. **Determine skill category** based on domain:
   - Core Development (tdd, debugging, code-analyzer)
   - Planning & Architecture (plan-generator, architecture-review)
   - Security (security-architect, auth-security-expert)
   - DevOps (devops, container-expert, terraform-infra)
   - Languages (python-pro, rust-pro, golang-pro, etc.)
   - Frameworks (nextjs-pro, sveltekit-expert, fastapi-pro)
   - Mobile (ios-pro, expo-mobile-developer, android-expert)
   - Data (data-engineer, database-architect, text-to-sql)
   - Documentation (doc-generator, technical-writer)
   - Git & Version Control (git-expert, gitflow, commit-validator)
   - Code Style & Quality (code-quality-expert, code-style-validator)
   - Creator Tools (agent-creator, skill-creator, hook-creator)
   - Memory & Context (session-handoff, context-compressor)
   - Validation & Quality (qa-workflow, verification-before-completion)
   - Specialized Patterns (other domain-specific skills)

3. **Add skill entry to appropriate category table:**

   ```markdown
   | {skill-name} | {description} | {tools} |
   ```

4. **Update catalog Quick Reference** (top of file) if new category or significant skill.

5. **Verify update:**

   ```bash
   grep "{skill-name}" ".claude/docs/@SKILL_CATALOG_TABLE.md" || echo "ERROR: Skill catalog NOT UPDATED!"
   ```

**BLOCKING**: Skill must appear in catalog. Uncataloged skills are hard to discover.

#### 8b. Agent Routing Table (`@AGENT_ROUTING_TABLE.md`) — if new agent created

If the skill creation involved creating a new orchestrator or agent:

1. **Read current routing table:**

   Use `Read` on `.claude/docs/@AGENT_ROUTING_TABLE.md`.

2. **Add a row to the CONTENT table** using the format:

   ```markdown
   | {Request Type} | `{agent-id}` | `.claude/agents/{category}/{agent-id}.md` |
   ```

3. **Add a row to the Common Misrouting Quick Reference** if the new agent is likely to be misrouted:

   ```markdown
   | "{trigger phrase}" | developer | **{agent-id}** |
   ```

4. **Verify:**

   ```bash
   grep "{agent-id}" ".claude/docs/@AGENT_ROUTING_TABLE.md" || echo "ERROR: Routing table NOT UPDATED!"
   grep "{agent-id}" ".claude/CLAUDE.md" || echo "ERROR: CLAUDE.md routing table NOT UPDATED!"
   ```

**BLOCKING**: If a new agent was created, it MUST appear in both `@AGENT_ROUTING_TABLE.md` and CLAUDE.md Section 3 quick routing table. An agent missing from the routing table is invisible to the Router.

### Step 9: System Impact Analysis (BLOCKING - VERIFICATION CHECKLIST)

**BLOCKING**: If ANY item fails, skill creation is INCOMPLETE. Fix all issues before proceeding.

Before marking skill creation complete, verify ALL items:

- [ ] **SKILL.md created** with valid YAML frontmatter (name, description, version, tools)
- [ ] **SKILL.md has Memory Protocol section** (copy from template if missing)
- [ ] **CLAUDE.md updated** — Section 3 quick routing table if new agent introduced (verify with grep)
- [ ] **Skill catalog updated** in `@SKILL_CATALOG_TABLE.md` with skill entry (verify with grep)
- [ ] **Agent routing table updated** in `@AGENT_ROUTING_TABLE.md` if new agent created (verify with grep)
- [ ] **At least one agent assigned** skill in frontmatter (verify with grep)
- [ ] **learnings.md updated** with creation record
- [ ] **Reference skill comparison** completed (compare against tdd/SKILL.md)
- [ ] **Model validation passed** (if skill spawns agents, model = haiku|sonnet|opus only)
- [ ] **Tools array validated** (no MCP tools unless whitelisted)
- [ ] **README.md updated** — skill added to Skills Catalog table and footprint count refreshed (Step 12)

**Model Validation (CRITICAL):**

- If skill spawns agents, model field MUST be base name only: `haiku`, `sonnet`, or `opus`
- DO NOT use dated versions like `claude-opus-4-5-20251101`
- Skills themselves don't have models, but skill templates that generate agents must validate this

**Tools Array Validation:**

- Standard tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
- DO NOT add MCP tools (mcp\_\_\*) to skill outputs unless whitelisted
- MCP tools cause router enforcement failures

**Verification Commands:**

```bash
# Check SKILL.md exists and has frontmatter
head -20 .claude/skills/{skill-name}/SKILL.md | grep "^name:"

# Check CLAUDE.md has skill
grep "{skill-name}" .claude/CLAUDE.md

# Check skill catalog has skill
grep "{skill-name}" ".claude/docs/@SKILL_CATALOG_TABLE.md"

# Check agents have skill assigned
grep -r "{skill-name}" .claude/agents/

# Check learnings.md updated
tail -20 .claude/context/memory/learnings.md | grep "{skill-name}"
```

**BLOCKING**: All checkboxes must pass. If any fail, skill creation is INCOMPLETE.

## IRON LAW: TaskUpdate Completion Metadata (MANDATORY)

When calling TaskUpdate({ status: 'completed' }), you MUST include ALL of these metadata fields:

```javascript
TaskUpdate({
  taskId: '<task-id>',
  status: 'completed',
  metadata: {
    creatorType: 'skill', // MANDATORY — enables post-creation-integration.cjs detection
    artifactName: '<skill-name>', // MANDATORY — the skill's name (e.g. 'gemini-cli-security')
    artifactPath: '.claude/skills/<skill-name>/SKILL.md', // MANDATORY — path to SKILL.md
    summary: 'Created skill <skill-name>: <one-line description>', // MANDATORY — for reflection
    integrationStatus: 'pending', // Set to 'complete' only after all post-creation steps run
    filesCreated: ['.claude/skills/<skill-name>/SKILL.md', '...'], // All files written
  },
});
```

**Why this is mandatory:**

- `creatorType` is required by `post-creation-integration.cjs` to detect creation events
- `summary` is required by reflection to avoid fabricating scores
- Without these fields, the skill will be orphaned and reflection will be blind

**Failure consequence:** Omitting these fields produces a fully orphaned skill invisible to the framework (confirmed bug 2026-02-18).

---

### Step 10: Integration Verification (BLOCKING - DO NOT SKIP)

**This step verifies the artifact is properly integrated into the ecosystem.**

Before calling `TaskUpdate({ status: "completed" })`, you MUST run the Post-Creation Validation workflow:

1. **Run the 10-item integration checklist:**

   ```bash
   node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md
   ```

2. **Verify exit code is 0** (all checks passed)

3. **If exit code is 1** (one or more checks failed):
   - Read the error output for specific failures
   - Fix each failure:
     - Missing CLAUDE.md entry -> Add to Section 8.5
     - Missing skill catalog entry -> Add to @SKILL_CATALOG_TABLE.md
     - Missing agent assignment -> Assign to relevant agents
     - Missing memory update -> Update learnings.md
   - Re-run validation until exit code is 0

4. **Only proceed when validation passes**

**This step is BLOCKING.** Do NOT mark task complete until validation passes.

**Why this matters:** The Party Mode incident showed that fully-implemented artifacts can be invisible to the Router if integration steps are missed. This validation ensures no "invisible artifact" pattern.

**Reference:** `.claude/workflows/core/post-creation-validation.md`

### Step 11: Post-Creation Skill Index Regeneration (BLOCKING - PHASE 2 INTEGRATION)

**This step ensures the new skill is discoverable via the SkillCatalog() tool (Phase 2 infrastructure).**

After the skill is created and validated, you MUST regenerate the skill index:

1. **Run the skill index generator:**

   ```bash
   node .claude/tools/cli/generate-skill-index.cjs
   ```

2. **Verify the command completed successfully:**
   - Exit code should be 0
   - You should see: `Successfully generated skill index`

3. **Verify skill appears in skill-index.json:**

   ```bash
   grep "<skill-name>" .claude/config/skill-index.json || echo "ERROR: Skill not in index!"
   ```

4. **Check skill metadata in the index:**
   - Verify the skill has proper metadata: `name`, `description`, `requiredTools`, `agentPrimary`, `agentSupporting`, `tags`, `priority`
   - Verify agent assignments from Step 7 are reflected as `agentPrimary` and `agentSupporting` entries
   - Verify tools are correct

**Why this is mandatory:**

- Skills not in skill-index.json are **invisible to SkillCatalog()** tool
- Agents cannot discover and invoke skills dynamically without the index
- SkillCatalog() filters by domain, category, tags, and agent type - all require the index
- New skills must be registered in Phase 2 discovery system

**Phase 2 Context:**

- **File**: `.claude/config/skill-index.json` (runtime skill discovery registry)
- **Tool**: `SkillCatalog()` for skill discovery by domain/category/agent type
- **Reference**: `.claude/docs/skill-catalog.md` (documentation)
- **Metadata**: `requiredTools`, `agentPrimary`, `agentSupporting`, `tags`, `priority`, `category`, `description`

**Troubleshooting:**

If skill doesn't appear in index:

- Check skill file has valid YAML frontmatter with `name:` field
- Verify no syntax errors in SKILL.md
- Check skill file is readable and in correct location
- Re-run generator with verbose output: `node .claude/tools/cli/generate-skill-index.cjs --verbose`
- Check agent assignments from Step 7 are valid (agents must exist)

#### Gap A: agentPrimary Sourcing from SKILL.md Frontmatter (CRITICAL)

**The index regenerator (`generate-skill-index.cjs`) defaults `agentPrimary` to `["developer"]` when no agent mapping is found in the agent-skill-matrix or AGENT_SKILLS lookup table.** It does NOT automatically read the `agents` field from SKILL.md frontmatter.

**What this means for you as the creator:**

After running `generate-skill-index.cjs`, you MUST verify that `agentPrimary` in the generated index entry matches the `agents` field in SKILL.md frontmatter:

```bash
# Check what the index has for this skill
node -e "const idx=require('./.claude/config/skill-index.json');const s=idx.skills['<skill-name>'];console.log('agentPrimary:',s?.agentPrimary);"

# Check what the SKILL.md frontmatter declares
grep -A2 "^agents:" .claude/skills/<skill-name>/SKILL.md
```

If they differ, you must either:

1. Add the skill to the **canonical** agent-skill matrix at `.claude/context/config/agent-skill-matrix.json` under the correct agent(s), then run `node .claude/tools/cli/generate-skill-index.cjs` (this regenerates the index and syncs the matrix to `.claude/config/agent-skill-matrix.json`), **OR**
2. Manually add the skill to the `AGENT_SKILLS` mapping in `generate-skill-index-definitions.cjs`

**NEVER rely on the default `["developer"]` fallback for a skill intended for non-developer agents.** Always edit `.claude/context/config/agent-skill-matrix.json` (canonical); do not edit `.claude/config/agent-skill-matrix.json` (synced copy only). The fallback exists only as a last resort; explicit agent assignment is required.

**Integration Diagram:**

```
Skill Created
    ↓
Step 6: CLAUDE.md Update
    ↓
Step 7: Agent Assignment
    ↓
Step 8: Skill Catalog Update
    ↓
Step 10: Integration Verification
    ↓
Step 11: Index Regeneration (Phase 2 Discovery)
    ↓
Skill in skill-index.json
    ↓
SkillCatalog() can discover
    ↓
Agents can invoke dynamically
    ↓
Step 12: README.md Updated (public catalog)
```

### Step 12: Global Ecosystem Sync (MANDATORY)

To guarantee that all registries and indexes are perfectly synchronized across the entire framework, you must run the composite registry command as your final action:

```bash
npm run gen:all-registries
```

This ensures the `agent-registry`, `skill-index`, and `tool-manifest` are completely up-to-date and consistent with each other.

### Step 13: Update README.md Skills Catalog (MANDATORY - BLOCKING)

After the skill is indexed, add it to the project README so it is publicly discoverable.

1. **Add skill row to the correct section** — map the skill's catalog category (from Step 8) to the matching `### {Section}` heading in README.md, then insert a new table row:

   ```markdown
   | [<skill-name>](.claude/skills/<skill-name>/SKILL.md) | <one-line description> |
   ```

   Use `Read` on `README.md` to locate the target table, then `Edit` to append the row before the next blank line or `###` heading.

   Category → README section mapping:

   | Skill Catalog Category   | README `###` Section     |
   | ------------------------ | ------------------------ |
   | Core Development         | Core Development         |
   | Planning & Architecture  | Planning & Architecture  |
   | Security                 | Security                 |
   | DevOps & Infrastructure  | DevOps & Infrastructure  |
   | Languages                | Languages                |
   | Frameworks               | Frameworks               |
   | Vercel & Web Performance | Vercel & Web Performance |
   | Mobile                   | Mobile                   |
   | Data & Database          | Data & Database          |
   | Documentation            | Documentation            |
   | Git & Version Control    | Git & Version Control    |
   | Creator Tools            | Creator Tools            |
   | Memory & Context         | Memory & Context         |
   | Validation & Quality     | Validation & Quality     |
   | Specialized Patterns     | Specialized Patterns     |
   | External Integrations    | External Integrations    |
   | Incident Response        | Incident Response        |
   | Scientific Research      | Scientific Research      |
   | Other                    | Other                    |

2. **Update the footprint count** — count SKILL.md files and patch the Current Footprint line:

   ```bash
   find .claude/skills -name "SKILL.md" | wc -l
   ```

   Then `Edit` README.md: change `- Skills: {N} \`SKILL.md\` definitions` to the new count.

3. **Update the skills catalog header** — find the `> **N active skills**` line in the Skills Catalog section and update N to match the new total.

4. **Verify:**

   ```bash
   grep "<skill-name>" README.md || echo "ERROR: README.md NOT UPDATED - BLOCKING!"
   ```

**BLOCKING**: Skill creation is INCOMPLETE until the skill name appears in README.md.

---

## Workflow Integration

This skill is part of the unified artifact lifecycle. For complete multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- How the Router discovers and invokes this skill's artifacts

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Discovery, creation, update, deprecation phases
- Version management and registry updates
- CLAUDE.md integration requirements

**External Integration:** `.claude/workflows/core/external-integration.md`

- Safe integration of external artifacts
- Security review and validation phases

---
