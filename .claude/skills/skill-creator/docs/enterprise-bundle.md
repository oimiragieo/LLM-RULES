# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.

## Actions

### `create` - Create a New Skill

Create a skill from scratch with proper structure.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "my-skill" \
  --description "What this skill does" \
  --tools "Read,Write,WebSearch" \
  [--enterprise]        # Enterprise bundle scaffolding (default)
  [--no-enterprise]     # Opt out of enterprise defaults
  [--refs]              # Create references/ directory
  [--hooks]             # Create hooks/ directory with pre/post execute
  [--schemas]           # Create schemas/ directory with input/output schemas
  [--rules]             # Create rules/ directory and default rules file
  [--commands]          # Create commands/ documentation directory
  [--templates]         # Create templates/ directory
  [--register-hooks]    # Also register hooks in settings.json
  [--register-schemas]  # Also register schemas globally
  [--create-tool]       # Force creation of companion CLI tool
  [--no-tool]           # Skip companion tool even if complex
```

**Automatic Tool Creation:**
Complex skills automatically get a companion tool in `.claude/tools/`. A skill is considered complex when it has 2+ of:

- Pre/post execution hooks
- Input/output schemas
- 6+ tools specified
- Command-line arguments
- Description with complex keywords (orchestration, pipeline, workflow, etc.)
  **Examples:**

```bash
# Basic skill
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "pdf-extractor" \
  --description "Extract text and images from PDF documents" \
  --tools "Read,Write,Bash"
# Skill with hooks and schemas (auto-creates tool)
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "data-validator" \
  --description "Validate and sanitize data inputs before processing" \
  --hooks --schemas
# Skill with hooks registered immediately
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "security-check" \
  --description "Security validation hook for all operations" \
  --hooks --register-hooks
# Force tool creation for a simple skill
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "simple-util" \
  --description "A simple utility that needs CLI access" \
  --create-tool
# Skip tool for a complex skill
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "complex-internal" \
  --description "Complex integration without external CLI" \
  --hooks --schemas --no-tool
```

### `convert` - Convert MCP Server to Skill

Convert an MCP server (npm, PyPI, or Docker) into a Claude Code skill.
**IMPORTANT: Auto-Registration Enabled**
When converting MCP servers, the skill-creator automatically:

1. Creates the skill definition (SKILL.md)
2. **Registers the MCP server in settings.json** (no user action needed)
3. Assigns skill to relevant agents
4. Updates CLAUDE.md and skill catalog

```bash
node .claude/skills/skill-creator/scripts/convert.cjs \
  --server "server-name" \
  [--source npm|pypi|docker|github] \
  [--test]  # Test the converted skill
  [--no-register]  # Skip auto-registration in settings.json
```

**Known MCP Servers (Auto-detected):**
| Server | Source | Description |
| --------------------------------------- | ------ | --------------------------- |
| @anthropic/mcp-shell | npm | Shell command execution |
| @modelcontextprotocol/server-filesystem | npm | File system operations |
| @modelcontextprotocol/server-memory | npm | Knowledge graph memory |
| @modelcontextprotocol/server-github | npm | GitHub API integration |
| @modelcontextprotocol/server-slack | npm | Slack messaging |
| mcp-server-git | pypi | Git operations |
| mcp-server-time | pypi | Time and timezone utilities |
| mcp-server-sentry | pypi | Sentry error tracking |
| mcp/github | docker | Official GitHub MCP |
| mcp/playwright | docker | Browser automation |
**Example:**

```bash
# Convert npm MCP server
node .claude/skills/skill-creator/scripts/convert.cjs \
  --server "@modelcontextprotocol/server-filesystem"
# Convert PyPI server
node .claude/skills/skill-creator/scripts/convert.cjs \
  --server "mcp-server-git" --source pypi
# Convert from GitHub
node .claude/skills/skill-creator/scripts/convert.cjs \
  --server "https://github.com/owner/mcp-server" --source github
```

### MCP-to-Skill Conversion (PREFERRED APPROACH)

**BEFORE adding an MCP server, check if existing tools can do the same job!**
Many MCP servers are just API wrappers. Using existing tools (WebFetch, Exa) is **preferred** because:
| MCP Server Approach | Skill with Existing Tools |
| ------------------------------------ | ------------------------- |
| ❌ Requires uvx/npm/pip installation | ✅ Works immediately |
| ❌ Requires session restart | ✅ No restart needed |
| ❌ External dependency failures | ✅ Self-contained |
| ❌ Platform-specific issues | ✅ Cross-platform |
**Example: arXiv - Use WebFetch instead of mcp-arxiv server**

```javascript
// INSTEAD of requiring mcp-arxiv server, use WebFetch directly:
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=ti:transformer&max_results=10',
  prompt: 'Extract paper titles, authors, abstracts',
});
// Or use Exa for semantic search:
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org transformer attention mechanism',
  numResults: 10,
});
```

**When to use existing tools (PREFERRED):**

- MCP server wraps a public REST API
- No authentication required
- Simple request/response patterns
  **When MCP server is actually needed:**
- Complex state management required
- Streaming/websocket connections
- Local file system access needed
- OAuth/authentication flows required

### MCP Server Auto-Registration (ONLY IF NECESSARY)

**If existing tools won't work and MCP server is truly required, you MUST register it.**
This ensures users don't need to manually configure MCP servers - skills "just work".

#### Step 10: Register MCP Server in settings.json (BLOCKING for MCP skills)

If your skill uses tools prefixed with `mcp__<server>__*`, add the server to `.claude/settings.json`:

1. **Determine the MCP server config** based on source:
   | Source | Config Template |
   | ------ | ----------------------------------------------------------- |
   | npm | `{ "command": "npx", "args": ["-y", "<package-name>"] }` |
   | PyPI | `{ "command": "uvx", "args": ["<package-name>"] }` |
   | Docker | `{ "command": "docker", "args": ["run", "-i", "<image>"] }` |
2. **Read current settings.json:**
   Use `Read` on `.claude/settings.json` (preferred), or Node if needed:
   ```bash
   node -e "const fs=require('fs');const p='.claude/settings.json';if(fs.existsSync(p))console.log(fs.readFileSync(p,'utf8'));"
   ```
3. **Add mcpServers section if missing, or add to existing:**
   ```json
   {
     "mcpServers": {
       "<server-name>": {
         "command": "<command>",
         "args": ["<args>"]
       }
     }
   }
   ```
4. **Verify registration:**
   ```bash
   grep "<server-name>" .claude/settings.json || echo "ERROR: MCP not registered!"
   ```

#### Known MCP Server Configurations

| Server Name | Package                                 | Source | Config                                                                            |
| ----------- | --------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| arxiv       | mcp-arxiv                               | PyPI   | `{ "command": "uvx", "args": ["mcp-arxiv"] }`                                     |
| filesystem  | @modelcontextprotocol/server-filesystem | npm    | `{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] }` |
| memory      | @modelcontextprotocol/server-memory     | npm    | `{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"] }`     |
| github      | @modelcontextprotocol/server-github     | npm    | `{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }`     |
| slack       | @modelcontextprotocol/server-slack      | npm    | `{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-slack"] }`      |
| git         | mcp-server-git                          | PyPI   | `{ "command": "uvx", "args": ["mcp-server-git"] }`                                |
| time        | mcp-server-time                         | PyPI   | `{ "command": "uvx", "args": ["mcp-server-time"] }`                               |
| sentry      | mcp-server-sentry                       | PyPI   | `{ "command": "uvx", "args": ["mcp-server-sentry"] }`                             |

#### Iron Law: NO MCP SKILL WITHOUT SERVER REGISTRATION

```
+======================================================================+
|  ⛔ MCP REGISTRATION IRON LAW - VIOLATION = BROKEN SKILL             |
+======================================================================+
|                                                                      |
|  If skill uses tools matching: mcp__<server>__*                      |
|  Then MUST add to .claude/settings.json mcpServers                   |
|                                                                      |
|  WITHOUT registration:                                               |
|    - Tools appear in skill definition                                |
|    - But tools don't exist at runtime                                |
|    - Skill invocation FAILS silently                                 |
|                                                                      |
|  BLOCKING: MCP skills are INCOMPLETE without server registration     |
|                                                                      |
+======================================================================+
```

### `validate` - Validate Skill Definition

Check a skill's SKILL.md for correctness.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --validate ".claude/skills/my-skill"
```

### `generate-openai-yaml` - Onboard Skills for UI Discovery

Generate canonical `agents/openai.yaml` metadata so skills are discoverable in agent runtimes.

```bash
# Generate for a single skill
node .claude/skills/skill-creator/scripts/generate-openai-yaml.cjs \
  --skill "my-skill"
# Generate for all skills that do not already have openai.yaml
node .claude/skills/skill-creator/scripts/generate-openai-yaml.cjs \
  --all
```

## TDD Execution Plan (MANDATORY FOR FIXES)

For every skill fix or restore, run this exact plan:

1. **Plan tests first**
   - Define failing behavior and target files.
   - Add/update focused tests before code changes.
2. **Red checkpoint**
   - Run targeted tests and confirm they fail for the expected reason.
3. **Green checkpoint**
   - Implement minimal fix.
   - Re-run targeted tests until passing.
4. **Refactor checkpoint**
   - Clean names/structure without behavior changes.
   - Re-run targeted tests.
5. **Repository quality gates**
   - `npx prettier --check <changed-files>`
   - `npx eslint <changed-files>`
   - `node --test <targeted-tests>`
   - Run domain validators when applicable (`skills:validate`, `agents:registry:validate`, `validate:references`).
6. **Submission checkpoint**
   - `git status --short`
   - `git diff -- <changed-files>`
   - Split commit by concern:
     - Commit A: tooling/scripts
     - Commit B: generated artifacts (for example `agents/openai.yaml`)
     - Commit C: docs/policy updates

### `install` - Install Skill from GitHub

Clone and install a skill from a GitHub repository.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --install "https://github.com/owner/claude-skill-name"
```

### `convert-codebase` - Convert External Codebase to Skill

Convert any external codebase to a standardized skill structure.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-codebase "/path/to/codebase" \
  --name "new-skill-name"
```

**What it does:**

1. Analyzes codebase structure (package.json, README, src/, lib/)
2. Extracts description from package.json or README
3. Finds entry points (index.js, main.js, cli.js)
4. Creates standardized skill structure
5. Copies original files to references/ for integration
6. Runs `pnpm format` on all created files
   **Example:**

```bash
# Convert a local tool to a skill
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-codebase "./my-custom-tool" \
  --name "custom-tool"
# The resulting structure:
# .claude/skills/custom-tool/
# ├── SKILL.md (standardized)
# ├── scripts/
# │   └── main.cjs (template + integrate original logic)
# └── references/
#     ├── original-entry.js
#     └── original-README.md
```

### `consolidate` - Consolidate Skills into Domain Experts

Consolidate granular skills into domain-based expert skills to reduce context overhead.

```bash
# Analyze consolidation opportunities
node .claude/skills/skill-creator/scripts/consolidate.cjs
# Preview with all skill details
node .claude/skills/skill-creator/scripts/consolidate.cjs --verbose
# Execute consolidation (keeps source skills)
node .claude/skills/skill-creator/scripts/consolidate.cjs --execute
# Execute and remove source skills
node .claude/skills/skill-creator/scripts/consolidate.cjs --execute --remove
# List all domain buckets
node .claude/skills/skill-creator/scripts/consolidate.cjs --list-buckets
```

**What it does:**

1. Groups skills by technology domain (react, python, go, etc.)
2. Creates consolidated "expert" skills with merged guidelines
3. Preserves source skill references in `references/source-skills.json`
4. Optionally removes source skills after consolidation
5. Updates memory with consolidation summary
   **Domain Buckets:**
   | Bucket | Description |
   | ------------------------ | ------------------------------------- |
   | `react-expert` | React, Shadcn, Radix |
   | `python-backend-expert` | Django, FastAPI, Flask |
   | `nextjs-expert` | Next.js App Router, Server Components |
   | `typescript-expert` | TypeScript, JavaScript |
   | `general-best-practices` | Naming, error handling, docs |
   | ... | 40+ total buckets |

### `convert-rules` - Convert Legacy Rules to Skills

Convert old rule files (.mdc, .md) from legacy rule libraries into standardized skills.

```bash
# Convert a single rule file
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-rule "/path/to/rule.mdc"
# Convert all rules in a directory
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-rules "/path/to/rules-library"
# Force overwrite existing skills
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-rules "/path/to/rules" --force
```

**What it does:**

1. Parses `.mdc` or `.md` rule files with YAML frontmatter
2. Extracts description and globs from frontmatter
3. Creates a skill with embedded guidelines in `<instructions>` block
4. Copies original rule file to `references/`
5. Creates `scripts/main.cjs` for CLI access
6. Updates memory with conversion summary
   **Example:**

```bash
# Convert legacy cursorrules to skills
node .claude/skills/skill-creator/scripts/create.cjs \
  --convert-rules ".claude.archive/rules-library"
```

### `assign` - Assign Skill to Agent

Add a skill to an existing or new agent's configuration.

```bash
# Assign to existing agent
node .claude/skills/skill-creator/scripts/create.cjs \
  --assign "skill-name" --agent "developer"
# Create new agent with skill
node .claude/tools/agent-creator/create-agent.mjs \
  --name "pdf-specialist" \
  --description "PDF processing expert" \
  --skills "pdf-extractor,doc-generator"
```

### `register-hooks` - Register Existing Skill's Hooks

Register a skill's hooks in settings.json for an existing skill.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --register-hooks "skill-name"
```

This adds the skill's pre-execute and post-execute hooks to `.claude/settings.json`.

### `register-schemas` - Register Existing Skill's Schemas

Register a skill's schemas globally for an existing skill.

```bash
node .claude/skills/skill-creator/scripts/create.cjs \
  --register-schemas "skill-name"
```

This copies the skill's input/output schemas to `.claude/schemas/` for global access.

### `show-structure` - View Standardized Structure

Display the required skill structure documentation.

```bash
node .claude/skills/skill-creator/scripts/create.cjs --show-structure
```

## Workflow: User Requests New Capability

When a user requests a capability that doesn't exist:

```text
User: "I need to analyze sentiment in customer feedback"

[ROUTER] Checking existing skills...
[ROUTER] No sentiment analysis skill found
[ROUTER] ➡️ Handoff to SKILL-CREATOR

[SKILL-CREATOR] Creating new skill...
1. Research: WebSearch "sentiment analysis API MCP server 2026"
2. Found: @modelcontextprotocol/server-sentiment (hypothetical)
3. Converting MCP server to skill...
4. Created: .claude/skills/<new-skill-name>/SKILL.md
5. Assigning to agent: developer (or creating new agent)

[DEVELOPER] Now using <new-skill-name> skill...
```

## Workflow: Convert MCP Tool Request

When user wants to use an MCP server:

```text
User: "Add the Slack MCP server so I can send messages"

[SKILL-CREATOR] Converting MCP server...
1. Detected: @modelcontextprotocol/server-slack (npm)
2. Verifying package exists...
3. Generating skill definition...
4. Creating executor script...
5. Testing connection...
6. Created: .claude/skills/<new-skill-name>/SKILL.md

[ROUTER] Skill available. Which agent should use it?
```

## Evidence-Or-Die Rule (MANDATORY)

Every process step in a generated skill MUST include:

1. A concrete command or code snippet (not just "analyze the code" or "review the output")
2. Expected output description
3. Verification method

Steps that say only "review", "analyze", or "check" without specifying HOW are INVALID.

**Example — INVALID step (DO NOT write this):**

```markdown
### Step 3: Analyze Dependencies

Check for outdated packages and vulnerabilities.
```

**Example — VALID step (follow this pattern):**

````markdown
### Step 3: Analyze Dependencies

**Command:**

```bash
pnpm audit --json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d);console.log('Vulnerabilities:',r.metadata.vulnerabilities)"
```
````

**Expected output:** JSON summary of vulnerability counts by severity (e.g. `{ critical: 0, high: 1, moderate: 3 }`)
**Verify:** Exit code 0 and valid JSON object printed to stdout

````

Use `{{placeholder}}` syntax for values the invoking agent must substitute:

```bash
pnpm audit --json --audit-level={{severity_threshold}}
node .claude/tools/cli/validate-integration.cjs {{skill_path}}
grep "{{skill_name}}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md NOT UPDATED!"
````

This rule applies to every `<instructions>` step, every numbered checklist item, and every workflow action block in a skill's SKILL.md.

---

## Skill Definition Format

Skills use YAML frontmatter in SKILL.md:

```yaml
---
name: skill-name
description: What the skill does
version: 1.0.0
model: sonnet
invoked_by: user | agent | both
user_invocable: true | false
tools: [Read, Write, Bash, ...]
args: "<required> [optional]"
agents: [developer, qa]      # REQUIRED — list of agents that use this skill
category: "Quality"          # REQUIRED — maps to skill-catalog category
tags: [testing, validation]  # REQUIRED — used for discovery filtering in skill-index.json
---

# Skill Name

## Purpose
What this skill accomplishes.

## Usage
How to invoke and use the skill.

## Examples
Concrete usage examples.
```

#### Required Frontmatter Fields (Gap B — MANDATORY)

The following frontmatter fields are REQUIRED and must be set explicitly during creation. Omitting them causes silent integration failures:

| Field            | Required | Purpose                                                                   | Example                               |
| ---------------- | -------- | ------------------------------------------------------------------------- | ------------------------------------- |
| `name`           | YES      | Unique skill identifier (kebab-case)                                      | `wave-executor`                       |
| `description`    | YES      | One-line description for index/catalog                                    | `"Orchestrates parallel agent waves"` |
| `version`        | YES      | Semantic version                                                          | `1.0.0`                               |
| `agents`         | **YES**  | Agents that invoke this skill (drives `agentPrimary` in skill-index.json) | `[developer, qa]`                     |
| `category`       | **YES**  | Catalog category for discovery                                            | `"Orchestration"`                     |
| `tags`           | **YES**  | Tags for skill-index.json filtering                                       | `[orchestration, wave, parallel]`     |
| `tools`          | YES      | Tools the skill requires                                                  | `[Read, Write, Bash]`                 |
| `invoked_by`     | YES      | Who invokes: `user`, `agent`, or `both`                                   | `both`                                |
| `user_invocable` | YES      | Whether users can invoke via `/skill-name`                                | `true`                                |

**Why `agents`, `category`, and `tags` are critical:** The skill-index regenerator reads these fields when building the discovery index. Without them, skills get incorrect `agentPrimary` defaults (`["developer"]`), wrong category assignments, and no tags — making them undiscoverable by non-developer agents.

**Verification:**

```bash
# After creation, confirm all required fields are present
grep -E "^(name|description|agents|category|tags):" .claude/skills/<skill-name>/SKILL.md
```

## Directory Structure

```
.claude/
├── skills/
│   ├── skill-creator/
│   │   ├── SKILL.md           # This file
│   │   ├── scripts/
│   │   │   ├── create.cjs     # Skill creation tool
│   │   │   └── convert.cjs    # MCP conversion tool
│   │   └── references/
│   │       └── mcp-servers.json  # Known MCP servers database
│   └── [other-skills]/
│       ├── SKILL.md
│       ├── scripts/
│       ├── hooks/             # Optional pre/post execute hooks
│       └── schemas/           # Optional input/output schemas
├── tools/                     # Companion tools for complex skills
│   └── [skill-name]/
│       ├── [skill-name].cjs   # CLI wrapper script
│       └── README.md          # Tool documentation
└── workflows/                 # Auto-generated workflow examples
    └── [skill-name]-skill-workflow.md
```

## Output Locations

- New skills: `.claude/skills/[skill-name]/`
- Companion tools: `.claude/tools/[skill-name]/`
- Converted MCP skills: `.claude/skills/[server-name]-mcp/`
- Workflow examples: `.claude/workflows/[skill-name]-skill-workflow.md`
- **Skill catalog**: `.claude/docs/skill-catalog.md` (MUST UPDATE)
- Memory updates: `.claude/context/memory/learnings.md`
- Logs: `.claude/context/tmp/skill-creator.log`

## Architecture Compliance

### File Placement (ADR-076)

- Skills: `.claude/skills/{name}/SKILL.md` (main definition)
- Skills directories contain: SKILL.md, scripts/, schemas/, hooks/, references/
- Tests: `tests/` (NOT in .claude/)
- Related hooks: `.claude/hooks/{category}/`
- Related workflows: `.claude/workflows/{category}/`

### Documentation References (CLAUDE.md v3.1.0)

- Reference files use @notation: @SKILL_CATALOG_TABLE.md, @TOOL_REFERENCE.md
- Located in: `.claude/docs/@*.md`
- See: CLAUDE.md Section 8.5 (WORKFLOW ENHANCEMENT SKILLS reference)

### Shell Security (ADR-077)

- Skill scripts that use Bash must enforce: `cd "$PROJECT_ROOT" || exit 1`
- Environment variables control validators (block/warn/off mode)
- See: .claude/docs/SHELL-SECURITY-GUIDE.md
- Apply to: skill executors, CLI wrappers, test scripts

### Recent ADRs

- ADR-075: Router Config-Aware Model Selection
- ADR-076: File Placement Architecture Redesign
- ADR-077: Shell Command Security Architecture

---

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/skills/<skill-name>/`

Each skill directory should contain:

- `SKILL.md` - Main skill definition file
- `scripts/` - Executable logic (optional)
- `schemas/` - Input/output validation schemas (optional)
- `hooks/` - Pre/post execution hooks (optional)
- `references/` - Reference materials (optional)

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)
- **Skill Catalog**: See `@.claude/docs/@SKILL_CATALOG_TABLE.md` for proper categorization

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Post-Creation Integration

After skill creation, run integration checklist:

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

// 1. Run integration checklist
const result = await runIntegrationChecklist(
  'skill',
  '.claude/skills/<category>/<skill-name>/SKILL.md'
);

// 2. Queue cross-creator review (detects companion artifacts needed)
await queueCrossCreatorReview('skill', '.claude/skills/<category>/<skill-name>/SKILL.md', {
  artifactName: '<skill-name>',
  createdBy: 'skill-creator',
});

// 3. Review impact report
// Check result.mustHave for failures - address before marking complete
```

**Integration verification:**

- [ ] Skill added to skill-catalog.md
- [ ] Skill added to CLAUDE.md (if user-invocable)
- [ ] Skill assigned to at least one agent
- [ ] No broken cross-references

---

## Memory Protocol (MANDATORY)

**Before starting:**

Read `.claude/context/memory/learnings.md` using the `Read` tool.

If you need a truncated preview in scripts, use Node.js (cross-platform):

```bash
node -e "const fs=require('fs');const p='.claude/context/memory/learnings.md';const t=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';console.log(t.split(/\\r?\\n/).slice(0,120).join('\\n'));"
```

Check for:

- Previously created skills
- Known MCP server issues
- User preferences for skill configuration

**After completing:**

- New skill created -> Append to `.claude/context/memory/learnings.md`
- Conversion issue -> Append to `.claude/context/memory/issues.md`
- Architecture decision -> Append to `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

---
