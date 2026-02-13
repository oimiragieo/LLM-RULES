---
paths:
  - .claude/skills/schema-creator/**
---

# Schema Creator Rules

## Core Principles

- Schemas validate data structures across the framework
- Every schema MUST have: JSON Schema file, schema catalog entry, consuming component documentation
- Schemas follow JSON Schema Draft 2020-12 standard
- All schemas include $id, title, description, and required fields

## Standards

### Schema Structure

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agent-studio.dev/schemas/{schema-name}.json",
  "title": "{Schema Title}",
  "description": "{Purpose}",
  "type": "object",
  "required": ["field1", "field2"],
  "properties": {
    "field1": {
      "type": "string",
      "description": "Field description"
    }
  }
}
```

### Schema Types

| Type          | Purpose                    | Example                      |
| ------------- | -------------------------- | ---------------------------- |
| Skill Output  | Validate skill results     | skill-\*-output.schema.json  |
| Agent Config  | Validate agent frontmatter | agent-definition.schema.json |
| Hook Protocol | Validate hook I/O          | hook-protocol.schema.json    |
| Task Metadata | Validate task metadata     | task-metadata.schema.json    |

### File Placement

- Schema directory: `.claude/schemas/`
- Catalog: `.claude/context/artifacts/catalogs/schema-catalog.md`

## Anti-Patterns

- Schemas without $id (not referenceable)
- Missing required fields (too permissive)
- No description fields (unclear purpose)
- Schemas not registered in catalog

## Integration Points

### Related Agents

- `schema-creator` agent uses this skill
- All agents that produce validated output

### Related Skills

- `skill-creator` - Creates skill output schemas
- `agent-creator` - Uses agent config schemas
- `hook-creator` - Uses hook protocol schemas

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md`

## Post-Creation Checklist

After creating a schema, MUST:

- [ ] Create JSON Schema file
- [ ] Add to schema-catalog.md
- [ ] Document consuming components
- [ ] Test schema validation
- [ ] Verify $id is unique
- [ ] Include all required fields
- [ ] Add descriptions to all properties
