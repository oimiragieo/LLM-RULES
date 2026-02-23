#!/usr/bin/env node

/**
 * Hook Assessor Module
 * Analyzes agent/skill keywords and recommends appropriate hooks.
 *
 * Usage:
 *   import { assessHooks } from './hook-assessor.mjs';
 *   const recommendations = assessHooks({ name, description, capabilities });
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find project root (Windows compatible)
function findProjectRoot() {
  let dir = __dirname;
  let prevDir = '';
  while (dir !== prevDir) {
    // Stop when we reach the root (dirname returns same path)
    // Check if this directory contains a .claude folder (project root)
    if (existsSync(join(dir, '.claude'))) return dir;
    prevDir = dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const _HOOKS_DIR = join(ROOT, '.claude', 'hooks');
const SETTINGS_PATH = join(ROOT, '.claude', 'settings.json');

/**
 * Hook-Keyword Matrix
 * Maps keywords to recommended hook types with templates
 */
const HOOK_PATTERNS = {
  // Financial/Payment - needs validation and audit
  financial: {
    keywords: [
      'payment',
      'financial',
      'money',
      'transaction',
      'billing',
      'invoice',
      'price',
      'cost',
    ],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Validate financial operations before execution',
        priority: 'high',
        template: 'financial-validation',
        matcher: 'Edit|Write|Bash',
      },
      {
        type: 'PostToolUse',
        purpose: 'Audit log for financial transactions',
        priority: 'high',
        template: 'audit-logger',
        matcher: 'Edit|Write|Bash',
      },
    ],
  },

  // Security/Auth - needs scope validation
  security: {
    keywords: [
      'security',
      'auth',
      'password',
      'token',
      'jwt',
      'oauth',
      'credential',
      'secret',
      'encrypt',
      'permission',
      'role',
      'access',
    ],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Validate security scope and block sensitive operations',
        priority: 'critical',
        template: 'security-scope-check',
        matcher: 'Edit|Write|Bash',
      },
      {
        type: 'UserPromptSubmit',
        purpose: 'Detect security-sensitive requests for review',
        priority: 'high',
        template: 'security-intent-detector',
        matcher: '',
      },
    ],
  },

  // Database/Migration - needs backup and dry-run
  database: {
    keywords: [
      'database',
      'migration',
      'schema',
      'sql',
      'query',
      'table',
      'column',
      'index',
      'postgres',
      'mysql',
      'sqlite',
    ],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Ensure backup exists before schema changes',
        priority: 'high',
        template: 'backup-check',
        matcher: 'Bash',
      },
      {
        type: 'PreToolUse',
        purpose: 'Dry-run validation for migration scripts',
        priority: 'medium',
        template: 'migration-dry-run',
        matcher: 'Bash',
      },
    ],
  },

  // Deployment/Release - needs approval gate
  deployment: {
    keywords: [
      'deploy',
      'release',
      'production',
      'staging',
      'publish',
      'rollout',
      'ci',
      'cd',
      'pipeline',
    ],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Approval gate for production deployments',
        priority: 'critical',
        template: 'deployment-gate',
        matcher: 'Bash',
      },
      {
        type: 'PostToolUse',
        purpose: 'Notify on deployment completion/failure',
        priority: 'medium',
        template: 'deployment-notifier',
        matcher: 'Bash',
      },
    ],
  },

  // File operations - needs audit and backup
  fileOps: {
    keywords: ['file', 'delete', 'remove', 'clean', 'wipe', 'overwrite'],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Confirm destructive file operations',
        priority: 'medium',
        template: 'destructive-op-check',
        matcher: 'Edit|Write|Bash',
      },
      {
        type: 'PostToolUse',
        purpose: 'Audit log for file changes',
        priority: 'low',
        template: 'file-audit-logger',
        matcher: 'Edit|Write',
      },
    ],
  },

  // API/External - needs response validation
  external: {
    keywords: [
      'api',
      'external',
      'third-party',
      'webhook',
      'http',
      'rest',
      'graphql',
      'fetch',
      'request',
    ],
    hooks: [
      {
        type: 'PostToolUse',
        purpose: 'Validate external API responses',
        priority: 'medium',
        template: 'api-response-validator',
        matcher: 'Bash',
      },
      {
        type: 'PreToolUse',
        purpose: 'Rate limit and retry logic for external calls',
        priority: 'low',
        template: 'rate-limiter',
        matcher: 'Bash',
      },
    ],
  },

  // Infrastructure - needs state protection
  infrastructure: {
    keywords: [
      'terraform',
      'infrastructure',
      'cloud',
      'aws',
      'gcp',
      'azure',
      'k8s',
      'kubernetes',
      'docker',
    ],
    hooks: [
      {
        type: 'PreToolUse',
        purpose: 'Require plan before apply for IaC',
        priority: 'critical',
        template: 'iac-plan-first',
        matcher: 'Bash',
      },
      {
        type: 'PreToolUse',
        purpose: 'Block destructive infrastructure commands',
        priority: 'high',
        template: 'infra-destructive-check',
        matcher: 'Bash',
      },
    ],
  },
};

/**
 * Hook templates for common patterns
 */
const HOOK_TEMPLATES = {
  'financial-validation': `#!/usr/bin/env node
/**
 * Financial Validation Hook
 * Validates financial operations before execution
 */
const fs = require('fs');

function parseHookInput() {
  const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
  try { return process.argv[2] ? safeParseJSON(process.argv[2]) : null; }
  catch { return null; }
}

function main() {
  const input = parseHookInput();
  if (!input) process.exit(0);

  const toolInput = input.tool_input || {};
  const content = toolInput.content || toolInput.command || '';

  // Check for dangerous financial patterns
  const dangerousPatterns = [
    /delete.*payment/i,
    /drop.*transaction/i,
    /truncate.*billing/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      console.log('[FINANCIAL-HOOK] ⚠️  Potentially dangerous financial operation detected');
      console.log('[FINANCIAL-HOOK] Review required before proceeding');
      // Set to exit(1) to block, exit(0) to warn only
      process.exit(0);
    }
  }

  process.exit(0);
}

main();
`,

  'security-scope-check': `#!/usr/bin/env node
/**
 * Security Scope Check Hook
 * Validates operations don't exceed security boundaries
 */
const fs = require('fs');

function parseHookInput() {
  const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
  try { return process.argv[2] ? safeParseJSON(process.argv[2]) : null; }
  catch { return null; }
}

function main() {
  const input = parseHookInput();
  if (!input) process.exit(0);

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';
  const content = toolInput.content || toolInput.command || '';

  // Sensitive file patterns
  const sensitiveFiles = [
    /\\.env$/i,
    /credentials/i,
    /secrets?\\./i,
    /\\.pem$/i,
    /\\.key$/i,
  ];

  for (const pattern of sensitiveFiles) {
    if (pattern.test(filePath)) {
      console.log('[SECURITY-HOOK] 🔒 Attempt to modify sensitive file: ' + filePath);
      console.log('[SECURITY-HOOK] This operation requires explicit approval');
      process.exit(1); // Block by default for security files
    }
  }

  process.exit(0);
}

main();
`,

  'audit-logger': `#!/usr/bin/env node
/**
 * Audit Logger Hook
 * Logs operations to audit trail
 */
const fs = require('fs');
const path = require('path');

function parseHookInput() {
  const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
  try { return process.argv[2] ? safeParseJSON(process.argv[2]) : null; }
  catch { return null; }
}

function main() {
  const input = parseHookInput();
  if (!input) process.exit(0);

  const auditPath = path.join(process.cwd(), '.claude', 'context', 'runtime', 'audit.log');
  const timestamp = new Date().toISOString();
  const toolName = input.tool_name || 'unknown';
  const entry = \`[\${timestamp}] \${toolName}: \${JSON.stringify(input.tool_input || {}).slice(0, 200)}\\n\`;

  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, entry);
  } catch (e) {
    // Silent fail for audit logging
  }

  process.exit(0);
}

main();
`,
};

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2);
  return new Set(words);
}

/**
 * Get existing hooks from settings.json
 */
function getExistingHooks() {
  try {
    if (!existsSync(SETTINGS_PATH)) return [];
    const settings = safeParseJSON(readFileSync(SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks || {};
    const existing = [];

    for (const [trigger, configs] of Object.entries(hooks)) {
      for (const config of configs) {
        existing.push({
          trigger,
          matcher: config.matcher,
          command: config.hooks?.[0]?.command || '',
        });
      }
    }
    return existing;
  } catch {
    return [];
  }
}

/**
 * Check if a similar hook already exists
 */
function hookExists(recommendation, existingHooks) {
  return existingHooks.some(
    h => h.trigger === recommendation.type && h.command.includes(recommendation.template)
  );
}

/**
 * Assess hooks for an agent or skill
 *
 * @param {Object} config - Configuration object
 * @param {string} config.name - Agent/skill name
 * @param {string} config.description - Description
 * @param {string[]} [config.capabilities] - List of capabilities
 * @param {string[]} [config.keywords] - Additional keywords
 * @returns {Object} Hook recommendations
 */
export function assessHooks(config) {
  const { name = '', description = '', capabilities = [], keywords: extraKeywords = [] } = config;

  // Combine all text for keyword extraction
  const allText = [name, description, ...capabilities, ...extraKeywords].join(' ');
  const foundKeywords = extractKeywords(allText);

  const existingHooks = getExistingHooks();
  const recommendations = [];
  const matchedCategories = new Set();

  // Check each hook pattern
  for (const [category, pattern] of Object.entries(HOOK_PATTERNS)) {
    const matchedKeywords = pattern.keywords.filter(kw => foundKeywords.has(kw));

    if (matchedKeywords.length > 0) {
      matchedCategories.add(category);

      for (const hook of pattern.hooks) {
        const alreadyExists = hookExists(hook, existingHooks);

        recommendations.push({
          category,
          matchedKeywords,
          ...hook,
          alreadyExists,
          template: HOOK_TEMPLATES[hook.template] || null,
        });
      }
    }
  }

  return {
    hasRecommendations: recommendations.filter(r => !r.alreadyExists).length > 0,
    matchedCategories: Array.from(matchedCategories),
    recommendations: recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    }),
    existingHooks,
  };
}

/**
 * Generate hook file content from template
 */
export function generateHookContent(templateName) {
  return HOOK_TEMPLATES[templateName] || null;
}

/**
 * Get all available hook templates
 */
export function getAvailableTemplates() {
  return Object.keys(HOOK_TEMPLATES);
}

// CLI usage - normalize paths for Windows compatibility
const scriptPath = process.argv[1] || '';
const isMain =
  import.meta.url === `file://${scriptPath}` ||
  import.meta.url === `file:///${scriptPath.replace(/\\/g, '/')}`;
if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Hook Assessor - Analyze and recommend hooks

Usage:
  node hook-assessor.mjs --name "agent-name" --description "description"
  node hook-assessor.mjs --templates  (list available templates)

Options:
  --name          Agent/skill name
  --description   Description text
  --keywords      Comma-separated additional keywords
  --templates     List available hook templates
  --json          Output as JSON
`);
    process.exit(0);
  }

  if (args.includes('--templates')) {
    console.log('\n📋 Available Hook Templates:\n');
    for (const template of getAvailableTemplates()) {
      console.log(`  - ${template}`);
    }
    process.exit(0);
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') options.name = args[++i];
    if (args[i] === '--description') options.description = args[++i];
    if (args[i] === '--keywords') options.keywords = args[++i]?.split(',');
  }

  if (!options.name && !options.description) {
    console.error('Error: --name or --description required');
    process.exit(1);
  }

  const result = assessHooks(options);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n🔍 Hook Assessment Results\n');
    console.log(`Matched categories: ${result.matchedCategories.join(', ') || 'none'}`);
    console.log(`Recommendations: ${result.recommendations.length}`);

    if (result.hasRecommendations) {
      console.log('\n⚠️  HOOK RECOMMENDATIONS:\n');
      for (const rec of result.recommendations) {
        if (!rec.alreadyExists) {
          console.log(`  [${rec.priority.toUpperCase()}] ${rec.type}`);
          console.log(`    Purpose: ${rec.purpose}`);
          console.log(`    Template: ${rec.template}`);
          console.log(`    Matched: ${rec.matchedKeywords.join(', ')}`);
          console.log('');
        }
      }
    } else {
      console.log('\n✅ No new hooks recommended (existing hooks sufficient)');
    }
  }
}
