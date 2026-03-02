#!/usr/bin/env node
/**
 * creator-compliance-validator.cjs
 *
 * PreToolUse hook that validates post-creation compliance when tasks complete.
 *
 * WHEN IT RUNS:
 * - Before TaskUpdate tool execution
 * - Only when status is being set to "completed"
 *
 * WHAT IT DOES:
 * - Detects if task involves artifact creation
 * - Validates required integrations (catalogs, registries, agent assignments)
 * - Blocks or warns based on enforcement mode
 * - Queues violations to integration-queue.jsonl
 *
 * ENFORCEMENT MODES:
 * - CREATOR_COMPLIANCE_ENFORCEMENT=block|warn|off (default: warn)
 *
 * Part of Creator Enforcement Layer 3.
 * @see .claude/workflows/core/ecosystem-creation-workflow.md
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const CREATOR_ECOSYSTEM_VALIDATOR =
  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-creator-ecosystem.cjs');
const SKILL_ECOSYSTEM_VALIDATOR =
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-skill-ecosystem.cjs');
const AGENT_SKILL_REFERENCE_VALIDATOR =
  process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-agent-skill-references.cjs');

// Creator output path patterns
const CREATOR_PATHS = {
  agent: /\.claude[/\\]agents[/\\]/,
  skill: /\.claude[/\\]skills[/\\]/,
  hook: /\.claude[/\\]hooks[/\\]/,
  workflow: /\.claude[/\\]workflows[/\\]/,
  template: /\.claude[/\\]templates[/\\]/,
  schema: /\.claude[/\\]schemas[/\\]/,
};

// Compliance checks per artifact type
const COMPLIANCE_CHECKS = {
  agent: [
    {
      name: 'registry',
      check: name => checkInFile('agent-registry.json', name),
    },
    {
      name: 'routing-keywords',
      check: name => checkInFile('routing-table.cjs', name),
    },
    {
      name: 'claude-md',
      check: name => checkInFile('CLAUDE.md', name),
    },
  ],
  skill: [
    {
      name: 'catalog',
      check: name => checkInFile('skill-catalog.md', name),
    },
  ],
  hook: [
    {
      name: 'settings',
      check: name => checkInFile('settings.json', name),
    },
  ],
  workflow: [
    {
      name: 'workflow-map',
      check: name => checkInFile('@WORKFLOW_AGENT_MAP.md', name),
    },
  ],
  template: [
    {
      name: 'catalog',
      check: name => checkInFile('template-catalog.md', name),
    },
  ],
  schema: [
    {
      name: 'catalog',
      check: name => checkInFile('schema-catalog.md', name),
    },
  ],
};

/**
 * Search for artifact name in relevant file.
 * @param {string} filename - File to search in
 * @param {string} artifactName - Artifact name to search for
 * @returns {{ pass: boolean, detail: string }}
 */
function checkInFile(filename, artifactName) {
  try {
    const searchPaths = [
      path.join(PROJECT_ROOT, '.claude', filename),
      path.join(PROJECT_ROOT, '.claude', 'docs', filename),
      path.join(PROJECT_ROOT, '.claude', 'context', 'data', filename),
      path.join(PROJECT_ROOT, '.claude', 'context', 'artifacts', 'catalogs', filename),
      path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', filename),
      path.join(PROJECT_ROOT, filename), // Also check project root for settings.json
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        const content = fs.readFileSync(searchPath, 'utf-8');
        if (content.includes(artifactName)) {
          return { pass: true, detail: `Found in ${filename}` };
        }
      }
    }
    return { pass: false, detail: `NOT found in ${filename}` };
  } catch (e) {
    return { pass: false, detail: `Error checking ${filename}: ${e.message}` };
  }
}

/**
 * Queue integration tasks to integration-queue.jsonl
 * @param {Array<Object>} violations - List of violations
 */
function queueIntegrationTasks(violations) {
  try {
    const queuePath = path.join(
      PROJECT_ROOT,
      '.claude',
      'context',
      'runtime',
      'integration-queue.jsonl'
    );

    // Ensure directory exists
    const queueDir = path.dirname(queuePath);
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    // Append violations to queue
    for (const violation of violations) {
      const entry = {
        timestamp: new Date().toISOString(),
        artifactPath: violation.file,
        artifactType: violation.type,
        missingIntegration: violation.check,
        detail: violation.detail,
        source: 'creator-compliance-validator',
        processed: false,
      };
      fs.appendFileSync(queuePath, JSON.stringify(entry) + '\n', 'utf-8');
    }
  } catch (err) {
    // Best-effort - don't fail if queueing fails
    console.error(`[creator-compliance-validator] Failed to queue violations: ${err.message}`);
  }
}

/**
 * Read stdin asynchronously.
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

/**
 * Format hook result for stdout.
 * @param {boolean} allow - Whether to allow the operation
 * @param {string} [message] - Optional message
 * @returns {string}
 */
function formatResult(allow, message = '') {
  return JSON.stringify({ allow, message });
}

function runValidatorScript(scriptPath, args = [], fallbackIssue = 'Validation failed') {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      windowsHide: true,
    });

    if (result.status === 0) {
      return { passed: true, issues: [] };
    }

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const issues = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- ') || line.length > 0)
      .slice(0, 10)
      .map(line => (line.startsWith('- ') ? line.slice(2) : line));

    return {
      passed: false,
      issues: issues.length > 0 ? issues : [fallbackIssue],
    };
  } catch (err) {
    return {
      passed: false,
      issues: [`${fallbackIssue}: ${err.message}`],
    };
  }
}

function validateCreatorEcosystemStrict() {
  const creatorValidation = runValidatorScript(
    CREATOR_ECOSYSTEM_VALIDATOR,
    [],
    'Creator ecosystem validation failed'
  );
  const skillValidation = runValidatorScript(
    SKILL_ECOSYSTEM_VALIDATOR,
    ['--require-perfect'],
    'Skill ecosystem gate failed'
  );
  const agentSkillReferenceValidation = runValidatorScript(
    AGENT_SKILL_REFERENCE_VALIDATOR,
    [],
    'Agent skill reference validation failed'
  );

  const issues = [];
  if (!creatorValidation.passed) {
    issues.push(...creatorValidation.issues);
  }
  if (!skillValidation.passed) {
    issues.push(...skillValidation.issues);
  }
  if (!agentSkillReferenceValidation.passed) {
    issues.push(...agentSkillReferenceValidation.issues);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Main hook execution.
 */
async function main() {
  try {
    // Read hook input from stdin
    const hookInput = await readStdin();
    const input = safeParseJSON(hookInput, 'hook-input');
    if (!input || typeof input !== 'object') {
      console.log(formatResult(true));
      process.exit(0);
      return;
    }

    // Extract tool and params
    const toolName = input.tool_name || input.tool;
    const toolInput = input.tool_input || input.params || {};

    // Only intercept TaskUpdate calls
    if (toolName !== 'TaskUpdate') {
      // Not a TaskUpdate call - allow
      console.log(formatResult(true));
      process.exit(0);
    }

    // Only intercept when status is being set to "completed"
    if (toolInput.status !== 'completed') {
      // Not completing a task - allow
      console.log(formatResult(true));
      process.exit(0);
    }

    // Check enforcement mode
    const mode = process.env.CREATOR_COMPLIANCE_ENFORCEMENT || 'warn';
    if (mode === 'off') {
      console.log(formatResult(true));
      process.exit(0);
    }

    // Extract task metadata
    const metadata = toolInput.metadata || {};
    const filesCreated = metadata.filesCreated || [];
    const filesModified = metadata.filesModified || [];
    const allFiles = [...filesCreated, ...filesModified];

    // Find which files match creator output paths
    const creatorFiles = [];
    for (const file of allFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      for (const [type, pattern] of Object.entries(CREATOR_PATHS)) {
        if (pattern.test(normalizedPath)) {
          creatorFiles.push({ file, type });
          break;
        }
      }
    }

    if (creatorFiles.length === 0) {
      // No creator files - pass
      console.log(formatResult(true));
      process.exit(0);
    }

    const strictValidation = validateCreatorEcosystemStrict();
    if (!strictValidation.passed) {
      const strictMessage = [
        '',
        '+======================================================================+',
        '|  CREATOR ECOSYSTEM GATE FAILED                                        |',
        '+======================================================================+',
        '|  Strict ecosystem checks failed for creator completion.               |',
        '|                                                                      |',
        '|  Required action:                                                    |',
        '|  1. Run: pnpm skills:ecosystem:gate                                 |',
        '|  2. Fix missing creator-skill contracts                              |',
        '|  3. Re-run TaskUpdate to complete                                    |',
      ];

      for (const issue of strictValidation.issues.slice(0, 6)) {
        strictMessage.push(`|  - ${issue.substring(0, 66).padEnd(66)}|`);
      }

      strictMessage.push(
        '+======================================================================+'
      );
      strictMessage.push('');

      if (mode === 'block') {
        console.log(formatResult(false, strictMessage.join('\n')));
        process.exit(2);
      }

      console.warn(strictMessage.join('\n'));
    }

    // Check compliance for each creator file
    const violations = [];
    for (const { file, type } of creatorFiles) {
      const artifactName = path.basename(file, path.extname(file));
      const checks = COMPLIANCE_CHECKS[type] || [];

      for (const { name, check } of checks) {
        const result = check(artifactName);
        if (!result.pass) {
          violations.push({ file, type, check: name, detail: result.detail });
        }
      }
    }

    if (violations.length === 0) {
      // All checks passed - allow
      console.log(formatResult(true));
      process.exit(0);
    }

    // Format violation message
    const taskId = toolInput.taskId || 'unknown';
    const violationList = violations
      .slice(0, 5) // Max 5 violations shown
      .map(v => `  - ${v.file}: ${v.check} — ${v.detail}`)
      .join('\n');

    const message = `
+======================================================================+
|  CREATOR COMPLIANCE VIOLATION                                        |
+======================================================================+
|  Task ID: ${taskId.padEnd(58)}|
|  Violations: ${violations.length.toString().padEnd(53)}|
|                                                                      |
${violationList}
|                                                                      |
|  Required action:                                                    |
|  1. Run artifact-integrator skill to fix missing integrations        |
|  2. Or manually update catalogs/registries                           |
|  3. Re-run TaskUpdate to complete                                   |
|                                                                      |
|  See: .claude/workflows/core/ecosystem-creation-workflow.md          |
+======================================================================+
`;

    // Queue to integration queue (warn mode only)
    if (mode === 'warn') {
      queueIntegrationTasks(violations);
    }

    if (mode === 'block') {
      // Block completion
      console.log(formatResult(false, message));
      process.exit(2);
    } else {
      // Warn mode - allow but log warning
      console.warn(message);
      console.log(formatResult(true));
      process.exit(0);
    }
  } catch (err) {
    // Error in hook - allow completion (fail open)
    console.error(`[creator-compliance-validator] Error: ${err.message}`);
    console.log(formatResult(true, `Creator compliance validation error: ${err.message}`));
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = {
  main,
  runValidatorScript,
  validateCreatorEcosystemStrict,
};
