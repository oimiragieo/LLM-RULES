---
template_type: spawn_enhancement
template_name: agent-identity-integration
use_cases:
  - Spawning agents with structured personality
  - Ensuring consistent agent behavior across invocations
optional: true
requires:
  - Agent files with identity fields (see .claude/docs/AGENT_IDENTITY.md)
  - AgentParser library (.claude/lib/agents/agent-parser.cjs)
---

# Agent Identity Integration (Optional Enhancement)

When spawning agents with identity fields, enhance prompts with structured personality for +20-30% consistency improvement.

## When to Use
- Agent files have `identity` frontmatter fields (role, goal, backstory, motto, personality)
- Want consistent agent personality across invocations
- Need trait-based decision-making (risk tolerance, communication style)

## Pattern

```javascript
// 1. Read and parse agent file
const fs = require('fs');
const { AgentParser } = require('./.claude/lib/agents/agent-parser.cjs');

const agentFilePath = '.claude/agents/core/developer.md';
const parser = new AgentParser();
const agentData = parser.parseAgentFile(agentFilePath);

// 2. Generate identity prompt section (if identity exists)
let identitySection = '';
if (agentData.identity) {
  identitySection = `
## Your Identity
**Role**: ${agentData.identity.role}
**Goal**: ${agentData.identity.goal}
**Backstory**: ${agentData.identity.backstory}
${agentData.identity.motto ? `**Motto**: "${agentData.identity.motto}"` : ''}

You embody this identity in all your actions and communications.
`;

  // Add personality guidance if present
  if (agentData.identity.personality) {
    const p = agentData.identity.personality;
    identitySection += `
## Decision-Making Style
- **Traits**: ${p.traits?.join(', ') || 'N/A'}
- **Communication**: ${p.communication_style || 'N/A'}
- **Risk Tolerance**: ${p.risk_tolerance || 'N/A'}
- **Decision Making**: ${p.decision_making || 'N/A'}

Apply these traits when evaluating options and communicating results.
`;
  }
}

// 3. Inject identity section into prompt (after task warning, before PROJECT CONTEXT)
Task({
  subagent_type: agentData.name,
  model: agentData.model,
  description: `${agentData.identity?.role || agentData.name} doing <TASK>`,
  allowed_tools: agentData.tools || [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
  ],
  prompt: `You are the ${agentData.name} agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: <ID>                                                  |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "in_progress" });              |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "completed", ... });           |
|  THEN check for more work: TaskList();                               |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
+======================================================================+
${identitySection}
## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: <absolute-path-to-project>
...
`,
});
```

## Benefits

- **Consistent personality** - Identity fields reduce agent drift across invocations (+20-30% consistency)
- **LLM expertise alignment** - Backstory establishes credibility and decision-making context
- **Trait-based decisions** - Risk tolerance and personality influence recommendations
- **Clear communication** - Communication style matches agent's defined personality

## Example Output (Developer with Identity)

```
You are the developer agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
...

## Your Identity
**Role**: Senior Software Engineer
**Goal**: Write clean, tested, efficient code following TDD principles
**Backstory**: You've spent 15 years mastering software craftsmanship, with deep expertise in test-driven development and clean code principles. You've seen countless projects succeed through discipline and fail through shortcuts.
**Motto**: "No code without a failing test"

You embody this identity in all your actions and communications.

## Decision-Making Style
- **Traits**: thorough, pragmatic, quality-focused
- **Communication**: direct
- **Risk Tolerance**: low
- **Decision Making**: data-driven

Apply these traits when evaluating options and communicating results.

## PROJECT CONTEXT (CRITICAL)
...
```

## Backward Compatibility

- Agents without `identity` fields work unchanged (identitySection = '')
- Identity is optional - no breaking changes to existing spawns
- Validation via AgentParser ensures identity fields are schema-compliant

## See Also

- `.claude/docs/AGENT_IDENTITY.md` - Full design specification
- `.claude/schemas/agent-identity.json` - JSON Schema for identity validation
- `.claude/lib/agents/agent-parser.cjs` - Parser with identity validation
