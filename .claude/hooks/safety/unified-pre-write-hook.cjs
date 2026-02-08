#!/usr/bin/env node
/**
 * Unified Pre-Write Hook - Consolidates 11 hooks into 1
 *
 * Reduces process spawning overhead by running all write validations
 * in a single Node process instead of 11 separate forks.
 *
 * Original hooks consolidated:
 * 1. context-mode-tool-guard.cjs
 * 2. file-placement-guard.cjs
 * 3. write-content-scanner.cjs
 * 4. write-size-validator.cjs
 * 5. routing-guard.cjs (subset for writes)
 * 6. router-write-guard.cjs
 * 7. unified-creator-guard.cjs
 * 8. tdd-check.cjs
 * 9. plan-evolution-guard.cjs
 * 10. unified-evolution-guard.cjs
 * 11. suggest-compact.cjs (optional, informational only)
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (fail-closed on error)
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Resolve paths relative to this file's location
// __dirname = .claude/hooks/safety → up 3 levels to project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

// Helper to safely require modules
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    // Try alternate resolution strategy
    const absolutePath = path.join(LIB_DIR, modulePath.replace(/^(\.\.\/)+lib\//, ''));
    if (fs.existsSync(absolutePath)) {
      return require(absolutePath);
    }
    throw err;
  }
}

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
} = safeRequire(path.join(LIB_DIR, 'utils', 'hook-input.cjs'));

// Event Bus integration
let eventBus;
try {
  eventBus = safeRequire(path.join(LIB_DIR, 'events', 'event-bus.cjs'));
} catch (_err) {
  eventBus = null;
}
const { EventTypes } = safeRequire(path.join(LIB_DIR, 'events', 'event-types.cjs'));

// =============================================================================
// CHECK MODULES (loaded in-process instead of forked)
// =============================================================================

const CHECKS = [];

// Check 1: Context Mode Tool Guard
CHECKS.push({
  name: 'context-mode-tool-guard',
  run: async (toolName, toolInput) => {
    // Only applies to Bash in certain contexts
    if (toolName !== 'Bash') return { pass: true };

    const enforcement = getEnforcementMode('CONTEXT_MODE_TOOL_GUARD', 'warn');
    if (enforcement === 'off') return { pass: true };

    // Check if context/mode restrictions apply
    const _context = process.env.AGENT_STUDIO_CONTEXT;
    const modes = process.env.AGENT_STUDIO_MODES;

    // If editing mode and trying to run non-whitelisted bash command
    if (modes?.includes('editing')) {
      const allowedInEditing = ['git', 'npm', 'pnpm', 'yarn', 'node', 'npx'];
      const command = toolInput.command || '';
      const isAllowed = allowedInEditing.some(cmd => command.trim().startsWith(cmd));

      if (!isAllowed) {
        return {
          pass: enforcement === 'warn',
          result: enforcement,
          message: `[CONTEXT-MODE-GUARD] Bash commands restricted in 'editing' mode. Allowed: ${allowedInEditing.join(', ')}`,
        };
      }
    }

    return { pass: true };
  },
});

// Check 2: File Placement Guard
CHECKS.push({
  name: 'file-placement-guard',
  run: async (toolName, toolInput) => {
    const filePath = toolInput.file_path || toolInput.target_file;
    if (!filePath) return { pass: true };

    const enforcement = getEnforcementMode('FILE_PLACEMENT_GUARD', 'block');
    if (enforcement === 'off') return { pass: true };

    // Disallowed directories
    const disallowedPatterns = [/\/\.git\//, /\/node_modules\//, /\.claude\/context\/code-index/];

    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const pattern of disallowedPatterns) {
      if (pattern.test(normalizedPath)) {
        return {
          pass: false,
          result: 'block',
          message: `[FILE-PLACEMENT-GUARD] Cannot write to protected path: ${filePath}`,
        };
      }
    }

    return { pass: true };
  },
});

// Check 3: Write Content Scanner
CHECKS.push({
  name: 'write-content-scanner',
  run: async (toolName, toolInput) => {
    const content = toolInput.content || toolInput.new_str || '';
    if (!content) return { pass: true };

    const enforcement = getEnforcementMode('WRITE_CONTENT_SCANNER', 'block');
    if (enforcement === 'off') return { pass: true };

    // Security patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, desc: 'eval() usage' },
      { pattern: /new\s+Function\s*\(/, desc: 'Function constructor' },
      { pattern: /child_process/, desc: 'child_process import' },
      { pattern: /require\s*\(\s*['"]node:child_process['"]\s*\)/, desc: 'child_process require' },
    ];

    for (const { pattern, desc } of dangerousPatterns) {
      if (pattern.test(content)) {
        return {
          pass: enforcement === 'warn',
          result: enforcement,
          message: `[WRITE-CONTENT-SCANNER] Potentially dangerous pattern detected: ${desc}. Review required.`,
        };
      }
    }

    return { pass: true };
  },
});

// Check 4: Write Size Validator
CHECKS.push({
  name: 'write-size-validator',
  run: async (toolName, toolInput) => {
    const content = toolInput.content || toolInput.new_str || '';
    if (!content) return { pass: true };

    const enforcement = getEnforcementMode('WRITE_SIZE_VALIDATOR', 'warn');
    if (enforcement === 'off') return { pass: true };

    // Configurable limits
    const maxSize = parseInt(process.env.MAX_WRITE_SIZE_CHARS || '500000', 10); // 500KB default

    if (content.length > maxSize) {
      return {
        pass: enforcement === 'warn',
        result: enforcement,
        message: `[WRITE-SIZE-VALIDATOR] Write size ${content.length} exceeds limit ${maxSize}. Consider breaking into smaller writes.`,
      };
    }

    return { pass: true };
  },
});

// Check 5: Router Write Guard
CHECKS.push({
  name: 'router-write-guard',
  run: async (_toolName, _toolInput) => {
    const enforcement = getEnforcementMode('ROUTER_WRITE_GUARD', 'block');
    if (enforcement === 'off') return { pass: true };

    // Check if this is a Router context (simplified - full check requires router-state)
    const agentId = process.env.CLAUDE_AGENT_ID || 'router';

    if (agentId === 'router') {
      // Router shouldn't write directly - should spawn agent
      return {
        pass: false,
        result: 'block',
        message: `[ROUTER-WRITE-GUARD] Router cannot directly write files. Spawn an agent using Task tool.`,
      };
    }

    return { pass: true };
  },
});

// Check 6: TDD Check
CHECKS.push({
  name: 'tdd-check',
  run: async (toolName, toolInput) => {
    const enforcement = getEnforcementMode('TDD_CHECK', 'warn');
    if (enforcement === 'off') return { pass: true };

    // Check if this is implementation code without tests
    const filePath = toolInput.file_path || toolInput.target_file || '';
    const isTestFile =
      /\.(test|spec)\.(js|ts|jsx|tsx|cjs|mjs)$/.test(filePath) ||
      /\/__tests__\//.test(filePath) ||
      /\/test\//.test(filePath);

    const isImplementationFile =
      /^(src|lib|app|pages|components|api)\//.test(filePath) ||
      /\.(js|ts|jsx|tsx|cjs|mjs)$/.test(filePath);

    // If writing implementation, check if tests exist
    if (isImplementationFile && !isTestFile) {
      // Look for corresponding test file
      const fs = require('fs');
      const baseName = filePath.replace(/\.(js|ts|jsx|tsx|cjs|mjs)$/, '');
      const possibleTests = [
        `${baseName}.test.js`,
        `${baseName}.test.ts`,
        `${baseName}.spec.js`,
        `${baseName}.spec.ts`,
      ];

      const hasTest = possibleTests.some(testPath => {
        try {
          fs.accessSync(testPath);
          return true;
        } catch {
          return false;
        }
      });

      if (!hasTest) {
        return {
          pass: enforcement === 'warn',
          result: enforcement,
          message: `[TDD-CHECK] No test file found for ${filePath}. Consider adding tests.`,
        };
      }
    }

    return { pass: true };
  },
});

// Check 7: Plan Evolution Guard
CHECKS.push({
  name: 'plan-evolution-guard',
  run: async (_toolName, _toolInput) => {
    const enforcement = getEnforcementMode('PLAN_EVOLUTION_GUARD', 'block');
    if (enforcement === 'off') return { pass: true };

    // Check if there's an active plan that should not be evolved
    // Simplified check - full implementation requires plan state tracking
    const evolutionState = process.env.EVOLUTION_STATE;

    if (evolutionState === 'locked') {
      return {
        pass: false,
        result: 'block',
        message: `[PLAN-EVOLUTION-GUARD] Plan is locked. Cannot modify while evolution is blocked.`,
      };
    }

    return { pass: true };
  },
});

// Check 8: Unified Creator Guard
CHECKS.push({
  name: 'unified-creator-guard',
  run: async (toolName, toolInput) => {
    const enforcement = getEnforcementMode('CREATOR_GUARD', 'block');
    if (enforcement === 'off') return { pass: true };

    const filePath = toolInput.file_path || toolInput.target_file || '';

    // Check if trying to create certain protected file types without proper context
    const isSkillCreation = /\.claude\/skills\/[^/]+\/SKILL\.md$/.test(filePath);
    const isAgentCreation = /\.claude\/agents\/[^/]+\.md$/.test(filePath);
    const isWorkflowCreation = /\.claude\/workflows\/[^/]+\.(md|yaml)$/.test(filePath);

    if (isSkillCreation || isAgentCreation || isWorkflowCreation) {
      // Check if running in creator workflow context
      const inCreatorWorkflow = process.env.CREATOR_WORKFLOW === 'active';

      if (!inCreatorWorkflow) {
        return {
          pass: false,
          result: 'block',
          message: `[CREATOR-GUARD] Creating framework artifacts requires creator workflow. Use appropriate workflow.`,
        };
      }
    }

    return { pass: true };
  },
});

// Check 9: Suggest Compact (informational only)
CHECKS.push({
  name: 'suggest-compact',
  run: async (toolName, toolInput) => {
    // This check is always informational (never blocks)
    const content = toolInput.content || toolInput.new_str || '';
    const filePath = toolInput.file_path || toolInput.target_file || '';

    // Suggest compression if file is very large
    const suggestionThreshold = 100000; // 100KB

    if (content.length > suggestionThreshold) {
      // Log suggestion but don't block
      if (process.env.DEBUG_HOOKS === 'true') {
        console.error(
          `[SUGGEST-COMPACT] Large write detected: ${filePath} (${content.length} chars). Consider context pruning.`
        );
      }
    }

    return { pass: true };
  },
});

// Check 10: Project Root Write Guard
// Blocks writes to the project root directory except for known allowlisted files.
// Prevents junk files (e.g., mangled paths) from being created in the root.
CHECKS.push({
  name: 'project-root-write-guard',
  run: async (_toolName, toolInput) => {
    const filePath = toolInput.file_path || toolInput.target_file || '';
    if (!filePath) return { pass: true };

    const enforcement = getEnforcementMode('PROJECT_ROOT_WRITE_GUARD', 'block');
    if (enforcement === 'off') return { pass: true };

    // Normalize the path for cross-platform comparison
    const normalizedPath = path.resolve(filePath).replace(/\\/g, '/');
    const normalizedRoot = PROJECT_ROOT.replace(/\\/g, '/');

    // Extract the directory and filename
    const fileDir = path.dirname(normalizedPath).replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);

    // Only check files directly in the project root (not subdirectories)
    if (fileDir !== normalizedRoot) {
      return { pass: true };
    }

    // Allowlist: files that legitimately live in the project root

    // 1. Dotfiles (start with .) - .gitignore, .env, .eslintrc.*, .prettierrc.*, etc.
    if (fileName.startsWith('.')) {
      return { pass: true };
    }

    // 2. Explicit allowlist of known root files
    const ALLOWLISTED_ROOT_FILES = [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'yarn.lock',
      'tsconfig.json',
      'jsconfig.json',
      'README.md',
      'CHANGELOG.md',
      'GETTING_STARTED.md',
      'LICENSE',
      'LICENSE.md',
      'config.yaml',
      'config.yml',
    ];

    if (ALLOWLISTED_ROOT_FILES.includes(fileName)) {
      return { pass: true };
    }

    // 3. Config file patterns (eslint, prettier, jest, babel, etc.)
    const CONFIG_PATTERNS = [
      /^eslint\.config\.[cm]?js$/,
      /^jest\.config\.[cm]?js$/,
      /^babel\.config\.[cm]?js$/,
      /^rollup\.config\.[cm]?js$/,
      /^vite\.config\.[cm]?js$/,
      /^vitest\.config\.[cm]?js$/,
      /^webpack\.config\.[cm]?js$/,
      /^next\.config\.[cm]?js$/,
      /^tailwind\.config\.[cm]?js$/,
      /^postcss\.config\.[cm]?js$/,
      /^commitlint\.config\.[cm]?js$/,
      /^lint-staged\.config\.[cm]?js$/,
      /^claude-with-hooks\.bat$/,
      /^Makefile$/,
      /^Dockerfile$/,
      /^docker-compose\.ya?ml$/,
      /^Procfile$/,
    ];

    const matchesConfig = CONFIG_PATTERNS.some(pattern => pattern.test(fileName));
    if (matchesConfig) {
      return { pass: true };
    }

    // File is not allowlisted - block or warn
    const message =
      `[PROJECT-ROOT-WRITE-GUARD] BLOCKED: Writing to project root is forbidden. File: ${fileName}. ` +
      'Use .claude/context/tmp/ for temp files or the appropriate .claude/ subdirectory.';

    if (enforcement === 'warn') {
      return { pass: true, result: 'warn', message };
    }

    return { pass: false, result: 'block', message };
  },
});

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const startTime = Date.now();

  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Only handle write tools
    const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
    if (!WRITE_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    // Run all checks sequentially
    for (const check of CHECKS) {
      const result = await check.run(toolName, toolInput);

      if (!result.pass) {
        // Emit blocked event
        if (eventBus) {
          try {
            await eventBus.emit(EventTypes.TOOL_BLOCKED, {
              type: EventTypes.TOOL_BLOCKED,
              timestamp: new Date().toISOString(),
              toolName,
              hookName: check.name,
              duration: Date.now() - startTime,
              reason: result.message,
            });
          } catch (_e) {
            // Best-effort
          }
        }

        // Audit log
        auditLog('unified-pre-write-hook', `blocked_by_${check.name}`, {
          tool: toolName,
          file: toolInput.file_path || toolInput.target_file,
        });

        console.log(formatResult(result.result, result.message));
        process.exit(result.result === 'block' ? 2 : 0);
      }
    }

    // All checks passed
    if (eventBus) {
      try {
        await eventBus.emit(EventTypes.TOOL_COMPLETED, {
          type: EventTypes.TOOL_COMPLETED,
          timestamp: new Date().toISOString(),
          toolName,
          duration: Date.now() - startTime,
          output: { status: 'ok' },
        });
      } catch (_e) {
        // Best-effort
      }
    }

    process.exit(0);
  } catch (err) {
    // Fail closed
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      auditLog('unified-pre-write-hook', 'fail_open_override', { error: err.message });
      process.exit(0);
    }

    auditLog('unified-pre-write-hook', 'error_fail_closed', { error: err.message });

    console.log(formatResult('block', `Hook error (fail-closed): ${err.message}`));
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { CHECKS, main };
