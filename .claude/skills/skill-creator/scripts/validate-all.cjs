#!/usr/bin/env node

/**
 * Validate All Skills
 * Checks that all skills have valid structure, schemas, and scripts
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

// SEC-009-VALIDATE FIX: Path validation to prevent command injection
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
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return !DANGEROUS_CHARS.some(char => filePath.includes(char));
}

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

// Required frontmatter fields
const REQUIRED_FIELDS = ['name', 'description'];
const RECOMMENDED_FIELDS = [
  'version',
  'model',
  'invoked_by',
  'user_invocable',
  'tools',
  'best_practices',
  'error_handling',
  'streaming',
];
const ALLOWED_FRONTMATTER_FIELDS = new Set([
  'name',
  'description',
  'version',
  'model',
  'invoked_by',
  'user_invocable',
  'tools',
  'allowed-tools',
  'args',
  'best_practices',
  'error_handling',
  'streaming',
  'metadata',
  'license',
  'globs',
  'feature_flag',
  'source',
  'source_url',
  'source_license',
  'consolidated_from',
  'templates',
  'dependencies',
  'assigned_agents',
  'related_skills',
  'aliases',
  'safety_level',
  'output_location',
  'output_paths',
  'output_schema',
  'category',
  'author',
  'triggers',
  'skills',
  'mcp_server_status',
  'requires_mcp_server',
  'executable',
  'test_suite',
]);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Parse YAML frontmatter from SKILL.md
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function validateOpenAiYaml(skillDir, skillName) {
  const warnings = [];
  const errors = [];
  const openAiYamlPath = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(openAiYamlPath)) {
    warnings.push('Missing agents/openai.yaml (recommended for UI discovery)');
    return { errors, warnings };
  }

  try {
    const raw = fs.readFileSync(openAiYamlPath, 'utf-8');
    const doc = yaml.load(raw) || {};
    const iface = doc.interface || {};
    if (!iface.display_name) {
      warnings.push('openai.yaml missing interface.display_name');
    }
    const shortDescription = String(iface.short_description || '');
    if (!shortDescription) {
      warnings.push('openai.yaml missing interface.short_description');
    } else if (shortDescription.length < 25 || shortDescription.length > 64) {
      warnings.push(
        `openai.yaml interface.short_description should be 25-64 chars (got ${shortDescription.length})`
      );
    }

    const defaultPrompt = String(iface.default_prompt || '');
    if (!defaultPrompt) {
      warnings.push('openai.yaml missing interface.default_prompt');
    } else if (!defaultPrompt.includes(`$${skillName}`)) {
      warnings.push(`openai.yaml default_prompt should explicitly mention $${skillName}`);
    }

    if (doc.dependencies && Array.isArray(doc.dependencies.tools)) {
      for (const dep of doc.dependencies.tools) {
        if (!dep || typeof dep !== 'object') {
          errors.push('openai.yaml dependencies.tools must contain objects');
          continue;
        }
        if (dep.type === 'mcp' && !dep.value) {
          errors.push('openai.yaml mcp dependency missing value');
        }
      }
    }
  } catch (err) {
    errors.push(`Invalid agents/openai.yaml: ${err.message}`);
  }

  return { errors, warnings };
}

/**
 * Validate SKILL.md
 */
function validateSkillMd(skillPath) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(skillPath)) {
    errors.push('SKILL.md not found');
    return { errors, warnings };
  }

  const content = fs.readFileSync(skillPath, 'utf-8');

  // Check frontmatter exists
  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter');
    return { errors, warnings };
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push('Invalid YAML frontmatter');
    return { errors, warnings };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check recommended fields
  for (const field of RECOMMENDED_FIELDS) {
    if (!frontmatter[field]) {
      warnings.push(`Missing recommended field: ${field}`);
    }
  }

  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_FIELDS.has(key)) {
      warnings.push(`Unknown frontmatter field: ${key}`);
    }
  }

  // Validate specific fields
  if (frontmatter.description && frontmatter.description.length < 20) {
    warnings.push('Description is less than 20 characters');
  }

  if (frontmatter.tools && !Array.isArray(frontmatter.tools)) {
    warnings.push('tools should be an array');
  }

  if (frontmatter.best_practices && !Array.isArray(frontmatter.best_practices)) {
    warnings.push('best_practices should be an array');
  }

  // POINTER VERIFICATION: Check for broken file references in content
  const fileRefPatterns = [
    /\.claude\/tools\/[a-zA-Z0-9_/-]+\.(js|mjs|cjs|py|sh)/g,
    /\.claude\/skills\/[a-zA-Z0-9_/-]+\/SKILL\.md/g,
    /\.claude\/agents\/[a-zA-Z0-9_/-]+\.md/g,
    /\.claude\/schemas\/[a-zA-Z0-9_/-]+\.json/g,
  ];

  const skillDir = path.dirname(skillPath);
  const projectRoot = path.resolve(skillDir, '..', '..', '..');

  for (const pattern of fileRefPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const refPath = match[0];
      const fullPath = path.join(projectRoot, refPath);
      if (!fs.existsSync(fullPath)) {
        // Check if it's in an example/template section (ignore those)
        const lineIndex = content.substring(0, match.index).split('\n').length;
        const surroundingLines = content
          .split('\n')
          .slice(Math.max(0, lineIndex - 3), lineIndex + 1)
          .join(' ');
        if (
          !surroundingLines.includes('example') &&
          !surroundingLines.includes('Template') &&
          !surroundingLines.includes('template')
        ) {
          warnings.push(`Potential broken file reference: ${refPath}`);
        }
      }
    }
  }

  // Check for Memory Protocol section
  if (!content.includes('Memory Protocol')) {
    warnings.push('Missing Memory Protocol section');
  }

  const skillLineCount = content.split('\n').length;
  if (skillLineCount > 500) {
    warnings.push(`SKILL.md is ${skillLineCount} lines (>500). Consider progressive disclosure.`);
  }

  return { errors, warnings, frontmatter };
}

/**
 * Validate JSON schema file
 */
function validateSchema(schemaPath) {
  const errors = [];

  if (!fs.existsSync(schemaPath)) {
    errors.push(`Schema not found: ${path.basename(schemaPath)}`);
    return { errors };
  }

  try {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    if (!schema.$schema) {
      errors.push(`Missing $schema in ${path.basename(schemaPath)}`);
    }
    if (!schema.type) {
      errors.push(`Missing type in ${path.basename(schemaPath)}`);
    }
  } catch (e) {
    errors.push(`Invalid JSON in ${path.basename(schemaPath)}: ${e.message}`);
  }

  return { errors };
}

/**
 * Validate JavaScript file syntax
 * SEC-009-VALIDATE FIX: Use spawnSync with shell:false to prevent command injection
 */
function validateScript(scriptPath) {
  const errors = [];

  if (!fs.existsSync(scriptPath)) {
    errors.push(`Script not found: ${path.basename(scriptPath)}`);
    return { errors };
  }

  // SEC-009-VALIDATE FIX: Validate path before using
  if (!isPathSafe(scriptPath)) {
    errors.push(`Invalid path characters in: ${path.basename(scriptPath)}`);
    return { errors };
  }

  try {
    // Check syntax by attempting to parse
    const _content = fs.readFileSync(scriptPath, 'utf-8');

    // SEC-009-VALIDATE FIX: Use spawnSync with shell:false instead of execSync
    const result = spawnSync('node', ['--check', scriptPath], { stdio: 'pipe', shell: false });
    if (result.status !== 0) {
      errors.push(
        `Syntax error in ${path.basename(scriptPath)}: ${result.stderr?.toString() || 'Unknown error'}`
      );
    }
  } catch (e) {
    errors.push(`Cannot read ${path.basename(scriptPath)}: ${e.message}`);
  }

  return { errors };
}

/**
 * Validate a single skill
 */
function validateSkill(skillName) {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const results = {
    name: skillName,
    errors: [],
    warnings: [],
    checks: {
      skillMd: { status: 'pending' },
      mainScript: { status: 'pending' },
      preHook: { status: 'skipped' },
      postHook: { status: 'skipped' },
      inputSchema: { status: 'skipped' },
      outputSchema: { status: 'skipped' },
    },
  };

  // 1. Validate SKILL.md (required)
  const skillMdResult = validateSkillMd(path.join(skillDir, 'SKILL.md'));
  results.errors.push(...skillMdResult.errors.map(e => `[SKILL.md] ${e}`));
  results.warnings.push(...skillMdResult.warnings.map(w => `[SKILL.md] ${w}`));
  results.checks.skillMd.status = skillMdResult.errors.length === 0 ? 'pass' : 'fail';

  // 1b. Validate optional agents/openai.yaml
  const openAiYamlResult = validateOpenAiYaml(skillDir, skillName);
  results.errors.push(...openAiYamlResult.errors.map(e => `[agents/openai.yaml] ${e}`));
  results.warnings.push(...openAiYamlResult.warnings.map(w => `[agents/openai.yaml] ${w}`));

  // 2. Validate main script (required if scripts/ exists)
  const scriptsDir = path.join(skillDir, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const mainScriptPath = path.join(scriptsDir, 'main.cjs');
    if (fs.existsSync(mainScriptPath)) {
      const mainScriptResult = validateScript(mainScriptPath);
      results.errors.push(...mainScriptResult.errors.map(e => `[scripts] ${e}`));
      results.checks.mainScript.status = mainScriptResult.errors.length === 0 ? 'pass' : 'fail';
    } else {
      // Check for create.cjs as alternative (e.g., skill-creator)
      const createScriptPath = path.join(scriptsDir, 'create.cjs');
      if (fs.existsSync(createScriptPath)) {
        const createScriptResult = validateScript(createScriptPath);
        results.errors.push(...createScriptResult.errors.map(e => `[scripts] ${e}`));
        results.checks.mainScript.status = createScriptResult.errors.length === 0 ? 'pass' : 'fail';
      } else {
        results.checks.mainScript.status = 'skipped';
      }
    }
  } else {
    results.checks.mainScript.status = 'skipped';
  }

  // 3. Validate hooks (OPTIONAL - only if hooks/ directory exists)
  const hooksDir = path.join(skillDir, 'hooks');
  if (fs.existsSync(hooksDir)) {
    const preHookPath = path.join(hooksDir, 'pre-execute.cjs');
    if (fs.existsSync(preHookPath)) {
      const preHookResult = validateScript(preHookPath);
      results.errors.push(...preHookResult.errors.map(e => `[hooks] ${e}`));
      results.checks.preHook.status = preHookResult.errors.length === 0 ? 'pass' : 'fail';
    }

    const postHookPath = path.join(hooksDir, 'post-execute.cjs');
    if (fs.existsSync(postHookPath)) {
      const postHookResult = validateScript(postHookPath);
      results.errors.push(...postHookResult.errors.map(e => `[hooks] ${e}`));
      results.checks.postHook.status = postHookResult.errors.length === 0 ? 'pass' : 'fail';
    }
  }

  // 4. Validate schemas (OPTIONAL - only if schemas/ directory exists)
  const schemasDir = path.join(skillDir, 'schemas');
  if (fs.existsSync(schemasDir)) {
    const inputSchemaPath = path.join(schemasDir, 'input.schema.json');
    if (fs.existsSync(inputSchemaPath)) {
      const inputSchemaResult = validateSchema(inputSchemaPath);
      results.errors.push(...inputSchemaResult.errors.map(e => `[schemas] ${e}`));
      results.checks.inputSchema.status = inputSchemaResult.errors.length === 0 ? 'pass' : 'fail';
    }

    const outputSchemaPath = path.join(schemasDir, 'output.schema.json');
    if (fs.existsSync(outputSchemaPath)) {
      const outputSchemaResult = validateSchema(outputSchemaPath);
      results.errors.push(...outputSchemaResult.errors.map(e => `[schemas] ${e}`));
      results.checks.outputSchema.status = outputSchemaResult.errors.length === 0 ? 'pass' : 'fail';
    }
  }

  return results;
}

/**
 * Main execution
 */
function main() {
  console.log('\n🧪 Skill Validation Suite');
  console.log('='.repeat(60) + '\n');

  // Get all skills
  const candidateDirs = fs
    .readdirSync(SKILLS_DIR)
    .filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory())
    .filter(f => !f.startsWith('_'))
    .sort();
  const skippedDirs = [];
  const skills = candidateDirs.filter(skillName => {
    const skillMdPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    const isSkill = fs.existsSync(skillMdPath);
    if (!isSkill) {
      skippedDirs.push(skillName);
    }
    return isSkill;
  });

  console.log(`Found ${skills.length} skills to validate\n`);
  if (skippedDirs.length > 0) {
    log('blue', `Skipping ${skippedDirs.length} non-skill directories: ${skippedDirs.join(', ')}`);
    console.log('');
  }

  const allResults = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let passedSkills = 0;

  for (const skill of skills) {
    const result = validateSkill(skill);
    allResults.push(result);

    const hasErrors = result.errors.length > 0;
    const hasWarnings = result.warnings.length > 0;

    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    if (!hasErrors) passedSkills++;

    // Print skill status
    const statusIcon = hasErrors ? '❌' : hasWarnings ? '⚠️' : '✅';
    const checks = Object.values(result.checks)
      .map(c =>
        c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : c.status === 'skipped' ? '-' : '?'
      )
      .join('');

    console.log(`${statusIcon} ${skill.padEnd(30)} [${checks}]`);

    // Print errors
    if (hasErrors) {
      for (const error of result.errors) {
        log('red', `   ❌ ${error}`);
      }
    }

    // Print warnings (only if verbose or few warnings)
    if (hasWarnings && result.warnings.length <= 2) {
      for (const warning of result.warnings) {
        log('yellow', `   ⚠️  ${warning}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary');
  console.log('-'.repeat(40));
  console.log(`Total skills:     ${skills.length}`);
  log(
    passedSkills === skills.length ? 'green' : 'yellow',
    `Passed:           ${passedSkills}/${skills.length}`
  );
  log(totalErrors === 0 ? 'green' : 'red', `Total errors:     ${totalErrors}`);
  log(totalWarnings === 0 ? 'green' : 'yellow', `Total warnings:   ${totalWarnings}`);

  console.log(
    '\nCheck Legend: [SKILL.md | main.cjs | pre-hook | post-hook | input.schema | output.schema]'
  );
  console.log('  ✓ = pass, ✗ = fail, - = skipped (optional)');

  if (totalErrors === 0) {
    log('green', '\n✅ All skills validated successfully!\n');
    process.exit(0);
  } else {
    log('red', `\n❌ Validation failed with ${totalErrors} errors\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  validateSkillMd,
  validateOpenAiYaml,
  validateSkill,
};
