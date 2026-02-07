#!/usr/bin/env node

/* security-lint-skip-file: CLI tool with diagnostic logging (no sensitive data) */

/**
 * Template Renderer - Main Script
 * Render templates by replacing tokens with actual values, with schema validation and security sanitization
 *
 * Usage:
 *   node main.cjs --template <template-name> --output <output-path> --tokens <json-string>
 *   node main.cjs --template <template-name> --output <output-path> --tokens-file <json-file>
 *
 * Options:
 *   --template <name>       Template name (specification-template, plan-template, tasks-template)
 *   --output <path>         Output file path
 *   --tokens <json>         Token map as JSON string
 *   --tokens-file <path>    Token map from JSON file
 *   --skip-schema           Skip schema validation (for testing)
 *   --help                  Show this help message
 *
 * Security Features:
 *   - Token value sanitization (SEC-SPEC-004)
 *   - Token whitelist enforcement (SEC-SPEC-003)
 *   - Template path validation (SEC-SPEC-002)
 *   - Schema validation for specifications
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
const TEMPLATES_DIR = path.join(CLAUDE_DIR, 'templates');
const SCHEMAS_DIR = path.join(CLAUDE_DIR, 'schemas');

// Token whitelists (SEC-SPEC-003)
const TOKEN_WHITELISTS = {
  'specification-template': [
    'FEATURE_NAME',
    'VERSION',
    'AUTHOR',
    'DATE',
    'STATUS',
    'ACCEPTANCE_CRITERIA_1',
    'ACCEPTANCE_CRITERIA_2',
    'ACCEPTANCE_CRITERIA_3',
    'TERM_1',
    'TERM_2',
    'TERM_3',
    'HTTP_METHOD',
    'ENDPOINT_PATH',
    'PROJECT_NAME',
  ],
  'plan-template': [
    'PLAN_TITLE',
    'DATE',
    'FRAMEWORK_VERSION',
    'STATUS',
    'EXECUTIVE_SUMMARY',
    'TOTAL_TASKS',
    'FEATURES_COUNT',
    'ESTIMATED_TIME',
    'STRATEGY',
    'KEY_DELIVERABLES_LIST',
    'PHASE_N_NAME',
    'PHASE_N_PURPOSE',
    'PHASE_N_DURATION',
    'DEPENDENCIES',
    'PARALLEL_OK',
    'VERIFICATION_COMMANDS',
    'HEALTH_THRESHOLD',
    'COVERAGE_THRESHOLD',
    'NUM_DEVELOPERS',
    'MVP_FEATURES',
    'RESEARCH_OUTPUT_PATH',
  ],
  'tasks-template': [
    'FEATURE_NAME',
    'VERSION',
    'AUTHOR',
    'DATE',
    'STATUS',
    'PRIORITY',
    'ESTIMATED_EFFORT',
    'RELATED_SPECS',
    'DEPENDENCIES',
    'FEATURE_DISPLAY_NAME',
    'FEATURE_DESCRIPTION',
    'BUSINESS_VALUE',
    'USER_IMPACT',
    'EPIC_NAME',
    'EPIC_GOAL',
    'SUCCESS_CRITERIA',
  ],
};

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
 * Sanitize token value to prevent injection attacks (SEC-SPEC-004)
 */
function sanitizeTokenValue(value) {
  return String(value)
    .replace(/[<>]/g, '') // Prevent HTML injection
    .replace(/\$\{/g, '') // Prevent template literal injection
    .replace(/\{\{/g, '') // Prevent nested token injection
    .trim();
}

/**
 * Validate template path within PROJECT_ROOT (SEC-SPEC-002)
 */
function validateTemplatePath(templateName) {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.md`);
  const normalizedPath = path.normalize(templatePath);

  // Check for path traversal
  if (!normalizedPath.startsWith(TEMPLATES_DIR)) {
    throw new Error(`Template path outside PROJECT_ROOT: ${templateName}`);
  }

  // Check file exists
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Template not found: ${templateName}\nExpected: ${normalizedPath}`);
  }

  return normalizedPath;
}

/**
 * Validate token is in whitelist (SEC-SPEC-003)
 */
function validateToken(token, templateName) {
  const whitelist = TOKEN_WHITELISTS[templateName];
  if (!whitelist) {
    console.warn(`⚠️  No whitelist defined for template: ${templateName}`);
    return true; // Allow if no whitelist defined
  }

  return whitelist.includes(token);
}

/**
 * Render template with token replacement
 */
function renderTemplate(templateContent, tokenMap, templateName) {
  let rendered = templateContent;
  const usedTokens = new Set();
  const invalidTokens = [];

  // Replace each token
  for (const [token, value] of Object.entries(tokenMap)) {
    // Validate token is in whitelist
    if (!validateToken(token, templateName)) {
      invalidTokens.push(token);
      continue;
    }

    // Sanitize value
    const sanitizedValue = sanitizeTokenValue(value);

    // Replace all occurrences
    const regex = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
    const matches = rendered.match(regex);
    if (matches) {
      rendered = rendered.replace(regex, sanitizedValue);
      usedTokens.add(token);
    }
  }

  // Report invalid tokens
  if (invalidTokens.length > 0) {
    const whitelist = TOKEN_WHITELISTS[templateName];
    throw new Error(
      `Tokens not in whitelist: ${invalidTokens.join(', ')}\n` +
        `Allowed tokens: ${whitelist.join(', ')}`
    );
  }

  // Warn about unused tokens
  const unusedTokens = Object.keys(tokenMap).filter(t => !usedTokens.has(t));
  if (unusedTokens.length > 0) {
    console.warn(`⚠️  Unused tokens provided: ${unusedTokens.join(', ')}`);
  }

  // Check for missing required tokens
  const missingTokens = rendered.match(/\{\{[A-Z_0-9]+\}\}/g);
  if (missingTokens) {
    throw new Error(`Missing required tokens: ${missingTokens.join(', ')}`);
  }

  return rendered;
}

/**
 * Validate specification against JSON Schema
 */
function validateSpecification(content) {
  // Extract YAML frontmatter
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!yamlMatch) {
    throw new Error('No YAML frontmatter found in specification');
  }

  try {
    // Try to parse YAML (basic validation)
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(yamlMatch[1]);

    // Check required fields
    const required = ['title', 'version', 'author', 'status', 'date', 'acceptance_criteria'];
    const missing = required.filter(field => !frontmatter[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(frontmatter.version)) {
      throw new Error(`Invalid version format: ${frontmatter.version} (expected: X.Y.Z)`);
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
      throw new Error(`Invalid date format: ${frontmatter.date} (expected: YYYY-MM-DD)`);
    }

    // Validate acceptance criteria is array with at least 1 item
    if (
      !Array.isArray(frontmatter.acceptance_criteria) ||
      frontmatter.acceptance_criteria.length === 0
    ) {
      throw new Error('acceptance_criteria must be an array with at least 1 item');
    }

    console.log('✅ Schema validation passed');
    return true;
  } catch (error) {
    throw new Error(`Schema validation failed: ${error.message}`);
  }
}

/**
 * Main execution
 */
function main() {
  if (options.help) {
    console.log(`
Template Renderer - Main Script

Usage:
  node main.cjs --template <template-name> --output <output-path> --tokens <json-string>
  node main.cjs --template <template-name> --output <output-path> --tokens-file <json-file>

Options:
  --template <name>       Template name (specification-template, plan-template, tasks-template)
  --output <path>         Output file path
  --tokens <json>         Token map as JSON string
  --tokens-file <path>    Token map from JSON file
  --skip-schema           Skip schema validation (for testing)
  --help                  Show this help message

Examples:
  # Render specification template
  node main.cjs \\
    --template specification-template \\
    --output ./my-spec.md \\
    --tokens '{"FEATURE_NAME":"My Feature","VERSION":"1.0.0","AUTHOR":"Claude","DATE":"2026-01-28"}'

  # Render plan template from file
  node main.cjs \\
    --template plan-template \\
    --output ./my-plan.md \\
    --tokens-file ./plan-tokens.json
`);
    process.exit(0);
  }

  try {
    // Validate required options
    if (!options.template) {
      throw new Error('Missing required option: --template');
    }
    if (!options.output) {
      throw new Error('Missing required option: --output');
    }
    if (!options.tokens && !options['tokens-file']) {
      throw new Error('Missing required option: --tokens or --tokens-file');
    }

    console.log('🔧 Template Renderer executing...');
    console.log(`   Template: ${options.template}`);
    console.log(`   Output: ${options.output}`);

    // Step 1: Validate template path (SEC-SPEC-002)
    const templatePath = validateTemplatePath(options.template);
    console.log(`   Template path: ${templatePath}`);

    // Step 2: Read template
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    console.log(`   Template size: ${templateContent.length} bytes`);

    // Step 3: Load token map
    let tokenMap;
    if (options['tokens-file']) {
      const tokensPath = path.resolve(options['tokens-file']);
      tokenMap = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      console.log(`   Tokens loaded from: ${tokensPath}`);
    } else {
      tokenMap = JSON.parse(options.tokens);
    }
    console.log(`   Tokens provided: ${Object.keys(tokenMap).length}`);

    // Step 4: Render template with token replacement
    console.log('   Replacing tokens...');
    const rendered = renderTemplate(templateContent, tokenMap, options.template);

    // Step 5: Schema validation (for specification templates)
    if (options.template === 'specification-template' && !options['skip-schema']) {
      console.log('   Validating against schema...');
      validateSpecification(rendered);
    }

    // Step 6: Write output
    const outputPath = path.resolve(options.output);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, rendered, 'utf8');
    console.log(`   Written to: ${outputPath}`);

    // Step 7: Verification
    console.log('   Verifying output...');
    const unresolvedTokens = rendered.match(/\{\{[A-Z_0-9]+\}\}/g);
    if (unresolvedTokens) {
      throw new Error(`Unresolved tokens found: ${unresolvedTokens.join(', ')}`);
    }

    console.log('✅ Template rendering completed successfully');
    console.log(`   Output: ${outputPath} (${rendered.length} bytes)`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
