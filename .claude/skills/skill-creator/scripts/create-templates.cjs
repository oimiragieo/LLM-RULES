'use strict';

function toTitleCase(name) {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeListInput(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [...fallback];
}

function slugifyToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveSkillCategory({ category, name, description }) {
  if (typeof category === 'string' && category.trim()) {
    return category.trim();
  }

  const signal = `${name || ''} ${description || ''}`.toLowerCase();
  if (/(test|qa|validat|quality|contract)/.test(signal)) return 'Validation & Quality';
  if (/(secur|auth|threat|vuln)/.test(signal)) return 'Security';
  if (/(architect|plan|design|orchestrat|workflow)/.test(signal)) {
    return 'Planning & Architecture';
  }
  if (/(react|next|frontend|ui|component)/.test(signal)) return 'Frameworks';
  if (/(git|commit|branch|release|deploy)/.test(signal)) return 'Git & Version Control';
  return 'Specialized Patterns';
}

function deriveSkillAgents({ agents, name, description, category }) {
  const explicitAgents = normalizeListInput(agents);
  if (explicitAgents.length > 0) return explicitAgents;

  const signal = `${name || ''} ${description || ''} ${category || ''}`.toLowerCase();
  const resolved = new Set(['developer']);
  if (/(test|qa|validat|quality)/.test(signal)) resolved.add('qa');
  if (/(architect|plan|design)/.test(signal)) resolved.add('architect');
  if (/(secur|auth|threat|vuln)/.test(signal)) resolved.add('security-architect');
  return [...resolved].slice(0, 4);
}

function deriveSkillTags({ tags, name, description, category }) {
  const explicitTags = normalizeListInput(tags).map(slugifyToken).filter(Boolean);
  if (explicitTags.length > 0) return explicitTags;

  const derived = [
    ...normalizeListInput(name, []).flatMap(item => item.split('-')),
    ...(String(description || '')
      .toLowerCase()
      .match(/\b[a-z0-9-]{4,}\b/g) || []),
    ...normalizeListInput(category, []).flatMap(item => item.split(/\s+/)),
  ]
    .map(slugifyToken)
    .filter(Boolean);

  const unique = Array.from(new Set(derived));
  return unique.slice(0, 8).length > 0 ? unique.slice(0, 8) : ['general'];
}

function generateSkillContent(config) {
  const {
    name,
    description,
    version = '1.0',
    model = 'sonnet',
    tools = ['Read', 'Write', 'Bash'],
    invokedBy = 'both',
    userInvocable = true,
    args = '',
    bestPractices = [],
    capabilities = [],
    steps = [],
    agents,
    category,
    tags,
  } = config;

  const toolsArray = Array.isArray(tools)
    ? tools
    : String(tools)
        .split(',')
        .map(t => t.trim());
  const titleCase = toTitleCase(name);
  const resolvedCategory = deriveSkillCategory({ category, name, description });
  const resolvedAgents = deriveSkillAgents({
    agents,
    name,
    description,
    category: resolvedCategory,
  });
  const resolvedTags = deriveSkillTags({
    tags,
    name,
    description,
    category: resolvedCategory,
  });

  const defaultCapabilities =
    capabilities.length > 0
      ? capabilities
      : [
          `${titleCase} primary function`,
          'Integration with agent ecosystem',
          'Standardized output generation',
        ];

  const defaultSteps =
    steps.length > 0
      ? steps
      : [
          {
            title: 'Gather Context',
            description: 'Read relevant files and understand requirements',
          },
          {
            title: 'Execute',
            description: "Perform the skill's main function using available tools",
          },
          { title: 'Output', description: 'Return results and save artifacts if applicable' },
        ];

  const defaultBestPractices =
    bestPractices.length > 0
      ? bestPractices
      : [
          'Follow existing project patterns',
          'Document all outputs clearly',
          'Handle errors gracefully',
        ];

  return `---
name: ${name}
description: ${description}
version: ${version}
model: ${model}
invoked_by: ${invokedBy}
user_invocable: ${userInvocable}
tools: [${toolsArray.join(', ')}]
${args ? `args: "${args}"` : ''}
verified: true
lastVerifiedAt: ${new Date().toISOString()}
agents: [${resolvedAgents.join(', ')}]
category: ${JSON.stringify(resolvedCategory)}
tags: [${resolvedTags.join(', ')}]
best_practices:
${defaultBestPractices.map(p => `  - ${p}`).join('\n')}
error_handling: graceful
streaming: supported
---

# ${titleCase}

<identity>
${titleCase} Skill - ${description}
</identity>

<capabilities>
${defaultCapabilities.map(c => `- ${c}`).join('\n')}
</capabilities>

<instructions>
<execution_process>

${defaultSteps.map((step, i) => `### Step ${i + 1}: ${step.title}\n\n${step.description}`).join('\n\n')}

</execution_process>

<best_practices>

${defaultBestPractices.map((p, i) => `${i + 1}. **${p.split(':')[0] || p}**: ${p.includes(':') ? p.split(':')[1].trim() : 'Follow this practice for best results'}`).join('\n')}

</best_practices>
</instructions>

<examples>
<usage_example>
**Example Commands**:

\`\`\`bash
# Invoke this skill
/${name} [arguments]

# Or run the script directly
node .claude/skills/${name}/scripts/main.cjs --help
\`\`\`

</usage_example>
</examples>

## Search Protocol

For code discovery and search tasks, follow this priority order:

1. \\\`pnpm search:code "<query>"\\\` (Primary intent-based search).
2. \\\`ripgrep\\\` (for exact keyword/regex matches).
3. semantic/structural search via code tools if available.

## Memory Protocol (MANDATORY)

**Before starting:**
\\\`\\\`\\\`bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
\\\`\\\`\\\`

**After completing:**
- New pattern -> \\\`.claude/context/memory/learnings.md\\\`
- Issue found -> \\\`.claude/context/memory/issues.md\\\`
- Decision made -> \\\`.claude/context/memory/decisions.md\\\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
`;
}

function generateScriptContent(name, description) {
  const titleCase = toTitleCase(name);
  return `#!/usr/bin/env node

/**
 * ${titleCase} - Main Script
 * ${description}
 */

const options = Object.fromEntries(
  process.argv.slice(2).filter(arg => arg.startsWith('--')).map(flag => [flag.replace(/^--/, ''), true])
);

if (options.help) {
  console.log('${titleCase} - Main Script');
  process.exit(0);
}

console.warn('WARNING: This skill is currently a scaffold and has no implementation.');
process.exit(1);
`;
}

function generatePreHookContent(name) {
  return `#!/usr/bin/env node
const input = JSON.parse(process.argv[2] || '{}');
void input;
console.log('[${name.toUpperCase()}] Pre-execute validation...');
process.exit(0);
`;
}

function generatePostHookContent(name) {
  return `#!/usr/bin/env node
const result = JSON.parse(process.argv[2] || '{}');
void result;
console.log('[${name.toUpperCase()}] Post-execute processing...');
process.exit(0);
`;
}

function generateInputSchema(name) {
  return JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: `${name} Input Schema`,
      description: `Input validation schema for ${name} skill`,
      type: 'object',
      required: [],
      properties: {},
      additionalProperties: true,
    },
    null,
    2
  );
}

function generateOutputSchema(name) {
  return JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: `${name} Output Schema`,
      description: `Output validation schema for ${name} skill`,
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean', description: 'Whether the skill executed successfully' },
        result: {
          type: 'object',
          description: 'The skill execution result',
          additionalProperties: true,
        },
        error: { type: 'string', description: 'Error message if execution failed' },
      },
      additionalProperties: true,
    },
    null,
    2
  );
}

function generateEnterpriseCommandContent(name) {
  return `# ${name} Command Surface

## Primary command
\`/${name}\`

## CLI fallback
\`node .claude/skills/${name}/scripts/main.cjs --help\`

## Hook commands
- \`node .claude/skills/${name}/hooks/pre-execute.cjs\`
- \`node .claude/skills/${name}/hooks/post-execute.cjs\`
`;
}

function generateEnterpriseRuleContent(name) {
  return `# ${name} Skill Rule

Use this skill when requests align with ${name} responsibilities.
`;
}

function generateEnterpriseTemplateContent(name) {
  return `# ${name} Implementation Template

## Inputs
- Define validated inputs.

## Steps
1. Gather context.
2. Execute deterministic actions.
3. Validate output.
`;
}

function generateResearchRequirementsContent(name) {
  return `# ${name} Research Requirements

- Start with Exa MCP search for targeted references.
- Use WebFetch + arXiv fallback when primary search is insufficient.
- Summarize findings with source links and confidence notes.
`;
}

function generateToolScript(name, description) {
  return `#!/usr/bin/env node

/**
 * ${name} companion tool
 * ${description}
 */

if (process.argv.includes('--help')) {
  console.log('${name} companion tool');
  process.exit(0);
}

console.error('Not implemented');
process.exit(1);
`;
}

function generateToolReadme(name, description) {
  return `# ${name}

${description}

## Usage
\`node ${name}.cjs --help\`
`;
}

function generateWorkflowExample(name) {
  const titleCase = toTitleCase(name);
  return `# ${titleCase} Skill Workflow

## Skill Location
\`.claude/skills/${name}/SKILL.md\`

## Invocation
- /${name}
- node .claude/skills/${name}/scripts/main.cjs --help
`;
}

function generateHelpText() {
  return `Skill Creator Tool (Standardized)

Usage:
  node create.cjs --name "skill-name" --description "..." [options]
  node create.cjs --validate ".claude/skills/my-skill"
  node create.cjs --assign "skill-name" --agent "developer"
  node create.cjs --list

Create Options:
  --name            Skill name (required, lowercase-with-hyphens)
  --description     Skill description (required, min 20 chars)
  --tools           Comma-separated tools (default: Read,Write,Bash)
  --agents          Comma-separated primary agents for frontmatter metadata
  --category        Catalog category for frontmatter metadata
  --tags            Comma-separated discovery tags for frontmatter metadata
  --refs            Create references/ directory
  --hooks           Create hooks/ directory with pre/post execute hooks
  --schemas         Create schemas/ directory with input/output schemas
  --register-hooks  Also register hooks in settings.json
  --register-schemas Also register schemas in global schemas/
  --enterprise      Enable enterprise scaffolding bundle (opt-in)
  --no-enterprise   Force the minimal scaffold bundle (default behavior)
  --help            Show this help
`;
}

module.exports = {
  toTitleCase,
  generateSkillContent,
  generateScriptContent,
  generatePreHookContent,
  generatePostHookContent,
  generateInputSchema,
  generateOutputSchema,
  generateEnterpriseCommandContent,
  generateEnterpriseRuleContent,
  generateEnterpriseTemplateContent,
  generateResearchRequirementsContent,
  generateToolScript,
  generateToolReadme,
  generateWorkflowExample,
  generateHelpText,
};
