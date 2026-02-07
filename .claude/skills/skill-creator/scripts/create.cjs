#!/usr/bin/env node

/**
 * Skill Creator Tool
 * Creates, validates, installs, and assigns skills for the agent ecosystem.
 * Enforces standardized skill structure for consistency.
 *
 * Usage:
 *   node create.cjs --name "skill-name" --description "..." --tools "Read,Write"
 *   node create.cjs --validate ".claude/skills/my-skill"
 *   node create.cjs --install "https://github.com/owner/skill-repo"
 *   node create.cjs --assign "skill-name" --agent "developer"
 *   node create.cjs --convert-codebase "/path/to/codebase" --name "new-skill"
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Lazy-load schema validator (graceful if missing)
let _validateData = null;
try {
  _validateData = require('../../lib/utils/schema-validator.cjs').validateData;
} catch (_e) {
  // Schema validator not available -- skip schema validation
}

/**
 * SEC-009 FIX: Security validation for paths to prevent command injection
 * Shell metacharacters in paths could execute arbitrary commands when passed to shell
 */
const DANGEROUS_CHARS = [
  '$',
  '`',
  '|',
  '&',
  ';',
  '(',
  ')',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '\n',
  '\r',
];

/**
 * Validate that a path does not contain shell metacharacters
 * @param {string} filePath - Path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath) {
  if (typeof filePath !== 'string') {
    return false;
  }
  return !DANGEROUS_CHARS.some(char => filePath.includes(char));
}

/**
 * Validate that a URL does not contain shell metacharacters
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe
 */
function isUrlSafe(url) {
  if (typeof url !== 'string') {
    return false;
  }
  // URLs can contain some special chars, but not shell operators
  const urlDangerousChars = ['`', '|', '&', ';', '(', ')', '<', '>', '\n', '\r'];
  return !urlDangerousChars.some(char => url.includes(char));
}

// Find project root (where .claude folder is)
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const TOOLS_DIR = path.join(CLAUDE_DIR, 'tools');
const SKILL_SCHEMA_PATH = path.join(CLAUDE_DIR, 'schemas', 'skill-definition.schema.json');
const STRUCTURE_PATH = path.join(
  CLAUDE_DIR,
  'skills',
  'skill-creator',
  'references',
  'skill-structure.md'
);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

/**
 * Format file with pnpm format or prettier
 * SEC-009 FIX: Uses spawnSync with shell:false to prevent command injection
 */
function formatFile(filePath) {
  // SEC-009: Validate path before execution
  if (!isPathSafe(filePath)) {
    console.log('⚠️  Could not format file (invalid path characters)');
    return false;
  }

  try {
    // SEC-009: Use spawnSync with array args and shell:false
    const result = spawnSync('pnpm', ['format', filePath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: false, // CRITICAL: Prevents shell interpretation
    });

    if (result.status === 0) {
      console.log('✨ Formatted with pnpm format');
      return true;
    }
    throw new Error('pnpm format failed');
  } catch (_error) {
    try {
      // SEC-009: Use spawnSync with array args and shell:false
      const result = spawnSync('npx', ['prettier', '--write', filePath], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: false, // CRITICAL: Prevents shell interpretation
      });

      if (result.status === 0) {
        console.log('✨ Formatted with prettier');
        return true;
      }
      throw new Error('prettier failed');
    } catch (_e) {
      console.log('⚠️  Could not format file (no formatter available)');
      return false;
    }
  }
}

/**
 * Format all files in a directory
 * SEC-009 FIX: Uses spawnSync with shell:false to prevent command injection
 */
function formatDirectory(dirPath) {
  // SEC-009: Validate path before execution
  if (!isPathSafe(dirPath)) {
    console.log('⚠️  Could not format directory (invalid path characters)');
    return false;
  }

  try {
    // SEC-009: Use spawnSync with array args and shell:false
    const result = spawnSync('pnpm', ['format', dirPath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: false, // CRITICAL: Prevents shell interpretation
    });

    if (result.status === 0) {
      console.log(`✨ Formatted directory: ${dirPath}`);
      return true;
    }
    console.log('⚠️  Could not format directory');
    return false;
  } catch (_error) {
    console.log('⚠️  Could not format directory');
    return false;
  }
}

/**
 * Standard skill structure
 */
const _SKILL_STRUCTURE = {
  requiredFiles: ['SKILL.md'],
  optionalDirs: ['scripts', 'hooks', 'schemas', 'references', 'templates', 'tests'],
  requiredSections: ['identity', 'capabilities', 'instructions', 'examples'],
  requiredFrontmatter: ['name', 'description'],
  recommendedFrontmatter: ['version', 'tools', 'model'],
};

const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

/**
 * GUARDRAIL: Content minimum requirements for skills
 */
const CONTENT_MINIMUMS = {
  totalLines: 50,
  requiredSections: ['identity', 'capabilities', 'instructions', 'Memory Protocol'],
  descriptionMinLength: 20,
};

/**
 * GUARDRAIL: Pre-creation validation for skills
 * Validates environment before creating a skill
 */
function preValidateSkill(config) {
  const errors = [];
  const warnings = [];

  // 1. Verify we're in a Claude Code project
  const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    errors.push('ERROR: Not in a Claude Code project. Missing .claude/CLAUDE.md');
    errors.push('       Current CLAUDE_DIR: ' + CLAUDE_DIR);
  }

  // 2. Verify skills directory exists
  if (!fs.existsSync(SKILLS_DIR)) {
    warnings.push('WARNING: Skills directory not found, will be created: ' + SKILLS_DIR);
  }

  // 3. Check for duplicate skill name
  if (config.name) {
    const skillPath = path.join(SKILLS_DIR, config.name);
    if (fs.existsSync(skillPath)) {
      errors.push(`ERROR: Skill "${config.name}" already exists at ${skillPath}`);
    }
  }

  // 4. Validate name format
  if (config.name && !/^[a-z][a-z0-9-]*$/.test(config.name)) {
    errors.push(
      'ERROR: Invalid skill name format. Must be lowercase-with-hyphens, starting with letter'
    );
  }

  // 5. Validate description length
  if (config.description && config.description.length < CONTENT_MINIMUMS.descriptionMinLength) {
    errors.push(
      `ERROR: Description must be at least ${CONTENT_MINIMUMS.descriptionMinLength} characters`
    );
  }

  // Report results
  if (warnings.length > 0) {
    console.log('\n⚠️  Pre-creation warnings:');
    warnings.forEach(w => console.log(`   ${w}`));
  }

  if (errors.length > 0) {
    console.error('\n❌ Pre-creation validation failed:');
    errors.forEach(e => console.error(`   ${e}`));
    console.error('\n💡 Fix the above issues before creating a skill.');
    process.exit(1);
  }

  console.log('✅ Pre-creation validation passed');
  return true;
}

/**
 * GUARDRAIL: Validate skill content meets minimum requirements
 */
function validateSkillContent(skillPath) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(skillPath)) {
    errors.push('Skill file not found: ' + skillPath);
    return { valid: false, errors, warnings };
  }

  const content = fs.readFileSync(skillPath, 'utf-8');
  const lines = content.split('\n').length;

  // Check line count
  if (lines < CONTENT_MINIMUMS.totalLines) {
    warnings.push(
      `Skill has only ${lines} lines (recommended minimum: ${CONTENT_MINIMUMS.totalLines})`
    );
  }

  // Check required sections
  for (const section of CONTENT_MINIMUMS.requiredSections) {
    const sectionPattern = new RegExp(`(##\\s*${section}|<${section}>)`, 'i');
    if (!sectionPattern.test(content)) {
      warnings.push(`Missing recommended section: ${section}`);
    }
  }

  // Check for placeholder content
  const placeholderPatterns = [/TODO:/i, /PLACEHOLDER/i, /Add.*content.*here/i, /Replace.*with/i];

  for (const pattern of placeholderPatterns) {
    if (pattern.test(content)) {
      warnings.push(
        'Skill contains placeholder content (TODO/PLACEHOLDER). Consider completing before use.'
      );
      break;
    }
  }

  const valid = errors.length === 0;

  return { valid, errors, warnings, lines };
}

/**
 * GUARDRAIL: Run orphan detection after skill creation
 */
function checkOrphanStatus(skillName) {
  const agents = [];
  const agentCategories = ['core', 'specialized', 'domain', 'orchestrators'];

  for (const category of agentCategories) {
    const categoryPath = path.join(AGENTS_DIR, category);
    if (!fs.existsSync(categoryPath)) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
      if (content.includes(skillName)) {
        agents.push(file.replace('.md', ''));
      }
    }
  }

  if (agents.length === 0) {
    console.log(`\n⚠️  ORPHAN WARNING: Skill "${skillName}" is not assigned to any agent`);
    console.log('   Skills must be assigned to agents to be useful.');
    console.log(
      '   Use: node .claude/skills/skill-creator/scripts/create.cjs --assign "' +
        skillName +
        '" --agent "<agent-name>"'
    );
    return false;
  }

  console.log(`✅ Skill assigned to: ${agents.join(', ')}`);
  return true;
}

/**
 * Generate standardized SKILL.md content
 */
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
    _examples = [],
  } = config;

  const toolsArray = Array.isArray(tools) ? tools : tools.split(',').map(t => t.trim());
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Default capabilities if none provided
  const defaultCapabilities =
    capabilities.length > 0
      ? capabilities
      : [
          `${titleCase} primary function`,
          'Integration with agent ecosystem',
          'Standardized output generation',
        ];

  // Default steps if none provided
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

  // Default best practices if none provided
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

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
\`\`\`

**After completing:**
- New pattern -> \`.claude/context/memory/learnings.md\`
- Issue found -> \`.claude/context/memory/issues.md\`
- Decision made -> \`.claude/context/memory/decisions.md\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
`;
}

/**
 * Generate standardized script template
 */
function generateScriptContent(name, description) {
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `#!/usr/bin/env node

/**
 * ${titleCase} - Main Script
 * ${description}
 *
 * Usage:
 *   node main.cjs [options]
 *
 * Options:
 *   --help     Show this help message
 */

const fs = require('fs');
const path = require('path');

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

/**
 * Main execution
 */
function main() {
  if (options.help) {
    console.log(\`
${titleCase} - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
\`);
    process.exit(0);
  }

  console.log('🔧 ${titleCase} executing...');

  console.warn('WARNING: This skill is currently a scaffold and has no implementation.');
  process.exit(1);
}

main();
`;
}

/**
 * Generate pre-execute hook template
 */
function generatePreHookContent(name, _description) {
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `#!/usr/bin/env node

/**
 * ${titleCase} - Pre-Execute Hook
 * Runs before the skill executes to validate input or prepare context.
 *
 * This hook receives the skill invocation context as JSON in process.argv[2]
 */

const fs = require('fs');
const path = require('path');

// Parse hook input
const input = JSON.parse(process.argv[2] || '{}');

console.log('🔍 [${name.toUpperCase()}] Pre-execute validation...');

/**
 * Validate input before execution
 */
function validateInput(input) {
  const errors = [];

  // TODO: Add your validation logic here
  // Example:
  // if (!input.requiredField) {
  //   errors.push('Missing required field: requiredField');
  // }

  return errors;
}

// Run validation
const errors = validateInput(input);

if (errors.length > 0) {
  console.error('❌ Validation failed:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

console.log('✅ [${name.toUpperCase()}] Validation passed');
process.exit(0);
`;
}

/**
 * Generate post-execute hook template
 */
function generatePostHookContent(name, _description) {
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `#!/usr/bin/env node

/**
 * ${titleCase} - Post-Execute Hook
 * Runs after the skill executes for cleanup, logging, or follow-up actions.
 *
 * This hook receives the skill execution result as JSON in process.argv[2]
 */

const fs = require('fs');
const path = require('path');

// Parse hook input
const result = JSON.parse(process.argv[2] || '{}');

console.log('📝 [${name.toUpperCase()}] Post-execute processing...');

/**
 * Process execution result
 */
function processResult(result) {
  // TODO: Add your post-processing logic here
  // Examples:
  // - Log execution to audit file
  // - Send notifications
  // - Update memory files
  // - Trigger follow-up actions

  return { success: true };
}

// Run post-processing
const outcome = processResult(result);

if (outcome.success) {
  console.log('✅ [${name.toUpperCase()}] Post-processing complete');
  process.exit(0);
} else {
  console.error('⚠️  [${name.toUpperCase()}] Post-processing had issues');
  process.exit(0); // Don't fail the skill for post-processing issues
}
`;
}

/**
 * Generate input schema template
 */
function generateInputSchema(name, _description) {
  return JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: `${name} Input Schema`,
      description: `Input validation schema for ${name} skill`,
      type: 'object',
      required: [],
      properties: {
        // TODO: Define your input properties here
        // example: {
        //   type: 'string',
        //   description: 'Example input field',
        // },
      },
      additionalProperties: true,
    },
    null,
    2
  );
}

/**
 * Generate output schema template
 */
function generateOutputSchema(name, _description) {
  return JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: `${name} Output Schema`,
      description: `Output validation schema for ${name} skill`,
      type: 'object',
      required: ['success'],
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the skill executed successfully',
        },
        result: {
          type: 'object',
          description: 'The skill execution result',
          additionalProperties: true,
        },
        error: {
          type: 'string',
          description: 'Error message if execution failed',
        },
      },
      additionalProperties: true,
    },
    null,
    2
  );
}

/**
 * Register hooks in settings.json
 */
function registerHooks(skillName, hookType) {
  console.log(`   Registering ${hookType} hook in settings.json...`);

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (_e) {
      console.log('   ⚠️  Could not parse settings.json, creating new');
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const trigger = hookType === 'pre' ? 'PreToolUse' : 'PostToolUse';
  const hookPath = `node .claude/skills/${skillName}/hooks/${hookType}-execute.cjs`;

  if (!settings.hooks[trigger]) {
    settings.hooks[trigger] = [];
  }

  // Check if hook already registered
  const existing = settings.hooks[trigger].find(
    h => h.hooks && h.hooks.some(hook => hook.command && hook.command.includes(skillName))
  );

  if (!existing) {
    settings.hooks[trigger].push({
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: hookPath,
        },
      ],
    });

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log(`   ✅ Registered ${hookType} hook`);
  } else {
    console.log(`   ⚠️  ${hookType} hook already registered`);
  }
}

/**
 * Register schema in global schemas directory
 */
function registerSchema(skillName, schemaType) {
  const skillSchemaPath = path.join(SKILLS_DIR, skillName, 'schemas', `${schemaType}.schema.json`);
  const globalSchemaPath = path.join(
    CLAUDE_DIR,
    'schemas',
    `skill-${skillName}-${schemaType}.schema.json`
  );

  if (fs.existsSync(skillSchemaPath)) {
    // Copy schema to global schemas directory
    fs.copyFileSync(skillSchemaPath, globalSchemaPath);
    console.log(`   ✅ Registered ${schemaType} schema globally`);
  }
}

/**
 * Determine if a skill is complex enough to warrant a companion tool
 * @param {Object} config - Skill configuration
 * @returns {Object} - { isComplex: boolean, reasons: string[] }
 */
function detectComplexity(config) {
  const reasons = [];

  // Check if hooks are being created
  if (config.hooks) {
    reasons.push('Has pre/post execution hooks');
  }

  // Check if schemas are being created
  if (config.schemas) {
    reasons.push('Has input/output schemas');
  }

  // Check if multiple tools are specified (more than 5 = complex)
  const toolsArray = config.tools
    ? Array.isArray(config.tools)
      ? config.tools
      : config.tools.split(',').map(t => t.trim())
    : [];
  if (toolsArray.length > 5) {
    reasons.push(`Uses ${toolsArray.length} tools (>5)`);
  }

  // Check if description suggests complexity
  const complexKeywords = [
    'orchestrat',
    'pipelin',
    'workflow',
    'integrat',
    'automat',
    'multi-step',
    'complex',
    'advanced',
    'enterprise',
    'full-stack',
  ];
  const descLower = (config.description || '').toLowerCase();
  for (const keyword of complexKeywords) {
    if (descLower.includes(keyword)) {
      reasons.push(`Description suggests complexity (${keyword})`);
      break;
    }
  }

  // Check if args are specified (CLI-like usage)
  if (config.args) {
    reasons.push('Has command-line arguments');
  }

  // Complex if 2+ reasons
  return {
    isComplex: reasons.length >= 2,
    reasons,
  };
}

/**
 * Generate CLI tool wrapper script
 */
function generateToolScript(name, description) {
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `#!/usr/bin/env node

/**
 * ${titleCase} - CLI Tool
 * ${description}
 *
 * This is a standalone CLI wrapper for the ${name} skill.
 * It can be run directly from the terminal or invoked by other tools.
 *
 * Usage:
 *   node ${name}.cjs [command] [options]
 *   .claude/tools/${name}/${name}.cjs [command] [options]
 *
 * Commands:
 *   run       Execute the skill (default)
 *   validate  Validate inputs before execution
 *   help      Show this help message
 *
 * Options:
 *   --input <file>   Input file path
 *   --output <file>  Output file path
 *   --config <file>  Configuration file
 *   --json           Output results as JSON
 *   --verbose        Verbose output
 *   --help           Show this help message
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * SEC-009 FIX: Security validation for paths to prevent command injection
 */
const DANGEROUS_CHARS = ['$', '\`', '|', '&', ';', '(', ')', '<', '>', '!', '*', '?', '[', ']', '{', '}', '\\n', '\\r'];

function isPathSafe(filePath) {
  if (typeof filePath !== 'string') return false;
  return !DANGEROUS_CHARS.some((char) => filePath.includes(char));
}

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILL_DIR = path.join(CLAUDE_DIR, 'skills', '${name}');
const SKILL_SCRIPT = path.join(SKILL_DIR, 'scripts', 'main.cjs');

// Parse command line arguments
const args = process.argv.slice(2);
let command = 'run';
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  } else if (!command || command === 'run') {
    command = args[i];
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(\`
${titleCase} - CLI Tool

Usage:
  node ${name}.cjs [command] [options]

Commands:
  run       Execute the skill (default)
  validate  Validate inputs before execution
  help      Show this help message

Options:
  --input <file>   Input file path
  --output <file>  Output file path
  --config <file>  Configuration file (JSON)
  --json           Output results as JSON
  --verbose        Verbose output
  --help           Show this help message

Examples:
  # Run the skill
  node ${name}.cjs run --verbose

  # Validate inputs only
  node ${name}.cjs validate --input data.json

  # Run with JSON output
  node ${name}.cjs run --json --output result.json

Skill Location:
  \${SKILL_DIR}

Script Location:
  \${SKILL_SCRIPT}
\`);
}

/**
 * Load configuration from file
 */
function loadConfig(configPath) {
  if (!configPath) return {};

  const fullPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    console.error(\`❌ Config file not found: \${fullPath}\`);
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (e) {
    console.error(\`❌ Failed to parse config file: \${e.message}\`);
    process.exit(1);
  }
}

/**
 * Run the skill
 */
function runSkill() {
  if (options.verbose) {
    console.log('🔧 Running ${titleCase}...');
    console.log(\`   Skill: \${SKILL_DIR}\`);
    console.log(\`   Script: \${SKILL_SCRIPT}\`);
  }

  // Check if skill script exists
  if (!fs.existsSync(SKILL_SCRIPT)) {
    console.error(\`❌ Skill script not found: \${SKILL_SCRIPT}\`);
    process.exit(1);
  }

  // SEC-009: Validate script path before execution
  if (!isPathSafe(SKILL_SCRIPT)) {
    console.error('❌ Invalid skill script path (contains unsafe characters)');
    process.exit(1);
  }

  // Build arguments for skill script - SEC-009: args are now array elements
  const skillArgs = [SKILL_SCRIPT];
  if (options.input) {
    if (!isPathSafe(options.input)) {
      console.error('❌ Invalid input path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--input', options.input);
  }
  if (options.output) {
    if (!isPathSafe(options.output)) {
      console.error('❌ Invalid output path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--output', options.output);
  }
  if (options.config) {
    if (!isPathSafe(options.config)) {
      console.error('❌ Invalid config path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--config', options.config);
  }
  if (options.json) skillArgs.push('--json');
  if (options.verbose) skillArgs.push('--verbose');

  // Execute skill script - SEC-009: Use spawnSync with shell:false
  try {
    const spawnResult = spawnSync('node', skillArgs, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.json ? 'pipe' : 'inherit',
      shell: false, // CRITICAL: Prevents shell interpretation
    });

    if (spawnResult.status !== 0) {
      const errorMsg = spawnResult.stderr || 'Unknown error';
      throw new Error(errorMsg);
    }

    if (options.json && spawnResult.stdout) {
      // Try to parse and re-output as formatted JSON
      try {
        const parsed = JSON.parse(spawnResult.stdout);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(spawnResult.stdout);
      }
    }

    if (options.verbose) {
      console.log('✅ ${titleCase} completed successfully');
    }
  } catch (error) {
    console.error(\`❌ Skill execution failed: \${error.message}\`);
    process.exit(1);
  }
}

/**
 * Validate inputs
 * SEC-009 FIX: Uses spawnSync with shell:false to prevent command injection
 */
function validateInputs() {
  if (options.verbose) {
    console.log('🔍 Validating inputs for ${titleCase}...');
  }

  // Check for pre-execute hook
  const preHook = path.join(SKILL_DIR, 'hooks', 'pre-execute.cjs');
  if (fs.existsSync(preHook)) {
    // SEC-009: Validate hook path before execution
    if (!isPathSafe(preHook)) {
      console.error('❌ Invalid hook path (contains unsafe characters)');
      process.exit(1);
    }

    const input = {
      input: options.input,
      config: options.config ? loadConfig(options.config) : {},
    };

    try {
      // SEC-009: Use spawnSync with shell:false and pass JSON as arg
      const spawnResult = spawnSync('node', [preHook, JSON.stringify(input)], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: false, // CRITICAL: Prevents shell interpretation
      });

      if (spawnResult.status !== 0) {
        throw new Error('Hook returned non-zero exit code');
      }
      console.log('✅ Validation passed');
    } catch (error) {
      console.error('❌ Validation failed');
      process.exit(1);
    }
  } else {
    // Basic validation
    if (options.input && !fs.existsSync(options.input)) {
      console.error(\`❌ Input file not found: \${options.input}\`);
      process.exit(1);
    }
    console.log('✅ Basic validation passed (no pre-execute hook found)');
  }
}

// Main execution
switch (command) {
  case 'help':
  case '--help':
    showHelp();
    break;
  case 'validate':
    validateInputs();
    break;
  case 'run':
  default:
    if (options.help) {
      showHelp();
    } else {
      runSkill();
    }
    break;
}
`;
}

/**
 * Generate tool README
 */
function generateToolReadme(name, description) {
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `# ${titleCase} Tool

${description}

## Overview

This is a standalone CLI tool wrapper for the \`${name}\` skill. It provides a command-line interface for running the skill with various options.

## Usage

\`\`\`bash
# Basic usage
node ${name}.cjs run

# With options
node ${name}.cjs run --input data.json --output result.json --verbose

# Validate inputs only
node ${name}.cjs validate --input data.json

# Show help
node ${name}.cjs help
\`\`\`

## Commands

| Command    | Description |
|------------|-------------|
| \`run\`      | Execute the skill (default) |
| \`validate\` | Validate inputs before execution |
| \`help\`     | Show help message |

## Options

| Option | Description |
|--------|-------------|
| \`--input <file>\` | Input file path |
| \`--output <file>\` | Output file path |
| \`--config <file>\` | Configuration file (JSON) |
| \`--json\` | Output results as JSON |
| \`--verbose\` | Verbose output |
| \`--help\` | Show help message |

## Integration

### With Other Tools

\`\`\`javascript
const { spawnSync } = require('child_process');

// Run the tool (SEC-009: Use spawnSync with shell:false for security)
const result = spawnSync('node', ['.claude/tools/${name}/${name}.cjs', 'run', '--json'], {
  encoding: 'utf-8',
  shell: false
});
const data = JSON.parse(result.stdout);
\`\`\`

### With Claude Agents

Agents can invoke this tool via Bash:

\`\`\`bash
node .claude/tools/${name}/${name}.cjs run --verbose
\`\`\`

## Related

- **Skill Definition**: \`.claude/skills/${name}/SKILL.md\`
- **Skill Script**: \`.claude/skills/${name}/scripts/main.cjs\`
- **Workflow**: \`.claude/workflows/${name}-skill-workflow.md\`
`;
}

/**
 * Create a companion tool for a skill
 * @param {string} name - Skill name
 * @param {string} description - Skill description
 * @param {string} skillDir - Skill directory path
 * @returns {string} - Tool directory path
 */
function createCompanionTool(name, description, _skillDir) {
  const toolDir = path.join(TOOLS_DIR, name);

  // Create tool directory
  if (!fs.existsSync(toolDir)) {
    fs.mkdirSync(toolDir, { recursive: true });
  }

  // Create main CLI script
  const toolScript = generateToolScript(name, description);
  const toolScriptPath = path.join(toolDir, `${name}.cjs`);
  fs.writeFileSync(toolScriptPath, toolScript);
  console.log(`   ✅ Created tool: ${toolScriptPath}`);

  // Create README
  const toolReadme = generateToolReadme(name, description);
  const toolReadmePath = path.join(toolDir, 'README.md');
  fs.writeFileSync(toolReadmePath, toolReadme);
  console.log(`   ✅ Created tool README: ${toolReadmePath}`);

  // Format tool files
  formatDirectory(toolDir);

  return toolDir;
}

/**
 * Create a new skill with standardized structure
 */
function createSkill(config) {
  const { name, description, tools, refs, hooks, schemas } = config;

  if (!name) {
    console.error('❌ Skill name is required (--name)');
    process.exit(1);
  }

  if (!description) {
    console.error('❌ Skill description is required (--description)');
    process.exit(1);
  }

  // GUARDRAIL: Run pre-creation validation
  console.log('\n🔍 Running pre-creation validation...');
  preValidateSkill(config);

  const skillDir = path.join(SKILLS_DIR, name);

  console.log(`\n🔧 Creating skill: ${name}`);
  console.log(`   Location: ${skillDir}`);
  console.log(`   Using standardized structure...`);

  // Create skill directory
  fs.mkdirSync(skillDir, { recursive: true });

  // Create SKILL.md with standardized content
  const skillContent = generateSkillContent(config);
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, skillContent);
  console.log('   ✅ Created SKILL.md (standardized)');

  // Always create scripts directory with main.cjs
  const scriptsDir = path.join(skillDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptContent = generateScriptContent(name, description);
  fs.writeFileSync(path.join(scriptsDir, 'main.cjs'), scriptContent);
  console.log('   ✅ Created scripts/main.cjs');

  // Create optional directories
  if (refs) {
    const refsDir = path.join(skillDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, '.gitkeep'), '# Reference materials for this skill\n');
    console.log('   ✅ Created references/');
  }

  // Create hooks if requested
  if (hooks) {
    const hooksDir = path.join(skillDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    // Create pre-execute hook
    const preHookContent = generatePreHookContent(name, description);
    fs.writeFileSync(path.join(hooksDir, 'pre-execute.cjs'), preHookContent);
    console.log('   ✅ Created hooks/pre-execute.cjs');

    // Create post-execute hook
    const postHookContent = generatePostHookContent(name, description);
    fs.writeFileSync(path.join(hooksDir, 'post-execute.cjs'), postHookContent);
    console.log('   ✅ Created hooks/post-execute.cjs');

    // Register hooks in settings.json if --register-hooks flag is set
    if (config.registerHooks) {
      registerHooks(name, 'pre');
      registerHooks(name, 'post');
    }
  }

  // Create schemas if requested
  if (schemas) {
    const schemasDir = path.join(skillDir, 'schemas');
    fs.mkdirSync(schemasDir, { recursive: true });

    // Create input schema
    const inputSchema = generateInputSchema(name, description);
    fs.writeFileSync(path.join(schemasDir, 'input.schema.json'), inputSchema);
    console.log('   ✅ Created schemas/input.schema.json');

    // Create output schema
    const outputSchema = generateOutputSchema(name, description);
    fs.writeFileSync(path.join(schemasDir, 'output.schema.json'), outputSchema);
    console.log('   ✅ Created schemas/output.schema.json');

    // Register schemas globally if --register-schemas flag is set
    if (config.registerSchemas) {
      registerSchema(name, 'input');
      registerSchema(name, 'output');
    }
  }

  // Format all files
  formatDirectory(skillDir);

  // Create workflow example
  if (!config.noWorkflow) {
    createWorkflowExample(name, description, skillDir);
  }

  // Update memory
  if (!config.noMemory) {
    updateMemory(name, description, tools);
  }

  // Auto-create companion tool for complex skills
  let toolCreated = false;
  let toolDir = null;

  if (config.createTool) {
    // Force tool creation
    console.log('\n🔧 Creating companion tool (--create-tool specified)...');
    toolDir = createCompanionTool(name, description, skillDir);
    toolCreated = true;
  } else if (!config.noTool) {
    // Check complexity for auto-creation
    const complexity = detectComplexity(config);
    if (complexity.isComplex) {
      console.log('\n🔧 Skill detected as complex, creating companion tool...');
      console.log(`   Reasons: ${complexity.reasons.join(', ')}`);
      toolDir = createCompanionTool(name, description, skillDir);
      toolCreated = true;
    }
  }

  console.log(`\n✅ Skill "${name}" created with standardized structure!`);
  console.log(`\n📁 Structure created:`);
  console.log(`   ${skillDir}/`);
  console.log(`   ├── SKILL.md`);
  console.log(`   ├── scripts/`);
  console.log(`   │   └── main.cjs`);
  if (hooks) {
    console.log(`   ├── hooks/`);
    console.log(`   │   ├── pre-execute.cjs`);
    console.log(`   │   └── post-execute.cjs`);
  }
  if (schemas) {
    console.log(`   ├── schemas/`);
    console.log(`   │   ├── input.schema.json`);
    console.log(`   │   └── output.schema.json`);
  }
  if (refs) {
    console.log(`   └── references/`);
  }

  if (toolCreated) {
    console.log(`\n🔧 Companion tool created:`);
    console.log(`   ${toolDir}/`);
    console.log(`   ├── ${name}.cjs`);
    console.log(`   └── README.md`);
  }

  // Output spawn command if original request provided
  if (config.originalRequest) {
    console.log('\n🚀 Ready to use skill for original task:');
    const spawnCmd = generateSkillSpawnCommand(name, config.originalRequest);
    console.log('\n--- SPAWN COMMAND (use with Task tool) ---');
    console.log(JSON.stringify(spawnCmd, null, 2));
    console.log('--- END SPAWN COMMAND ---\n');
  }

  // Output test command if --test flag
  if (config.test) {
    console.log(generateTestCommand(name, description));
  }

  // GUARDRAIL: Post-creation content validation
  if (!config.noVerify) {
    console.log('\n📋 Post-creation Verification:');
    const skillPath = path.join(skillDir, 'SKILL.md');
    const validation = validateSkillContent(skillPath);

    console.log(`   ✅ Skill file exists`);
    console.log(`   ✅ Has valid structure`);
    console.log(`   📊 Content: ${validation.lines} lines`);

    if (validation.warnings.length > 0) {
      console.log('   ⚠️  Warnings:');
      validation.warnings.forEach(w => console.log(`      - ${w}`));
    }
  }

  // GUARDRAIL: Check orphan status
  if (!config.noOrphanCheck && config.agent) {
    console.log('\n📋 Assignment Verification:');
    checkOrphanStatus(name);
  } else if (!config.noOrphanCheck && !config.agent) {
    console.log('\n⚠️  REMINDER: Assign this skill to an agent using:');
    console.log(
      `   node .claude/skills/skill-creator/scripts/create.cjs --assign "${name}" --agent "<agent-name>"`
    );
  }

  console.log(`\n📝 Next steps:`);
  if (config.originalRequest) {
    console.log(`   1. Use the spawn command above to complete the original task`);
  } else {
    console.log(`   1. Edit ${skillPath} to customize capabilities`);
  }
  console.log(`   2. Implement logic in scripts/main.cjs`);
  if (hooks) {
    console.log(`   3. Customize hooks in hooks/`);
    if (!config.registerHooks) {
      console.log(`   4. Register hooks: node create.cjs --register-hooks "${name}"`);
    }
  }
  if (schemas) {
    console.log(`   ${hooks ? '5' : '3'}. Define schemas in schemas/`);
    if (!config.registerSchemas) {
      console.log(
        `   ${hooks ? '6' : '4'}. Register schemas: node create.cjs --register-schemas "${name}"`
      );
    }
  }
  console.log(`   Test with: /${name}`);

  // Auto-assign to relevant agents unless disabled
  if (!config.noAutoAssign) {
    autoAssignToAgents(name, description);
  }

  // Hook assessment (suggest additional hooks based on skill keywords)
  if (!config.noHookAssessment) {
    assessHooksForSkill(name, description);
  }

  return skillDir;
}

/**
 * Assess and suggest hooks for a skill based on keywords
 */
function assessHooksForSkill(skillName, skillDescription) {
  const text = `${skillName} ${skillDescription}`.toLowerCase();

  // Hook keyword patterns
  const hookPatterns = {
    financial: {
      keywords: ['payment', 'financial', 'money', 'transaction', 'billing'],
      suggestion: 'Consider PreToolUse hook for validation and PostToolUse for audit logging',
    },
    security: {
      keywords: ['security', 'auth', 'password', 'token', 'secret', 'credential'],
      suggestion: 'Consider PreToolUse hook for scope validation',
    },
    database: {
      keywords: ['database', 'migration', 'schema', 'sql', 'query'],
      suggestion: 'Consider PreToolUse hook for backup/dry-run checks',
    },
    deployment: {
      keywords: ['deploy', 'release', 'production', 'publish'],
      suggestion: 'Consider PreToolUse hook for approval gates',
    },
    infrastructure: {
      keywords: ['terraform', 'kubernetes', 'docker', 'cloud', 'aws', 'gcp'],
      suggestion: 'Consider PreToolUse hook to require plan before apply',
    },
  };

  const matchedPatterns = [];

  for (const [category, pattern] of Object.entries(hookPatterns)) {
    if (pattern.keywords.some(kw => text.includes(kw))) {
      matchedPatterns.push({ category, ...pattern });
    }
  }

  if (matchedPatterns.length > 0) {
    console.log('\n💡 Hook Suggestions:');
    for (const match of matchedPatterns) {
      console.log(`   [${match.category}] ${match.suggestion}`);
    }
    console.log('\n   Run full assessment:');
    console.log(
      `   node .claude/tools/ecosystem-assessor/assess-ecosystem.mjs --type skill --name "${skillName}" --description "${skillDescription}"`
    );
  }
}

/**
 * Agent-Skill Relevance Matrix
 * Maps skill keywords to relevant agents
 */
const AGENT_SKILL_RELEVANCE = {
  // Developer agents get testing/debugging/git skills
  developer: ['test', 'tdd', 'debug', 'git', 'code', 'lint', 'style', 'format'],
  // QA gets testing/validation skills
  qa: ['test', 'tdd', 'validate', 'coverage', 'quality', 'check'],
  // Planner gets planning/analysis/documentation skills
  planner: ['plan', 'sequential', 'thinking', 'analysis', 'doc', 'diagram', 'context'],
  // Architect gets design/architecture/documentation skills
  architect: ['architect', 'design', 'diagram', 'doc', 'pattern', 'structure'],
  // Security-architect gets security/compliance skills
  'security-architect': ['security', 'audit', 'compliance', 'vulnerability', 'auth', 'crypto'],
  // DevOps gets infrastructure/deployment skills
  devops: [
    'docker',
    'kubernetes',
    'k8s',
    'terraform',
    'aws',
    'gcloud',
    'cloud',
    'deploy',
    'ci',
    'cd',
    'pipeline',
  ],
  // DevOps-troubleshooter gets debugging/monitoring skills
  'devops-troubleshooter': ['debug', 'troubleshoot', 'log', 'monitor', 'alert', 'incident'],
  // Incident-responder gets incident/communication skills
  'incident-responder': [
    'incident',
    'runbook',
    'postmortem',
    'oncall',
    'alert',
    'slack',
    'notification',
  ],
};

/**
 * Auto-assign skill to relevant agents based on name and description
 */
function autoAssignToAgents(skillName, skillDescription) {
  console.log('\n🔍 Auto-assigning skill to relevant agents...');

  const textToMatch = `${skillName} ${skillDescription}`.toLowerCase();
  const matchedAgents = [];

  // Check each agent's relevance keywords
  for (const [agent, keywords] of Object.entries(AGENT_SKILL_RELEVANCE)) {
    for (const keyword of keywords) {
      if (textToMatch.includes(keyword)) {
        matchedAgents.push(agent);
        break; // Only add once per agent
      }
    }
  }

  if (matchedAgents.length === 0) {
    console.log('   No matching agents found based on skill keywords');
    console.log(
      '   Use --assign to manually assign: node create.cjs --assign "' +
        skillName +
        '" --agent "agent-name"'
    );
    return;
  }

  console.log(`   Found ${matchedAgents.length} relevant agent(s): ${matchedAgents.join(', ')}`);

  // Assign to each matched agent
  for (const agent of matchedAgents) {
    try {
      assignSkillToAgentSilent(skillName, agent);
      console.log(`   ✅ Assigned to ${agent}`);
    } catch (e) {
      console.log(`   ⚠️  Could not assign to ${agent}: ${e.message}`);
    }
  }

  // Also update agent workflow to include skill loading
  console.log(
    '\n💡 Note: Agents with this skill will automatically load it via "Step 0: Load Skills"'
  );
}

/**
 * Silent version of assignSkillToAgent (no console output, returns success boolean)
 */
function assignSkillToAgentSilent(skillName, agentName) {
  const skillDir = path.join(SKILLS_DIR, skillName);
  if (!fs.existsSync(skillDir)) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const agentCategories = ['core', 'specialized', 'domain', 'orchestrators'];
  let agentPath = null;

  for (const category of agentCategories) {
    const candidatePath = path.join(AGENTS_DIR, category, `${agentName}.md`);
    if (fs.existsSync(candidatePath)) {
      agentPath = candidatePath;
      break;
    }
  }

  if (!agentPath) {
    throw new Error(`Agent not found: ${agentName}`);
  }

  let content = fs.readFileSync(agentPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error('Agent file missing frontmatter');
  }

  const frontmatter = frontmatterMatch[1];
  const skillsMatch = frontmatter.match(/skills:\n((?:\s+-\s+.+\n)*)/);

  if (skillsMatch) {
    if (skillsMatch[1].includes(skillName)) {
      // Already assigned
      return true;
    }
    const newSkillEntry = `  - ${skillName}\n`;
    content = content.replace(skillsMatch[0], skillsMatch[0] + newSkillEntry);
  } else {
    const newSkillsSection = `skills:\n  - ${skillName}\n`;
    content = content.replace(/^(---\n[\s\S]*?)(\n---)/, `$1${newSkillsSection}$2`);
  }

  fs.writeFileSync(agentPath, content);
  formatFile(agentPath);

  return true;
}

/**
 * Validate a skill definition against the standard
 */
function validateSkill(skillPath) {
  console.log(`\n🔍 Validating skill at: ${skillPath}`);

  const errors = [];
  const warnings = [];

  // Check SKILL.md exists
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    errors.push('Missing required file: SKILL.md');
    console.log('\n❌ Validation FAILED: SKILL.md not found');
    return false;
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');

  // Check frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    errors.push('Missing YAML frontmatter');
  } else {
    const frontmatter = frontmatterMatch[1];

    // Required fields
    if (!frontmatter.includes('name:')) {
      errors.push('Missing required field: name');
    } else {
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      if (nameMatch && !/^[a-z][a-z0-9-]*$/.test(nameMatch[1].trim())) {
        errors.push('Invalid name format: must be lowercase-with-hyphens');
      }
    }

    if (!frontmatter.includes('description:')) {
      errors.push('Missing required field: description');
    }

    // Recommended fields
    if (!frontmatter.includes('version:')) {
      warnings.push('Missing recommended field: version');
    }
    if (!frontmatter.includes('tools:') && !frontmatter.includes('allowed-tools:')) {
      warnings.push('Missing recommended field: tools');
    }

    // Advisory Ajv schema validation (graceful degradation)
    if (_validateData) {
      try {
        const yaml = require('js-yaml');
        const frontmatterObj = yaml.load(frontmatter);
        if (frontmatterObj && typeof frontmatterObj === 'object') {
          const schemaResult = _validateData(frontmatterObj, SKILL_SCHEMA_PATH);
          if (schemaResult && !schemaResult.valid && !schemaResult.skipped) {
            for (const err of schemaResult.errors || []) {
              warnings.push(`Schema: ${err.path} ${err.message}`);
            }
          }
        }
      } catch (_e) {
        // js-yaml not available or parse error -- skip schema validation
      }
    }
  }

  // Check required sections
  const requiredSections = ['<identity>', '<capabilities>', '<instructions>', '<examples>'];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      warnings.push(`Missing recommended section: ${section}`);
    }
  }

  // Check Memory Protocol
  if (!content.includes('Memory Protocol')) {
    warnings.push('Missing Memory Protocol section');
  }

  // Check scripts directory
  const scriptsDir = path.join(skillPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    warnings.push('Missing scripts/ directory (recommended)');
  }

  // Report results
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`   - ${e}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (errors.length === 0) {
    console.log('\n✅ Skill validation passed!');
    if (warnings.length > 0) {
      console.log(`   (${warnings.length} warning(s) - consider addressing)`);
    }
    return true;
  }

  return false;
}

/**
 * Convert an external codebase to a standardized skill
 */
function convertCodebase(codebasePath, skillName) {
  console.log(`\n🔄 Converting codebase to skill`);
  console.log(`   Source: ${codebasePath}`);
  console.log(`   Target: ${skillName}`);

  if (!fs.existsSync(codebasePath)) {
    console.error(`❌ Codebase path not found: ${codebasePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(codebasePath);
  if (!stats.isDirectory()) {
    console.error('❌ Codebase path must be a directory');
    process.exit(1);
  }

  // Analyze codebase structure
  console.log('\n📂 Analyzing codebase structure...');

  const analysis = {
    hasPackageJson: fs.existsSync(path.join(codebasePath, 'package.json')),
    hasReadme: fs.existsSync(path.join(codebasePath, 'README.md')),
    hasSrc: fs.existsSync(path.join(codebasePath, 'src')),
    hasLib: fs.existsSync(path.join(codebasePath, 'lib')),
    jsFiles: [],
    tsFiles: [],
    mdFiles: [],
    description: '',
    capabilities: [],
  };

  // Find relevant files
  function walkDir(dir, fileList = { js: [], ts: [], md: [] }) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath, fileList);
      } else if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')) {
        fileList.js.push(filePath);
      } else if (file.endsWith('.ts')) {
        fileList.ts.push(filePath);
      } else if (file.endsWith('.md')) {
        fileList.md.push(filePath);
      }
    }
    return fileList;
  }

  const fileList = walkDir(codebasePath);
  analysis.jsFiles = fileList.js;
  analysis.tsFiles = fileList.ts;
  analysis.mdFiles = fileList.md;

  console.log(`   Found ${analysis.jsFiles.length} JS files`);
  console.log(`   Found ${analysis.tsFiles.length} TS files`);
  console.log(`   Found ${analysis.mdFiles.length} MD files`);

  // Try to extract description from README or package.json
  if (analysis.hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(codebasePath, 'package.json'), 'utf-8'));
      analysis.description = pkg.description || '';
      console.log(`   Extracted description from package.json`);
    } catch (_e) {
      // Ignore
    }
  }

  if (!analysis.description && analysis.hasReadme) {
    try {
      const readme = fs.readFileSync(path.join(codebasePath, 'README.md'), 'utf-8');
      // Extract first paragraph after title
      const match = readme.match(/^#[^#].*\n+([^\n#]+)/);
      if (match) {
        analysis.description = match[1].trim().slice(0, 200);
        console.log(`   Extracted description from README`);
      }
    } catch (_e) {
      // Ignore
    }
  }

  if (!analysis.description) {
    analysis.description = `Skill converted from ${path.basename(codebasePath)} codebase`;
  }

  // Create standardized skill
  console.log('\n🔧 Creating standardized skill structure...');

  const skillDir = path.join(SKILLS_DIR, skillName);
  if (fs.existsSync(skillDir)) {
    console.error(`❌ Skill "${skillName}" already exists`);
    process.exit(1);
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });

  // Generate SKILL.md
  const skillContent = generateSkillContent({
    name: skillName,
    description: analysis.description,
    tools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
    capabilities: [
      `Converted from ${path.basename(codebasePath)}`,
      'Integrates with agent ecosystem',
      'Follows standardized skill structure',
    ],
    steps: [
      { title: 'Initialize', description: 'Load configuration and prepare execution context' },
      {
        title: 'Execute Core Logic',
        description: 'Run the main functionality from the converted codebase',
      },
      {
        title: 'Return Results',
        description: 'Format and return results in standardized format',
      },
    ],
  });

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
  console.log('   ✅ Created SKILL.md');

  // Copy main entry point if found
  const entryPoints = ['index.js', 'main.js', 'cli.js', 'index.cjs', 'main.cjs'];
  let mainScript = null;

  for (const entry of entryPoints) {
    const entryPath = path.join(codebasePath, entry);
    if (fs.existsSync(entryPath)) {
      mainScript = fs.readFileSync(entryPath, 'utf-8');
      console.log(`   Found entry point: ${entry}`);
      break;
    }
  }

  // Also check src/ and lib/
  if (!mainScript) {
    for (const dir of ['src', 'lib']) {
      for (const entry of entryPoints) {
        const entryPath = path.join(codebasePath, dir, entry);
        if (fs.existsSync(entryPath)) {
          mainScript = fs.readFileSync(entryPath, 'utf-8');
          console.log(`   Found entry point: ${dir}/${entry}`);
          break;
        }
      }
      if (mainScript) break;
    }
  }

  // Generate wrapper script
  const wrapperScript = generateScriptContent(skillName, analysis.description);
  fs.writeFileSync(path.join(skillDir, 'scripts', 'main.cjs'), wrapperScript);
  console.log('   ✅ Created scripts/main.cjs');

  // Copy original source as reference
  if (mainScript) {
    fs.writeFileSync(path.join(skillDir, 'references', 'original-entry.js'), mainScript);
    console.log('   ✅ Copied original entry point to references/');
  }

  // Copy README if exists
  if (analysis.hasReadme) {
    fs.copyFileSync(
      path.join(codebasePath, 'README.md'),
      path.join(skillDir, 'references', 'original-README.md')
    );
    console.log('   ✅ Copied README to references/');
  }

  // Format all files
  formatDirectory(skillDir);

  console.log(`\n✅ Codebase converted to standardized skill!`);
  console.log(`\n📁 Structure created:`);
  console.log(`   ${skillDir}/`);
  console.log(`   ├── SKILL.md`);
  console.log(`   ├── scripts/`);
  console.log(`   │   └── main.cjs`);
  console.log(`   └── references/`);
  console.log(`       ├── original-entry.js (if found)`);
  console.log(`       └── original-README.md (if found)`);

  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review and customize SKILL.md`);
  console.log(`   2. Integrate original logic into scripts/main.cjs`);
  console.log(`   3. Validate with: node create.cjs --validate "${skillDir}"`);
  console.log(`   4. Test with: /${skillName}`);

  return skillDir;
}

/**
 * Install skill from GitHub
 * SEC-009 FIX: Uses spawnSync with shell:false to prevent command injection
 */
function installSkill(repoUrl) {
  console.log(`\n📦 Installing skill from: ${repoUrl}`);

  // SEC-009: Validate URL before execution
  if (!isUrlSafe(repoUrl)) {
    console.error('❌ Invalid repository URL (contains unsafe characters)');
    process.exit(1);
  }

  const repoName = repoUrl
    .replace(/\.git$/, '')
    .split('/')
    .pop();
  const skillName = repoName.replace(/^claude-skill-/, '').replace(/^skill-/, '');
  const targetDir = path.join(SKILLS_DIR, skillName);

  // SEC-009: Validate target directory path
  if (!isPathSafe(targetDir)) {
    console.error('❌ Invalid target directory (contains unsafe characters)');
    process.exit(1);
  }

  if (fs.existsSync(targetDir)) {
    console.error(`❌ Skill directory already exists: ${targetDir}`);
    process.exit(1);
  }

  try {
    console.log('   Cloning repository...');
    // SEC-009: Use spawnSync with array args and shell:false
    const result = spawnSync('git', ['clone', repoUrl, targetDir], {
      stdio: 'pipe',
      shell: false, // CRITICAL: Prevents shell interpretation
    });

    if (result.status !== 0) {
      const errorMsg = result.stderr ? result.stderr.toString() : 'Unknown error';
      throw new Error(`git clone failed: ${errorMsg}`);
    }

    // Remove .git directory
    const gitDir = path.join(targetDir, '.git');
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true });
    }

    // Validate the skill
    if (!validateSkill(targetDir)) {
      console.log('\n⚠️  Skill installed but validation failed.');
      console.log('   Consider converting to standardized structure:');
      console.log(`   node create.cjs --convert-codebase "${targetDir}" --name "${skillName}-std"`);
    }

    console.log(`\n✅ Skill "${skillName}" installed!`);
    return targetDir;
  } catch (error) {
    console.error(`❌ Failed to install skill: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Assign skill to an agent
 */
function assignSkillToAgent(skillName, agentName) {
  console.log(`\n🔗 Assigning skill "${skillName}" to agent "${agentName}"`);

  const skillDir = path.join(SKILLS_DIR, skillName);
  if (!fs.existsSync(skillDir)) {
    console.error(`❌ Skill not found: ${skillName}`);
    process.exit(1);
  }

  const agentCategories = ['core', 'specialized', 'domain', 'orchestrators'];
  let agentPath = null;

  for (const category of agentCategories) {
    const candidatePath = path.join(AGENTS_DIR, category, `${agentName}.md`);
    if (fs.existsSync(candidatePath)) {
      agentPath = candidatePath;
      break;
    }
  }

  if (!agentPath) {
    console.error(`❌ Agent not found: ${agentName}`);
    console.log('   Available agents:');
    agentCategories.forEach(cat => {
      const catPath = path.join(AGENTS_DIR, cat);
      if (fs.existsSync(catPath)) {
        fs.readdirSync(catPath)
          .filter(f => f.endsWith('.md'))
          .forEach(f => console.log(`   - ${cat}/${f.replace('.md', '')}`));
      }
    });
    process.exit(1);
  }

  let content = fs.readFileSync(agentPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    console.error('❌ Agent file missing frontmatter');
    process.exit(1);
  }

  const frontmatter = frontmatterMatch[1];
  const skillsMatch = frontmatter.match(/skills:\n((?:\s+-\s+.+\n)*)/);

  if (skillsMatch) {
    if (skillsMatch[1].includes(skillName)) {
      console.log(`⚠️  Skill "${skillName}" already assigned to agent "${agentName}"`);
      return;
    }
    const newSkillEntry = `  - ${skillName}\n`;
    content = content.replace(skillsMatch[0], skillsMatch[0] + newSkillEntry);
  } else {
    const newSkillsSection = `skills:\n  - ${skillName}\n`;
    content = content.replace(/^(---\n[\s\S]*?)(\n---)/, `$1${newSkillsSection}$2`);
  }

  fs.writeFileSync(agentPath, content);
  formatFile(agentPath);

  console.log(`✅ Skill "${skillName}" assigned to agent "${agentName}"`);
}

/**
 * List all available skills
 */
function listSkills() {
  console.log('\n📚 Available Skills:\n');

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log('   No skills directory found.');
    return;
  }

  const skills = fs.readdirSync(SKILLS_DIR).filter(f => {
    const skillPath = path.join(SKILLS_DIR, f);
    return fs.statSync(skillPath).isDirectory() && fs.existsSync(path.join(skillPath, 'SKILL.md'));
  });

  if (skills.length === 0) {
    console.log('   No skills found.');
    return;
  }

  skills.forEach(skill => {
    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    const descMatch = content.match(/description:\s*(.+)/);
    const desc = descMatch ? descMatch[1].trim().slice(0, 60) : 'No description';

    // Check if skill follows standard structure
    const hasScripts = fs.existsSync(path.join(SKILLS_DIR, skill, 'scripts'));
    const hasIdentity = content.includes('<identity>');
    const isStandard = hasScripts && hasIdentity;

    console.log(`   ${isStandard ? '✅' : '⚠️ '} ${skill}`);
    console.log(`      ${desc}${desc.length >= 60 ? '...' : ''}`);
    console.log('');
  });

  console.log('   Legend: ✅ = Standardized structure, ⚠️  = Non-standard');
}

/**
 * Calculate similarity between two strings using Jaccard index
 */
function calculateSimilarity(str1, str2) {
  const words1 = new Set(
    str1
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
  );
  const words2 = new Set(
    str2
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
  );

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Get all skills with metadata
 */
function getAllSkills() {
  const skills = [];

  if (!fs.existsSync(SKILLS_DIR)) return skills;

  const dirs = fs.readdirSync(SKILLS_DIR).filter(f => {
    const skillPath = path.join(SKILLS_DIR, f);
    return fs.statSync(skillPath).isDirectory() && fs.existsSync(path.join(skillPath, 'SKILL.md'));
  });

  for (const dir of dirs) {
    const skillPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');

    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);
    const toolsMatch = content.match(/^tools:\s*\[(.+)\]$/m);

    const name = nameMatch ? nameMatch[1].trim() : dir;
    const description = descMatch ? descMatch[1].trim() : '';
    const tools = toolsMatch ? toolsMatch[1].split(',').map(t => t.trim()) : [];

    // Extract keywords
    const keywords = new Set();
    name.split('-').forEach(part => keywords.add(part.toLowerCase()));
    description
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
      .forEach(w => keywords.add(w));

    skills.push({
      name,
      dir,
      description,
      tools,
      keywords: Array.from(keywords),
      filePath: skillPath,
      content,
      hasScripts: fs.existsSync(path.join(SKILLS_DIR, dir, 'scripts')),
      hasHooks: fs.existsSync(path.join(SKILLS_DIR, dir, 'hooks')),
      hasSchemas: fs.existsSync(path.join(SKILLS_DIR, dir, 'schemas')),
      hasMemoryProtocol: content.includes('Memory Protocol'),
    });
  }

  return skills;
}

/**
 * Check if two skills share a common name prefix (domain-based overlap)
 */
function shareNamePrefix(name1, name2) {
  const parts1 = name1.split('-');
  const parts2 = name2.split('-');

  // Check if first part (domain) matches
  if (parts1[0] === parts2[0] && parts1[0].length > 2) {
    return { shared: true, prefix: parts1[0] };
  }
  return { shared: false, prefix: null };
}

/**
 * Analyze all skills for overlap and redundancy
 */
function analyzeSkills() {
  console.log('\n🔍 Analyzing skills for overlap and redundancy...\n');

  const skills = getAllSkills();
  const overlaps = [];
  const recommendations = [];

  // Compare each pair of skills
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const skill1 = skills[i];
      const skill2 = skills[j];

      // Check for shared name prefix (domain overlap)
      const prefixCheck = shareNamePrefix(skill1.name, skill2.name);

      // Calculate similarity scores
      const nameSimilarity = calculateSimilarity(skill1.name, skill2.name);
      const descSimilarity = calculateSimilarity(skill1.description, skill2.description);
      const keywordOverlap = calculateSimilarity(
        skill1.keywords.join(' '),
        skill2.keywords.join(' ')
      );

      // Check for tool overlap
      const sharedTools = skill1.tools.filter(t => skill2.tools.includes(t));
      const toolOverlapRatio =
        Math.max(skill1.tools.length, skill2.tools.length) > 0
          ? sharedTools.length / Math.max(skill1.tools.length, skill2.tools.length)
          : 0;

      // Overall similarity score (boost if they share domain prefix)
      let overallSimilarity =
        nameSimilarity * 0.2 + descSimilarity * 0.4 + keywordOverlap * 0.3 + toolOverlapRatio * 0.1;

      // Boost similarity if skills share a domain prefix (e.g., github-ops and github-mcp)
      if (prefixCheck.shared) {
        overallSimilarity = Math.max(overallSimilarity, 0.45); // Force into review range
      }

      if (
        overallSimilarity > 0.3 ||
        keywordOverlap > 0.4 ||
        descSimilarity > 0.5 ||
        prefixCheck.shared
      ) {
        overlaps.push({
          skill1: skill1.name,
          skill2: skill2.name,
          similarity: Math.round(overallSimilarity * 100),
          nameSimilarity: Math.round(nameSimilarity * 100),
          descSimilarity: Math.round(descSimilarity * 100),
          keywordOverlap: Math.round(keywordOverlap * 100),
          sharedTools,
          sharedKeywords: skill1.keywords.filter(k => skill2.keywords.includes(k)),
          sharedPrefix: prefixCheck.prefix,
        });
      }
    }
  }

  // Sort by similarity (highest first)
  overlaps.sort((a, b) => b.similarity - a.similarity);

  if (overlaps.length === 0) {
    console.log('✅ No significant overlaps detected between skills.\n');
    return { overlaps: [], recommendations: [] };
  }

  console.log(`⚠️  Found ${overlaps.length} potential overlap(s):\n`);

  for (const overlap of overlaps) {
    console.log(`📊 ${overlap.skill1} ↔ ${overlap.skill2}`);
    console.log(`   Overall Similarity: ${overlap.similarity}%`);
    if (overlap.sharedPrefix) {
      console.log(
        `   ⚠️  SHARED DOMAIN PREFIX: "${overlap.sharedPrefix}-*" (potential redundancy)`
      );
    }
    console.log(`   - Name similarity: ${overlap.nameSimilarity}%`);
    console.log(`   - Description similarity: ${overlap.descSimilarity}%`);
    console.log(`   - Keyword overlap: ${overlap.keywordOverlap}%`);
    if (overlap.sharedTools.length > 0) {
      console.log(`   - Shared tools: ${overlap.sharedTools.join(', ')}`);
    }
    if (overlap.sharedKeywords.length > 0) {
      console.log(`   - Shared keywords: ${overlap.sharedKeywords.slice(0, 10).join(', ')}`);
    }

    // Generate recommendation
    if (overlap.similarity >= 60) {
      const rec = {
        type: 'merge',
        skills: [overlap.skill1, overlap.skill2],
        reason: `High similarity (${overlap.similarity}%) suggests these skills could be merged`,
        command: `node create.cjs --merge "${overlap.skill1}" "${overlap.skill2}"`,
      };
      recommendations.push(rec);
      console.log(`   🔧 RECOMMENDATION: Merge these skills`);
    } else if (overlap.similarity >= 40 || overlap.sharedPrefix) {
      const reason = overlap.sharedPrefix
        ? `Same domain "${overlap.sharedPrefix}" - review for consolidation`
        : `Moderate similarity (${overlap.similarity}%) - review for potential consolidation`;
      const rec = {
        type: 'review',
        skills: [overlap.skill1, overlap.skill2],
        reason,
        command: `node create.cjs --merge "${overlap.skill1}" "${overlap.skill2}" --as "${overlap.sharedPrefix || 'combined'}"`,
      };
      recommendations.push(rec);
      console.log(`   📝 RECOMMENDATION: Review for potential consolidation`);
    }
    console.log('');
  }

  return { overlaps, recommendations };
}

/**
 * Update an existing skill
 */
function updateSkill(skillName, updates) {
  console.log(`\n🔄 Updating skill: ${skillName}\n`);

  const skills = getAllSkills();
  const skill = skills.find(s => s.name === skillName || s.dir === skillName);

  if (!skill) {
    console.error(`❌ Skill not found: ${skillName}`);
    console.log('\nAvailable skills:');
    skills.forEach(s => console.log(`  - ${s.name}`));
    process.exit(1);
  }

  let content = skill.content;

  // Update description if provided
  if (updates.description) {
    content = content.replace(/^description:\s*.+$/m, `description: ${updates.description}`);
    console.log(`   ✅ Updated description`);
  }

  // Add tools if provided
  if (updates.addTools) {
    const toolsToAdd = updates.addTools.split(',').map(t => t.trim());
    const existingTools = skill.tools || [];
    const newTools = [...new Set([...existingTools, ...toolsToAdd])];

    content = content.replace(/^tools:\s*\[.+\]$/m, `tools: [${newTools.join(', ')}]`);
    console.log(`   ✅ Added tools: ${toolsToAdd.join(', ')}`);
  }

  // Add capability if provided
  if (updates.addCapability) {
    const capMatch = content.match(/<capabilities>\n([\s\S]*?)<\/capabilities>/);
    if (capMatch) {
      const newCaps = capMatch[1].trim() + `\n- ${updates.addCapability}`;
      content = content.replace(
        /<capabilities>[\s\S]*?<\/capabilities>/,
        `<capabilities>\n${newCaps}\n</capabilities>`
      );
      console.log(`   ✅ Added capability: ${updates.addCapability}`);
    }
  }

  // Write updated content
  fs.writeFileSync(skill.filePath, content);
  formatFile(skill.filePath);

  console.log(`\n✅ Skill updated: ${skill.filePath}`);

  // Update memory
  const memoryPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
  if (fs.existsSync(memoryPath)) {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n## [${timestamp}] Skill Updated: ${skillName}\n\n- Updates applied: ${Object.keys(
      updates
    )
      .filter(k => updates[k])
      .join(', ')}\n- Location: \`${skill.filePath}\`\n\n`;
    const memContent = fs.readFileSync(memoryPath, 'utf-8');
    fs.writeFileSync(memoryPath, memContent + entry);
    console.log(`📝 Updated memory with change record`);
  }

  return skill.filePath;
}

/**
 * Find all dependencies for a skill
 */
function findSkillDependencies(skillName) {
  const dependencies = {
    agents: [],
    workflows: [],
    tools: [],
    schemas: [],
    hooks: [],
    settings: [],
  };

  // 1. Find agents that reference this skill
  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  if (fs.existsSync(agentsDir)) {
    const categories = ['core', 'specialized', 'domain', 'orchestrators'];
    for (const category of categories) {
      const categoryDir = path.join(agentsDir, category);
      if (!fs.existsSync(categoryDir)) continue;

      const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes(`- ${skillName}`) || content.includes(`"${skillName}"`)) {
          dependencies.agents.push({
            name: file.replace('.md', ''),
            path: filePath,
            category,
          });
        }
      }
    }
  }

  // 2. Find workflows that reference this skill
  const workflowsDir = path.join(CLAUDE_DIR, 'workflows');
  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(workflowsDir, file);
      // Check if workflow is for this skill or references it
      if (file.includes(skillName) || fs.readFileSync(filePath, 'utf-8').includes(skillName)) {
        dependencies.workflows.push({
          name: file,
          path: filePath,
        });
      }
    }
  }

  // 3. Find companion tools for this skill
  const toolsDir = path.join(CLAUDE_DIR, 'tools');
  if (fs.existsSync(toolsDir)) {
    const skillToolDir = path.join(toolsDir, skillName);
    if (fs.existsSync(skillToolDir)) {
      dependencies.tools.push({
        name: skillName,
        path: skillToolDir,
        files: fs.readdirSync(skillToolDir),
      });
    }
  }

  // 4. Find schemas that reference this skill
  const schemasDir = path.join(CLAUDE_DIR, 'schemas');
  if (fs.existsSync(schemasDir)) {
    const files = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (file.includes(skillName) || file.includes(`skill-${skillName}`)) {
        dependencies.schemas.push({
          name: file,
          path: path.join(schemasDir, file),
        });
      }
    }
  }

  // 5. Check settings.json for hook registrations
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.hooks) {
      for (const [hookType, hooks] of Object.entries(settings.hooks)) {
        if (Array.isArray(hooks)) {
          for (const hook of hooks) {
            if (hook.command && hook.command.includes(skillName)) {
              dependencies.hooks.push({
                type: hookType,
                command: hook.command,
              });
              dependencies.settings.push(settingsPath);
            }
          }
        }
      }
    }
  }

  // Remove duplicate settings paths
  dependencies.settings = [...new Set(dependencies.settings)];

  return dependencies;
}

/**
 * Update agent to replace old skill with new skill
 * Handles both frontmatter and workflow skill loading sections
 */
function updateAgentSkill(agentPath, oldSkill, newSkill) {
  let content = fs.readFileSync(agentPath, 'utf-8');

  // Replace in frontmatter skills list
  content = content.replace(new RegExp(`- ${oldSkill}\\b`, 'g'), `- ${newSkill}`);
  content = content.replace(new RegExp(`"${oldSkill}"`, 'g'), `"${newSkill}"`);

  // Replace in workflow skill loading paths
  // Matches: .claude/skills/old-skill/SKILL.md
  content = content.replace(
    new RegExp(`\\.claude/skills/${oldSkill}/SKILL\\.md`, 'g'),
    `.claude/skills/${newSkill}/SKILL.md`
  );

  // Also handle backtick-wrapped paths
  content = content.replace(
    new RegExp(`\`\\.claude/skills/${oldSkill}/SKILL\\.md\``, 'g'),
    `\`.claude/skills/${newSkill}/SKILL.md\``
  );

  fs.writeFileSync(agentPath, content);
  formatFile(agentPath);
}

/**
 * Merge two skills into one with full dependency handling
 */
function mergeSkills(skill1Name, skill2Name, newName, options = {}) {
  console.log(`\n🔄 Merging skills: ${skill1Name} + ${skill2Name}\n`);

  const skills = getAllSkills();
  const skill1 = skills.find(s => s.name === skill1Name || s.dir === skill1Name);
  const skill2 = skills.find(s => s.name === skill2Name || s.dir === skill2Name);

  if (!skill1) {
    console.error(`❌ Skill not found: ${skill1Name}`);
    process.exit(1);
  }
  if (!skill2) {
    console.error(`❌ Skill not found: ${skill2Name}`);
    process.exit(1);
  }

  // Determine merged name
  const mergedName = newName || `${skill1Name}-${skill2Name}`.replace(/-+/g, '-').slice(0, 30);

  // Find all dependencies for both skills
  console.log('🔍 Scanning for dependencies...\n');
  const deps1 = findSkillDependencies(skill1Name);
  const deps2 = findSkillDependencies(skill2Name);

  // Combine dependencies
  const allDeps = {
    agents: [...deps1.agents, ...deps2.agents],
    workflows: [...deps1.workflows, ...deps2.workflows],
    tools: [...deps1.tools, ...deps2.tools],
    schemas: [...deps1.schemas, ...deps2.schemas],
    hooks: [...deps1.hooks, ...deps2.hooks],
    settings: [...new Set([...deps1.settings, ...deps2.settings])],
  };

  // Report found dependencies
  const totalDeps =
    allDeps.agents.length +
    allDeps.workflows.length +
    allDeps.tools.length +
    allDeps.schemas.length +
    allDeps.hooks.length;

  if (totalDeps > 0) {
    console.log(`📋 Found ${totalDeps} dependencies that need updating:\n`);

    if (allDeps.agents.length > 0) {
      console.log(`   🤖 Agents (${allDeps.agents.length}):`);
      allDeps.agents.forEach(a => console.log(`      - ${a.name} (${a.category})`));
    }

    if (allDeps.workflows.length > 0) {
      console.log(`   📋 Workflows (${allDeps.workflows.length}):`);
      allDeps.workflows.forEach(w => console.log(`      - ${w.name}`));
    }

    if (allDeps.tools.length > 0) {
      console.log(`   🔧 Companion Tools (${allDeps.tools.length}):`);
      allDeps.tools.forEach(t => console.log(`      - ${t.name}/ (${t.files.length} files)`));
    }

    if (allDeps.schemas.length > 0) {
      console.log(`   📐 Schemas (${allDeps.schemas.length}):`);
      allDeps.schemas.forEach(s => console.log(`      - ${s.name}`));
    }

    if (allDeps.hooks.length > 0) {
      console.log(`   🪝 Hooks in settings.json (${allDeps.hooks.length}):`);
      allDeps.hooks.forEach(h => console.log(`      - ${h.type}: ${h.command.slice(0, 50)}...`));
    }
    console.log('');
  } else {
    console.log('   ✅ No external dependencies found\n');
  }

  // Combine tools (unique)
  const mergedTools = [...new Set([...skill1.tools, ...skill2.tools])];

  // Create merged description
  const mergedDescription = `Combined: ${skill1.description}. Also: ${skill2.description}`.slice(
    0,
    200
  );

  console.log(`📋 Merged skill configuration:`);
  console.log(`   Name: ${mergedName}`);
  console.log(`   Tools: ${mergedTools.join(', ')}`);
  console.log(`   Hooks: ${skill1.hasHooks || skill2.hasHooks}`);
  console.log(`   Schemas: ${skill1.hasSchemas || skill2.hasSchemas}`);
  console.log('');

  // Create the merged skill
  const skillDir = createSkill({
    name: mergedName,
    description: mergedDescription,
    tools: mergedTools.join(','),
    hooks: skill1.hasHooks || skill2.hasHooks,
    schemas: skill1.hasSchemas || skill2.hasSchemas,
    noWorkflow: false,
    noMemory: false,
    noAutoAssign: true, // Merge has its own agent update logic below
    noTool: !allDeps.tools.length, // Create tool if either had one
  });

  console.log(`\n✅ Created merged skill: ${skillDir}`);

  // Auto-update agents if --auto-update flag (or prompt)
  if (options.autoUpdate && allDeps.agents.length > 0) {
    console.log('\n🔄 Auto-updating agent assignments...');
    for (const agent of allDeps.agents) {
      // Determine which old skill this agent had
      const agentContent = fs.readFileSync(agent.path, 'utf-8');
      if (agentContent.includes(`- ${skill1Name}`)) {
        updateAgentSkill(agent.path, skill1Name, mergedName);
        console.log(`   ✅ Updated ${agent.name}: ${skill1Name} → ${mergedName}`);
      }
      if (agentContent.includes(`- ${skill2Name}`)) {
        updateAgentSkill(agent.path, skill2Name, mergedName);
        console.log(`   ✅ Updated ${agent.name}: ${skill2Name} → ${mergedName}`);
      }
    }
  }

  // Generate migration report
  console.log('\n' + '='.repeat(50));
  console.log('\n📝 MIGRATION CHECKLIST\n');

  if (allDeps.agents.length > 0 && !options.autoUpdate) {
    console.log('1. UPDATE AGENTS (replace old skills with merged skill):');
    for (const agent of allDeps.agents) {
      const agentContent = fs.readFileSync(agent.path, 'utf-8');
      const hasSkill1 = agentContent.includes(`- ${skill1Name}`);
      const hasSkill2 = agentContent.includes(`- ${skill2Name}`);
      if (hasSkill1 || hasSkill2) {
        const oldSkills = [hasSkill1 ? skill1Name : null, hasSkill2 ? skill2Name : null].filter(
          Boolean
        );
        console.log(`   # ${agent.name} (has: ${oldSkills.join(', ')})`);
        console.log(
          `   node .claude/tools/agent-creator/create-agent.mjs --update "${agent.name}" --remove-skills "${oldSkills.join(',')}" --add-skills "${mergedName}"`
        );
      }
    }
    console.log('');
  }

  if (allDeps.workflows.length > 0) {
    console.log('2. UPDATE/REMOVE WORKFLOWS:');
    for (const workflow of allDeps.workflows) {
      console.log(`   rm "${workflow.path}"  # Or update references to ${mergedName}`);
    }
    console.log('');
  }

  if (allDeps.tools.length > 0) {
    console.log('3. MIGRATE COMPANION TOOLS:');
    for (const tool of allDeps.tools) {
      console.log(`   # Review and merge logic from: ${tool.path}`);
      console.log(`   # Then remove: rm -rf "${tool.path}"`);
    }
    console.log('');
  }

  if (allDeps.schemas.length > 0) {
    console.log('4. UPDATE SCHEMAS:');
    for (const schema of allDeps.schemas) {
      const newSchemaName = schema.name
        .replace(skill1Name, mergedName)
        .replace(skill2Name, mergedName);
      console.log(`   mv "${schema.path}" ".claude/schemas/${newSchemaName}"`);
    }
    console.log('');
  }

  if (allDeps.hooks.length > 0) {
    console.log('5. UPDATE HOOKS IN settings.json:');
    console.log(`   # Edit .claude/settings.json and update hook commands`);
    console.log(`   # Replace "${skill1Name}" and "${skill2Name}" with "${mergedName}"`);
    console.log('');
  }

  console.log('6. DELETE ORIGINAL SKILLS (after verification):');
  console.log(`   rm -rf ".claude/skills/${skill1.dir}"`);
  console.log(`   rm -rf ".claude/skills/${skill2.dir}"`);
  console.log('');

  console.log('7. TEST THE MERGED SKILL:');
  console.log(`   /${mergedName}`);
  console.log('');

  // Record merge in memory
  const memoryPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
  if (fs.existsSync(memoryPath)) {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n## [${timestamp}] Skills Merged: ${skill1Name} + ${skill2Name} → ${mergedName}

- **Reason**: Consolidation of overlapping functionality
- **Dependencies found**: ${totalDeps} (${allDeps.agents.length} agents, ${allDeps.workflows.length} workflows, ${allDeps.tools.length} tools)
- **New skill location**: \`.claude/skills/${mergedName}/\`
- **Migration status**: ${options.autoUpdate ? 'Auto-updated agents' : 'Manual migration required'}

`;
    const memContent = fs.readFileSync(memoryPath, 'utf-8');
    fs.writeFileSync(memoryPath, memContent + entry);
    console.log('📝 Recorded merge in memory/learnings.md');
  }

  return skillDir;
}

/**
 * Generate recommendations for the entire skill ecosystem
 */
function generateSkillRecommendations() {
  console.log('\n📊 Generating Skill Ecosystem Recommendations\n');
  console.log('='.repeat(50) + '\n');

  const skills = getAllSkills();
  const { overlaps, recommendations } = analyzeSkills();

  console.log('\n' + '='.repeat(50));
  console.log('\n📋 SUMMARY\n');

  console.log(`Total skills: ${skills.length}`);
  console.log(`Potential overlaps: ${overlaps.length}`);
  console.log(`Recommendations: ${recommendations.length}`);

  if (recommendations.length > 0) {
    console.log('\n🔧 RECOMMENDED ACTIONS:\n');
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.type.toUpperCase()}] ${rec.skills.join(' + ')}`);
      console.log(`   Reason: ${rec.reason}`);
      console.log(`   Command: ${rec.command}`);
      console.log('');
    });
  }

  // Check for skills without Memory Protocol
  console.log('\n🧠 MEMORY PROTOCOL CHECK:\n');
  const skillsWithoutMemory = skills.filter(s => !s.hasMemoryProtocol);
  if (skillsWithoutMemory.length > 0) {
    console.log(`⚠️  ${skillsWithoutMemory.length} skill(s) missing Memory Protocol:`);
    skillsWithoutMemory.forEach(s => console.log(`   - ${s.name}`));
  } else {
    console.log('✅ All skills have Memory Protocol section');
  }

  // Check for skills without scripts
  console.log('\n📜 SCRIPTS CHECK:\n');
  const skillsWithoutScripts = skills.filter(s => !s.hasScripts);
  if (skillsWithoutScripts.length > 0) {
    console.log(`⚠️  ${skillsWithoutScripts.length} skill(s) have no scripts/ directory:`);
    skillsWithoutScripts.forEach(s => console.log(`   - ${s.name}`));
  } else {
    console.log('✅ All skills have scripts/ directory');
  }

  return { overlaps, recommendations };
}

/**
 * Convert a rule file (.mdc or .md) into a skill
 */
function convertRuleToSkill(rulePath, options = {}) {
  const content = fs.readFileSync(rulePath, 'utf-8');
  const fileName = path.basename(rulePath, path.extname(rulePath));

  // Parse frontmatter if present
  let description = '';
  let globs = '';
  let bodyContent = content;

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    bodyContent = frontmatterMatch[2];

    const descMatch = frontmatter.match(/description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();

    const globMatch = frontmatter.match(/globs:\s*(.+)/);
    if (globMatch) globs = globMatch[1].trim();
  }

  // Generate skill name from filename
  const skillName =
    options.name ||
    fileName
      .replace(/-cursorrules-prompt-file$/, '')
      .replace(/-cursorrules$/, '')
      .replace(/\.mdc$/, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase()
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  // Extract title from content if no description
  if (!description) {
    const titleMatch = bodyContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      description = titleMatch[1].trim();
    } else {
      description = `Guidelines for ${skillName.replace(/-/g, ' ')}`;
    }
  }

  // Determine tools based on content keywords
  const tools = ['Read', 'Write', 'Edit'];
  if (bodyContent.toLowerCase().includes('test')) tools.push('Bash');
  if (bodyContent.toLowerCase().includes('search') || bodyContent.toLowerCase().includes('find'))
    tools.push('Grep', 'Glob');

  console.log(`\n📜 Converting rule: ${fileName}`);
  console.log(`   Name: ${skillName}`);
  console.log(`   Description: ${description.slice(0, 60)}...`);

  // Create the skill directory
  const skillDir = path.join(SKILLS_DIR, skillName);
  if (fs.existsSync(skillDir) && !options.force) {
    console.log(`   ⚠️  Skill already exists: ${skillName} (use --force to overwrite)`);
    return null;
  }

  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Create SKILL.md with rule content embedded
  const skillContent = `---
name: ${skillName}
description: ${description.slice(0, 200)}
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [${tools.join(', ')}]
${globs ? `globs: ${globs}` : ''}
best_practices:
  - Follow the guidelines consistently
  - Apply rules during code review
  - Use as reference when writing new code
error_handling: graceful
streaming: supported
---

# ${skillName
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')} Skill

<identity>
You are a coding standards expert specializing in ${skillName.replace(/-/g, ' ')}.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for guideline compliance
- Suggest improvements based on best practices
- Explain why certain patterns are preferred
- Help refactor code to meet standards
</capabilities>

<instructions>
When reviewing or writing code, apply these guidelines:

${bodyContent}
</instructions>

<examples>
Example usage:
\`\`\`
User: "Review this code for ${skillName.replace(/-/g, ' ')} compliance"
Agent: [Analyzes code against guidelines and provides specific feedback]
\`\`\`
</examples>

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
\`\`\`

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

  // Create scripts directory with main.cjs
  const scriptsDir = path.join(skillDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  const mainScript = `#!/usr/bin/env node
/**
 * ${skillName} - Rule-based Skill
 * Converted from: ${path.basename(rulePath)}
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

if (options.help) {
  console.log(\`
${skillName} - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  ${description}
\`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for ${skillName}:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('${skillName} skill loaded. Use with Claude for code review.');
`;

  fs.writeFileSync(path.join(scriptsDir, 'main.cjs'), mainScript);

  // Create references directory with original rule
  const refsDir = path.join(skillDir, 'references');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.copyFileSync(rulePath, path.join(refsDir, path.basename(rulePath)));

  // Format the skill
  formatDirectory(skillDir);

  console.log(`   ✅ Created skill: ${skillDir}`);

  return skillDir;
}

/**
 * Batch convert rules from a directory
 */
function convertRulesDirectory(rulesDir, options = {}) {
  console.log(`\n📂 Converting rules from: ${rulesDir}\n`);

  if (!fs.existsSync(rulesDir)) {
    console.error(`❌ Directory not found: ${rulesDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
  const converted = [];
  const skipped = [];
  const errors = [];

  for (const entry of entries) {
    const entryPath = path.join(rulesDir, entry.name);

    if (entry.isFile() && (entry.name.endsWith('.mdc') || entry.name.endsWith('.md'))) {
      // Direct rule file
      try {
        const result = convertRuleToSkill(entryPath, options);
        if (result) {
          converted.push(entry.name);
        } else {
          skipped.push(entry.name);
        }
      } catch (e) {
        errors.push({ name: entry.name, error: e.message });
      }
    } else if (entry.isDirectory()) {
      // Check for rule files inside directory
      const subFiles = fs
        .readdirSync(entryPath)
        .filter(f => f.endsWith('.mdc') || f.endsWith('.md'));
      for (const subFile of subFiles) {
        try {
          const result = convertRuleToSkill(path.join(entryPath, subFile), options);
          if (result) {
            converted.push(`${entry.name}/${subFile}`);
          } else {
            skipped.push(`${entry.name}/${subFile}`);
          }
        } catch (e) {
          errors.push({ name: `${entry.name}/${subFile}`, error: e.message });
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 CONVERSION SUMMARY\n');
  console.log(`✅ Converted: ${converted.length}`);
  console.log(`⏭️  Skipped: ${skipped.length}`);
  console.log(`❌ Errors: ${errors.length}`);

  if (converted.length > 0) {
    console.log('\n📋 Converted skills:');
    converted.forEach(c => console.log(`   - ${c}`));
  }

  if (skipped.length > 0) {
    console.log('\n⏭️  Skipped (already exist):');
    skipped.forEach(s => console.log(`   - ${s}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`   - ${e.name}: ${e.error}`));
  }

  // Update memory
  const memoryPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
  if (fs.existsSync(memoryPath) && converted.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n## [${timestamp}] Rules Converted to Skills

- **Source**: \`${rulesDir}\`
- **Converted**: ${converted.length} rules
- **Skipped**: ${skipped.length} (already exist)
- **Skills created**: ${converted
      .map(c => c.split('/').pop().replace('.mdc', '').replace('.md', ''))
      .slice(0, 5)
      .join(', ')}${converted.length > 5 ? '...' : ''}

`;
    const memContent = fs.readFileSync(memoryPath, 'utf-8');
    fs.writeFileSync(memoryPath, memContent + entry);
  }

  return { converted, skipped, errors };
}

/**
 * Create workflow example for the skill
 */
function createWorkflowExample(name, _description, _skillDir) {
  const workflowsDir = path.join(CLAUDE_DIR, 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  const workflowPath = path.join(workflowsDir, `${name}-skill-workflow.md`);
  const titleCase = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const workflowContent = `# ${titleCase} Skill Workflow

## Overview
This workflow demonstrates how to use the **${name}** skill.

## Skill Location
\`.claude/skills/${name}/SKILL.md\`

## Invocation Methods

### Method 1: Slash Command (User-Invocable)
\`\`\`
/${name} [arguments]
\`\`\`

### Method 2: Via Agent Assignment
Agents with this skill in their \`skills:\` frontmatter can use it automatically.

### Method 3: Direct Script Execution
\`\`\`bash
node .claude/skills/${name}/scripts/main.cjs --help
\`\`\`

## Example Usage

1. **Basic Invocation**
   \`\`\`
   /${name}
   \`\`\`

2. **With Arguments**
   \`\`\`
   /${name} --option value
   \`\`\`

## Assigning to Agents

To give an agent this skill, add to the agent's frontmatter:

\`\`\`yaml
skills:
  - ${name}
\`\`\`

Or use the CLI:
\`\`\`bash
node .claude/skills/skill-creator/scripts/create.cjs --assign "${name}" --agent "developer"
\`\`\`

## Memory Integration
This skill follows the Memory Protocol:
- Reads: \`.claude/context/memory/learnings.md\`
- Writes to: \`learnings.md\`, \`issues.md\`, or \`decisions.md\`
`;

  fs.writeFileSync(workflowPath, workflowContent);
  console.log(`📋 Created workflow: ${workflowPath}`);
  return workflowPath;
}

/**
 * Update memory with new skill info
 */
function updateMemory(name, description, tools) {
  const memoryDir = path.join(CLAUDE_DIR, 'context', 'memory');
  const memoryPath = path.join(memoryDir, 'learnings.md');

  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(
      memoryPath,
      '# Learnings\n\nPatterns, solutions, and preferences learned during sessions.\n\n'
    );
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const toolsStr = Array.isArray(tools) ? tools.join(', ') : tools || 'Read, Write, Bash';
  const entry = `
## [${timestamp}] New Skill Created: ${name}

- **Description**: ${description}
- **Tools**: ${toolsStr}
- **Location**: \`.claude/skills/${name}/SKILL.md\`
- **Workflow**: \`.claude/workflows/${name}-skill-workflow.md\`
- **Invocation**: \`/${name}\` or via agent assignment

**Usage hint**: Use this skill for "${description.split('.')[0].toLowerCase()}".

`;

  const content = fs.readFileSync(memoryPath, 'utf-8');
  fs.writeFileSync(memoryPath, content + entry);
  console.log(`📝 Updated memory: ${memoryPath}`);
}

/**
 * Generate test command output for the skill
 */
function generateTestCommand(name, _description) {
  return `
--- TEST COMMAND ---
To test this skill, run:

  node .claude/skills/${name}/scripts/main.cjs --help

Or invoke via slash command:

  /${name}

--- END TEST COMMAND ---
`;
}

/**
 * Generate spawn command for using the skill
 */
function generateSkillSpawnCommand(name, originalRequest) {
  return {
    subagent_type: 'general-purpose',
    description: `Using ${name} skill for original task`,
    prompt: `You have access to the ${name} skill.

## Skill Definition
Read the skill definition: .claude/skills/${name}/SKILL.md

## Original Task
${originalRequest}

## Instructions
1. Read the skill definition to understand capabilities
2. Use the skill to complete the task
3. Follow the Memory Protocol
4. Record learnings when done
`,
  };
}

/**
 * Show skill structure documentation
 */
function showStructure() {
  if (fs.existsSync(STRUCTURE_PATH)) {
    const content = fs.readFileSync(STRUCTURE_PATH, 'utf-8');
    console.log(content);
  } else {
    console.log('❌ Structure documentation not found');
    console.log('   Expected at:', STRUCTURE_PATH);
  }
}

// Main execution
if (options.help) {
  console.log(`
Skill Creator Tool (Standardized)

Usage:
  node create.cjs --name "skill-name" --description "..." [options]
  node create.cjs --validate ".claude/skills/my-skill"
  node create.cjs --install "https://github.com/owner/skill-repo"
  node create.cjs --assign "skill-name" --agent "developer"
  node create.cjs --convert-codebase "/path/to/code" --name "new-skill"
  node create.cjs --convert-rule "/path/to/rule.mdc"
  node create.cjs --convert-rules "/path/to/rules-library"
  node create.cjs --register-hooks "skill-name"
  node create.cjs --register-schemas "skill-name"
  node create.cjs --list
  node create.cjs --show-structure

Create Options:
  --name            Skill name (required, lowercase-with-hyphens)
  --description     Skill description (required, min 20 chars)
  --tools           Comma-separated tools (default: Read,Write,Bash)
  --refs            Create references/ directory
  --hooks           Create hooks/ directory with pre/post execute hooks
  --schemas         Create schemas/ directory with input/output schemas
  --register-hooks  Also register hooks in settings.json
  --register-schemas Also register schemas in global schemas/

Self-Evolution Options:
  --original-request  The original user request (outputs spawn command for Task tool)
  --no-workflow       Skip creating workflow example
  --no-memory         Skip updating memory/learnings.md
  --no-auto-assign    Skip auto-assigning skill to relevant agents
  --no-hook-assessment Skip hook suggestions based on skill keywords
  --test              Output test command after creation

Tool Creation (auto-creates when skill is complex):
  --create-tool       Force creation of companion tool in .claude/tools/
  --no-tool           Skip companion tool creation even if complex

Validation:
  --validate        Path to skill directory to validate

Installation:
  --install         GitHub URL to install skill from

Assignment:
  --assign          Skill name to assign to agent
  --agent           Agent name to assign skill to

Registration:
  --register-hooks  Register an existing skill's hooks in settings.json
  --register-schemas Register an existing skill's schemas globally

Conversion:
  --convert-codebase  Path to external codebase to convert
  --name              Name for the converted skill

Rules Conversion:
  --convert-rule      Convert a single rule file (.mdc, .md) to a skill
  --convert-rules     Convert all rules in a directory to skills
  --force             Overwrite existing skills during conversion

Analysis & Maintenance:
  --analyze         Analyze all skills for overlap and redundancy
  --recommend       Generate ecosystem recommendations (analyze + health checks)
  --update <name>   Update an existing skill
  --merge <s1> <s2> Merge two skills into one
  --as <name>       New name for merged skill (use with --merge)
  --auto-update     Auto-update agent assignments during merge

Update Options (use with --update <skill-name>):
  --add-tools       Comma-separated tools to add
  --add-capability  New capability to add
  --description     New description

Other:
  --list            List all available skills
  --show-structure  Show standardized skill structure documentation
  --help            Show this help

Examples:
  # Create a skill with hooks and schemas
  node create.cjs --name "data-validator" \\
    --description "Validate and sanitize data inputs" \\
    --hooks --schemas

  # Create skill and register hooks immediately
  node create.cjs --name "security-check" \\
    --description "Security validation before operations" \\
    --hooks --register-hooks

  # Create skill with original request (self-evolution)
  node create.cjs --name "pdf-extractor" \\
    --description "Extract text and images from PDF documents" \\
    --original-request "Extract the table data from invoice.pdf"

  # Register existing skill's hooks
  node create.cjs --register-hooks "my-skill"

  # Convert external codebase to skill
  node create.cjs --convert-codebase "./my-tool" --name "my-tool-skill"

  # Validate a skill
  node create.cjs --validate ".claude/skills/my-skill"

  # Assign skill to agent
  node create.cjs --assign "my-skill" --agent "developer"

Tool Auto-Creation:
  Complex skills automatically get a companion tool in .claude/tools/
  Complexity is detected when skill has 2+ of:
  - Pre/post execution hooks
  - Input/output schemas
  - 6+ tools specified
  - Command-line arguments
  - Description with complex keywords (orchestration, pipeline, workflow, etc.)

Self-Evolution Flow:
  When called with --original-request, the tool:
  1. Creates the skill with standardized structure
  2. Creates a workflow example in .claude/workflows/
  3. Updates .claude/context/memory/learnings.md
  4. Auto-creates companion tool if skill is complex
  5. Outputs a Task spawn command to use the skill for the original request

Examples with Tool Creation:
  # Create a complex skill (auto-creates tool)
  node create.cjs --name "data-pipeline" \\
    --description "Orchestrate data processing pipeline with validation" \\
    --hooks --schemas

  # Force tool creation for a simple skill
  node create.cjs --name "simple-util" \\
    --description "A simple utility skill that needs CLI access" \\
    --create-tool

  # Skip tool creation for a complex skill
  node create.cjs --name "complex-but-no-tool" \\
    --description "Complex integration skill without CLI tool" \\
    --hooks --schemas --no-tool

Self-Healing Ecosystem:
  The skill-creator can maintain a clean, non-redundant skill ecosystem:

  1. ANALYZE: Detect overlapping/similar skills
     node create.cjs --analyze

  2. RECOMMEND: Get actionable recommendations
     node create.cjs --recommend

  3. UPDATE: Add new capabilities to existing skills
     node create.cjs --update "github-ops" --add-tools "WebFetch"

  4. MERGE: Combine redundant skills into one
     node create.cjs --merge "github-ops" "github-mcp" --as "github-expert"

Rules Conversion:
  Convert old rule files (.mdc, .md) into standardized skills:

  # Convert a single rule file
  node create.cjs --convert-rule "/path/to/rule.mdc"

  # Convert all rules in a directory
  node create.cjs --convert-rules "/path/to/rules-library"

  # Force overwrite existing skills
  node create.cjs --convert-rules "/path/to/rules" --force

Examples:
  # Analyze skills for redundancy
  node create.cjs --analyze

  # Get full ecosystem recommendations
  node create.cjs --recommend

  # Update an existing skill
  node create.cjs --update "developer-skill" --add-capability "Code review automation"

  # Merge similar skills
  node create.cjs --merge "github-ops" "github-mcp" --as "github"

  # Convert legacy rules to skills
  node create.cjs --convert-rules ".claude.archive/rules-library"
`);
  process.exit(0);
}

if (options['show-structure']) {
  showStructure();
  process.exit(0);
}

if (options.analyze) {
  analyzeSkills();
  process.exit(0);
}

if (options.recommend) {
  generateSkillRecommendations();
  process.exit(0);
}

if (options.merge) {
  // --merge takes two skill names
  const skill1 = options.merge;
  const mergeIndex = args.indexOf('--merge');
  const skill2 = args[mergeIndex + 2]; // Get the second skill name
  if (!skill2 || skill2.startsWith('--')) {
    console.error('❌ --merge requires two skill names: --merge "skill1" "skill2"');
    process.exit(1);
  }
  mergeSkills(skill1, skill2, options.as, {
    autoUpdate: options['auto-update'],
    dryRun: options['dry-run'],
  });
  process.exit(0);
}

if (options.update) {
  updateSkill(options.update, {
    description: options.description,
    addTools: options['add-tools'],
    addCapability: options['add-capability'],
  });
  process.exit(0);
}

if (options.list) {
  listSkills();
  process.exit(0);
}

if (options.validate) {
  const valid = validateSkill(options.validate);
  process.exit(valid ? 0 : 1);
}

if (options.install) {
  installSkill(options.install);
  process.exit(0);
}

if (options['convert-codebase']) {
  if (!options.name) {
    console.error('❌ --name is required when converting codebase');
    process.exit(1);
  }
  convertCodebase(options['convert-codebase'], options.name);
  process.exit(0);
}

if (options.assign && options.agent) {
  assignSkillToAgent(options.assign, options.agent);
  process.exit(0);
}

// Standalone hook registration for existing skills
if (options['register-hooks'] && !options.name) {
  const skillName = options['register-hooks'];
  const skillDir = path.join(SKILLS_DIR, skillName);
  const hooksDir = path.join(skillDir, 'hooks');

  if (!fs.existsSync(skillDir)) {
    console.error(`❌ Skill not found: ${skillName}`);
    process.exit(1);
  }

  if (!fs.existsSync(hooksDir)) {
    console.error(`❌ No hooks/ directory found in skill: ${skillName}`);
    console.log('   Create hooks first with: node create.cjs --name "..." --hooks');
    process.exit(1);
  }

  console.log(`\n🔗 Registering hooks for skill: ${skillName}`);

  if (fs.existsSync(path.join(hooksDir, 'pre-execute.cjs'))) {
    registerHooks(skillName, 'pre');
  }
  if (fs.existsSync(path.join(hooksDir, 'post-execute.cjs'))) {
    registerHooks(skillName, 'post');
  }

  console.log(`\n✅ Hooks registered in settings.json`);
  process.exit(0);
}

// Standalone schema registration for existing skills
if (options['register-schemas'] && !options.name) {
  const skillName = options['register-schemas'];
  const skillDir = path.join(SKILLS_DIR, skillName);
  const schemasDir = path.join(skillDir, 'schemas');

  if (!fs.existsSync(skillDir)) {
    console.error(`❌ Skill not found: ${skillName}`);
    process.exit(1);
  }

  if (!fs.existsSync(schemasDir)) {
    console.error(`❌ No schemas/ directory found in skill: ${skillName}`);
    console.log('   Create schemas first with: node create.cjs --name "..." --schemas');
    process.exit(1);
  }

  console.log(`\n🔗 Registering schemas for skill: ${skillName}`);

  if (fs.existsSync(path.join(schemasDir, 'input.schema.json'))) {
    registerSchema(skillName, 'input');
  }
  if (fs.existsSync(path.join(schemasDir, 'output.schema.json'))) {
    registerSchema(skillName, 'output');
  }

  console.log(`\n✅ Schemas registered in global schemas/`);
  process.exit(0);
}

// Convert a single rule file to a skill
if (options['convert-rule']) {
  const rulePath = options['convert-rule'];
  if (!fs.existsSync(rulePath)) {
    console.error(`❌ Rule file not found: ${rulePath}`);
    process.exit(1);
  }
  convertRuleToSkill(rulePath, {
    name: options.name,
    force: options.force,
  });
  process.exit(0);
}

// Convert all rules in a directory to skills
if (options['convert-rules']) {
  const rulesDir = options['convert-rules'];
  convertRulesDirectory(rulesDir, {
    force: options.force,
  });
  process.exit(0);
}

if (options.name) {
  createSkill({
    name: options.name,
    description: options.description,
    tools: options.tools,
    args: options.args,
    refs: options.refs,
    hooks: options.hooks,
    schemas: options.schemas,
    registerHooks: options['register-hooks'],
    registerSchemas: options['register-schemas'],
    originalRequest: options['original-request'],
    noWorkflow: options['no-workflow'],
    noMemory: options['no-memory'],
    noAutoAssign: options['no-auto-assign'],
    noHookAssessment: options['no-hook-assessment'],
    createTool: options['create-tool'],
    noTool: options['no-tool'],
    test: options.test,
  });
  process.exit(0);
}

console.log('❌ No action specified. Use --help for usage information.');
process.exit(1);
