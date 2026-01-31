# Registry Management Guide

**Version: 1.0.0**
**Last Updated: 2026-01-31**

This guide explains how to manage the Phase 1-3 infrastructure registries used for tool, skill, and agent discovery.

## Overview

The agent-studio framework uses three interconnected JSON registries for runtime discovery:

| Registry                    | Purpose                                      | File                                  | Tool                 |
| --------------------------- | -------------------------------------------- | ------------------------------------- | -------------------- |
| **Phase 1: Tool Manifest**  | Toolset definitions, tool availability       | `.claude/config/tool-manifest.json`   | `gen:tool-manifest`  |
| **Phase 2: Skill Index**    | Skill discovery, metadata, agent assignments | `.claude/config/skill-index.json`     | `gen:skill-index`    |
| **Phase 3: Agent Registry** | Agent capabilities, health tracking          | `.claude/context/agent-registry.json` | `gen:agent-registry` |

## Quick Reference

### Regenerate All Registries

```bash
npm run gen:all-registries
```

This runs all three generators in sequence:

1. `generate-tool-manifest.cjs` (Phase 1)
2. `generate-skill-index.cjs` (Phase 2)
3. `generate-agent-registry.cjs` (Phase 3)

**Use when:**

- Creating new agents, skills, or tools
- After manual artifact creation
- As part of CI/CD validation
- Troubleshooting discovery issues

### Regenerate Individual Registries

```bash
# Phase 1: Tool Manifest (tool availability and toolsets)
npm run gen:tool-manifest

# Phase 2: Skill Index (skill discovery metadata)
npm run gen:skill-index

# Phase 3: Agent Registry (agent capabilities and health)
npm run gen:agent-registry

# Validate without regenerating
npm run manifest:validate
npm run skills:validate
npm run agents:registry:validate
```

## When Creator Skills Run Generators

Creator skills automatically call these generators as part of their post-creation workflow:

### Agent Creator (Phase 3)

After creating a new agent, automatically runs:

```bash
node .claude/tools/cli/generate-agent-registry.cjs
```

This ensures:

- New agent appears in `agent-registry.json`
- Capability card is generated
- Health tracking is initialized

### Skill Creator (Phase 2)

After creating a new skill, automatically runs:

```bash
node .claude/tools/cli/generate-skill-index.cjs
```

This ensures:

- New skill appears in `skill-index.json`
- Metadata is properly registered
- Agent assignments are updated
- SkillCatalog() tool can discover it

## Registry Structure

### Phase 1: Tool Manifest (`.claude/config/tool-manifest.json`)

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-31T00:00:00Z",
  "tools": {
    "Read": { "description": "...", "category": "File I/O", ... },
    "Write": { ... },
    ...
  },
  "toolsets": {
    "DEVELOPER": ["Read", "Write", "Edit", "Bash", ...],
    "PLANNER": ["Read", "Write", "Edit", "TaskCreate", ...],
    "ORCHESTRATOR": ["Read", "Write", "Task", "TaskUpdate", ...],
    ...
  }
}
```

**Purpose:**

- Define which tools exist
- Group tools into toolsets
- Validate tool availability
- Enable pre-spawn tool validation

### Phase 2: Skill Index (`.claude/config/skill-index.json`)

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-31T00:00:00Z",
  "skills": [
    {
      "name": "tdd",
      "description": "Test-Driven Development workflow",
      "category": "Testing",
      "domain": "testing",
      "requiredTools": ["Read", "Write", "Bash"],
      "agentPrimary": ["developer", "qa"],
      "agentSupporting": ["architect"],
      "tags": ["testing", "quality", "development"],
      "priority": "high",
      ...
    },
    ...
  ]
}
```

**Purpose:**

- Enable SkillCatalog() tool to discover skills
- Provide skill metadata (tools, agents, tags)
- Filter by domain, category, agent type
- Track skill-to-agent relationships

### Phase 3: Agent Registry (`.claude/context/agent-registry.json`)

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-31T00:00:00Z",
  "agents": [
    {
      "id": "developer",
      "name": "Developer",
      "description": "...",
      "category": "core",
      "capabilities": ["coding", "debugging", "testing"],
      "health": {
        "status": "healthy",
        "lastUpdated": "2026-01-31T00:00:00Z",
        "successRate": 0.95
      },
      "constraints": {
        "maxTokens": 128000,
        "contextStrategy": "lazy_load"
      },
      ...
    },
    ...
  ]
}
```

**Purpose:**

- Enable AvailableAgents() tool to discover agents
- Provide agent metadata and capabilities
- Track agent health and success rates
- Support health-aware routing

## Integration with Creator Workflows

### Agent Creation Workflow

```
┌─────────────────────────────────────┐
│ Agent Creator SKILL                 │
├─────────────────────────────────────┤
│ 1. Create agent file                │
│ 2. Update CLAUDE.md routing table   │
│ 3. Update router-enforcer.cjs       │
│ 4. Update learnings.md              │
│ ⬇️ POST-CREATION (Step 11)          │
│ 5. Run: gen:agent-registry 🔄       │
│ 6. Verify in agent-registry.json    │
└─────────────────────────────────────┘
        ⬇️
agent-registry.json updated
        ⬇️
AvailableAgents() can discover
```

### Skill Creation Workflow

```
┌─────────────────────────────────────┐
│ Skill Creator SKILL                 │
├─────────────────────────────────────┤
│ 1. Create skill file                │
│ 2. Update CLAUDE.md                 │
│ 3. Assign to agents                 │
│ 4. Update skill-catalog.md          │
│ ⬇️ POST-CREATION (Step 11)          │
│ 5. Run: gen:skill-index 🔄          │
│ 6. Verify in skill-index.json       │
└─────────────────────────────────────┘
        ⬇️
skill-index.json updated
        ⬇️
SkillCatalog() can discover
```

## Manual Registry Updates

### When to Regenerate Manually

**Regenerate all registries when:**

- Making batch updates (multiple artifacts)
- Running CI/CD validation
- Troubleshooting discovery issues
- After restoring from backup
- Before deployment

**Command:**

```bash
npm run gen:all-registries
```

### Validating Registries

**Check if registries are valid:**

```bash
# All registries
npm run manifest:validate && npm run skills:validate && npm run agents:registry:validate

# Individual
npm run manifest:validate
npm run skills:validate
npm run agents:registry:validate
```

### Verification Steps

After regenerating registries, verify:

1. **No errors in console output**

   ```bash
   npm run gen:all-registries 2>&1 | grep -i error || echo "✓ No errors"
   ```

2. **Registries are valid JSON**

   ```bash
   node -e "require('fs').readFileSync('.claude/config/tool-manifest.json')" && echo "✓ Valid"
   ```

3. **New artifacts appear in registries**

   ```bash
   # Check for new agent
   grep "agent-name" .claude/context/agent-registry.json

   # Check for new skill
   grep "skill-name" .claude/config/skill-index.json
   ```

## Troubleshooting

### "Skill not found" in SkillCatalog()

**Symptom:** Agent cannot discover a newly created skill

**Causes:**

1. Skill index is stale
2. Skill metadata incomplete
3. Agent assignment missing

**Fix:**

```bash
# Regenerate skill index
npm run gen:skill-index

# Verify skill appears
grep "skill-name" .claude/config/skill-index.json

# Verify metadata
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/config/skill-index.json')).skills.find(s => s.name === 'skill-name'))"
```

### "Agent not found" in AvailableAgents()

**Symptom:** Router cannot discover a newly created agent

**Causes:**

1. Agent registry is stale
2. Agent capability card incomplete
3. Agent health not initialized

**Fix:**

```bash
# Regenerate agent registry
npm run gen:agent-registry

# Verify agent appears
grep "agent-name" .claude/context/agent-registry.json

# Verify health initialized
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/context/agent-registry.json')).agents.find(a => a.id === 'agent-name').health)"
```

### "Invalid schema" in validation

**Symptom:** Registry validation fails

**Causes:**

1. Artifact has invalid structure
2. Required fields missing
3. Data type mismatches

**Fix:**

```bash
# Run validation with verbose output
npm run manifest:validate -- --verbose
npm run skills:validate -- --verbose
npm run agents:registry:validate -- --validate

# Check specific artifact
grep -A5 "artifact-name" .claude/context/agent-registry.json | node -e "const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(JSON.stringify(data, null, 2))"
```

## CI/CD Integration

### Pre-Test Phase

Add to your CI/CD pipeline before running tests:

```bash
# Regenerate all registries to ensure up-to-date discovery
npm run gen:all-registries

# Validate all registries
npm run manifest:validate
npm run skills:validate
npm run agents:registry:validate
```

### GitHub Actions Example

```yaml
- name: Regenerate Registries
  run: npm run gen:all-registries

- name: Validate Registries
  run: npm run manifest:validate && npm run skills:validate && npm run agents:registry:validate

- name: Run Tests
  run: npm test
```

## Best Practices

### 1. Always Run Post-Creation

Creator skills **automatically** run registry generators:

- **Agent Creator** → runs `gen:agent-registry`
- **Skill Creator** → runs `gen:skill-index`

Do NOT skip these steps manually.

### 2. Batch Updates

When creating multiple artifacts:

```bash
# Create 5 new agents and 3 new skills
# Then regenerate all at once
npm run gen:all-registries
```

### 3. Verify After Generation

Always verify new artifacts appear:

```bash
npm run gen:all-registries

# Verify agents
grep "new-agent" .claude/context/agent-registry.json

# Verify skills
grep "new-skill" .claude/config/skill-index.json
```

### 4. Document Registry Updates

Record registry changes in memory:

```markdown
**learnings.md**

## Registry Management

- 2026-01-31: Added 5 new domain experts via agent-creator
  - Agents registered in agent-registry.json
  - Verified with AvailableAgents() tool

- 2026-01-30: Created sentiment-analyzer skill
  - Skill registered in skill-index.json
  - Verified with SkillCatalog() tool
```

### 5. Monitor Registry Size

Large registries can impact startup time:

```bash
# Check registry size
ls -lh .claude/config/tool-manifest.json .claude/config/skill-index.json .claude/context/agent-registry.json
```

## References

- **Phase 1 (Tools)**: `.claude/docs/TOOL_MANIFEST_GUIDE.md`
- **Phase 2 (Skills)**: `.claude/context/artifacts/skill-catalog.md`
- **Phase 3 (Agents)**: `.claude/docs/AGENT_REGISTRY_GUIDE.md`
- **Creator Skills Alignment**: `.claude/docs/CREATOR_SKILLS_ALIGNMENT_AUDIT.md`
- **Post-Creation Validation**: `.claude/workflows/core/post-creation-validation.md`

## FAQ

**Q: When should I manually regenerate registries?**
A: Creator skills handle post-creation automatically. Manually regenerate for batch updates, CI/CD validation, or troubleshooting discovery issues.

**Q: Why are there three registries?**
A: Each supports different discovery patterns:

- Tool Manifest: Validate tool availability before spawning
- Skill Index: Discover skills by domain/category for agents
- Agent Registry: Track agent health and capabilities for routing

**Q: Can I delete registries and regenerate?**
A: Yes! Generators read artifact files and recreate registries from scratch. Safe to regenerate anytime.

**Q: What if I get "Invalid JSON" errors?**
A: This means an artifact file has invalid structure. Check the artifact's YAML frontmatter and correct syntax errors before regenerating.

**Q: How do I know if registries are out of sync?**
A: An artifact exists in the filesystem but not in the registry. Solution: `npm run gen:all-registries`
