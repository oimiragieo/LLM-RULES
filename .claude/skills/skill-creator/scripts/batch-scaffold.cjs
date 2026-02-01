#!/usr/bin/env node

/**
 * Batch Scaffold - Add infrastructure files to all skills
 * Creates scripts/, schemas/, and hooks/ directories for each skill
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
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

/**
 * Generate main.cjs content
 */
function generateMainScript(name, description) {
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
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

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
 * Generate pre-execute hook
 */
function generatePreHook(name) {
  return `#!/usr/bin/env node

/**
 * ${name} - Pre-Execute Hook
 * Runs before the skill executes to validate input or prepare context.
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
 * Generate post-execute hook
 */
function generatePostHook(name) {
  return `#!/usr/bin/env node

/**
 * ${name} - Post-Execute Hook
 * Runs after the skill executes for cleanup, logging, or follow-up actions.
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

  return { success: true };
}

// Run post-processing
const outcome = processResult(result);

if (outcome.success) {
  console.log('✅ [${name.toUpperCase()}] Post-processing complete');
  process.exit(0);
} else {
  console.error('⚠️  [${name.toUpperCase()}] Post-processing had issues');
  process.exit(0);
}
`;
}

/**
 * Generate input schema
 */
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

/**
 * Generate output schema
 */
function generateOutputSchema(name) {
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
 * Parse SKILL.md frontmatter to get description
 */
function parseSkillMd(skillPath) {
  const content = fs.readFileSync(skillPath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };

  const frontmatter = match[1];
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  return {
    description: descMatch ? descMatch[1].trim() : '',
  };
}

/**
 * Scaffold a single skill
 */
function scaffoldSkill(skillName) {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    console.log(`   ⚠️  Skipping ${skillName}: No SKILL.md found`);
    return { created: 0, skipped: 1 };
  }

  const { description } = parseSkillMd(skillMdPath);
  let created = 0;

  // Create scripts/main.cjs (if not exists)
  const scriptsDir = path.join(skillDir, 'scripts');
  const mainScript = path.join(scriptsDir, 'main.cjs');
  if (!fs.existsSync(mainScript)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(mainScript, generateMainScript(skillName, description));
    created++;
  }

  // Create hooks/ (if not exists)
  const hooksDir = path.join(skillDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-execute.cjs'), generatePreHook(skillName));
    fs.writeFileSync(path.join(hooksDir, 'post-execute.cjs'), generatePostHook(skillName));
    created += 2;
  }

  // Create schemas/ (if not exists)
  const schemasDir = path.join(skillDir, 'schemas');
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(path.join(schemasDir, 'input.schema.json'), generateInputSchema(skillName));
    fs.writeFileSync(path.join(schemasDir, 'output.schema.json'), generateOutputSchema(skillName));
    created += 2;
  }

  return { created, skipped: 0 };
}

/**
 * Main execution
 */
function main() {
  console.log('\n🔧 Batch Skill Scaffolder');
  console.log('========================\n');

  // Get all skill directories
  const skills = fs
    .readdirSync(SKILLS_DIR)
    .filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory());

  console.log(`Found ${skills.length} skills to scaffold\n`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const skill of skills) {
    console.log(`📦 Scaffolding: ${skill}`);
    const { created, skipped } = scaffoldSkill(skill);
    totalCreated += created;
    totalSkipped += skipped;
    if (created > 0) {
      console.log(`   ✅ Created ${created} files`);
    } else if (skipped === 0) {
      console.log(`   ⏭️  Already scaffolded`);
    }
  }

  console.log('\n========================');
  console.log(`✅ Complete: ${totalCreated} files created, ${totalSkipped} skills skipped`);
}

main();
