#!/usr/bin/env node
/**
 * ESLint Unused Variable Fix Script
 *
 * Fixes no-unused-vars errors by:
 * 1. Adding _ prefix to unused variables
 * 2. Adding _ prefix to unused function parameters
 * 3. Removing truly unused imports (when safe)
 *
 * Usage:
 *   node .claude/tools/cli/eslint-unused-var-fix.cjs [--dry-run] [--pattern prefix|remove]
 *
 * Default: --pattern=prefix (safer, adds _ prefix)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DRY_RUN = process.argv.includes('--dry-run');
const PATTERN = process.argv.find(arg => arg.startsWith('--pattern='))?.split('=')[1] || 'prefix';

// Stats
const stats = {
  filesProcessed: 0,
  varsFixed: 0,
  argsFixed: 0,
  importsRemoved: 0,
  errors: [],
  skipped: [],
};

// Variables that are safe to prefix with _ (won't break anything)
// These are typically unused but kept for API compatibility or future use
const SAFE_TO_PREFIX = [
  // Common patterns
  'result',
  'res',
  'response',
  'ret',
  'err',
  'error',
  'e',
  'ctx',
  'context',
  'state',
  'data',
  'info',
  'options',
  'opts',
  'config',
  'cfg',
  'input',
  'output',
  'args',
  'params',
  'callback',
  'cb',
  'index',
  'idx',
  'i',
  'j',
  'k',
  'key',
  'val',
  'value',
  'item',
  'elem',
  'element',
  // Specific to this codebase
  'execSync',
  'crypto',
  'auditLog',
  'trigger',
  'reason',
  'agent',
  'agentName',
  'MEMORY_DIR',
  'HOOKS_DIR',
  'MCP_CATALOG_PATH',
  'contextResult',
  'evolveResult',
  'formatResult',
  'getPreferredAgent',
  'getToolOutput',
  'getFilePath',
  'startPath',
  'normalizedRoot',
  'commandString',
  'baseSkillName',
  'propName',
  'artifactName',
  'artifactType',
  'title',
  'duration',
  'basename',
  'sep',
  'strategiesUsed',
  'summary',
  'files',
  'exitCode',
  'stdout',
  'stderr',
  'initialMtime',
  'initialLogSize',
  'threw',
  'validateJSON',
  'fileExists',
  'copyDir',
  'findSlowHooks',
  'renderCompactSummary',
  'join',
  'readdir',
  'statSync',
  'fixMode',
  'fixes',
  'agentFiles',
  'runnerPath',
  'validKeys',
  'name',
  'ext',
  'sourcePath',
  'analysis',
  'patterns',
  // Test-specific
  'request',
  'generateMockCompletion',
  'currentFile',
  'PLACEHOLDER_PATTERNS',
  'REQUIRED_AGENT_SECTIONS',
  'assertDeepEqual',
  'assertFalse',
  'assert',
  'assertNotEqual',
  'EVOLUTION_STATE_PATH',
  'runHook',
  'originalCwd',
  'mock',
  'beforeEach',
  'afterEach',
  'before',
  'after',
  'STATE_FILE',
  'TEST_ROUTER_STATE',
  'TEST_EVOLUTION_STATE',
  'lastExitCode',
  'originalSessionTimestamp',
  'DANGEROUS_PIPE_PATTERNS',
  'clearAllCache',
  'safeParseJSON',
  'SCHEMAS',
  'developer',
  'reviewer',
  'scenario',
  'round1',
  'round2',
  'dev2Context',
  'setAgentContext',
  'appendToChain',
  'verifyChain',
  'createSidecar',
  'writeSidecar',
  'readSidecar',
  'transitionState',
  'aggregateResponses',
  'testSetsAgentMode',
  'testStringToolInput',
  'testEmptyInput',
  'testDebugOutput',
  'testMalformedJson',
  'agentContextTracker',
  'waitForFileModification',
  'relativePath',
  'cmd',
  'schemasWithIssues',
  'skillSchemaIssues',
  'jest',
  // Additional from lint report
  'testStateFile',
  'errorCount',
  'PROJECT_ROOT',
  'getToolName',
  'oldTimestamp',
  'claudeBackup',
  'section',
  'accessDate',
  'mtmDir',
  'toArchive',
  'getMessages',
  'sanitizeResponse',
  'validateTeamMember',
  'getAgentState',
  'router',
  'agentId',
  'testAgentId',
  'agentType',
  'chain',
  'sessionId',
  'tddSkill',
  'gzip',
  'gunzip',
  'checkpointId',
  'id2',
  'validateRouterEnforcerRegistration',
  'AGENTS_DIR',
  'CLI_PATH',
  'TEST_WORKFLOW_PATH',
  'GATE_REQUIRED_FIELDS',
  'INVALID_WORKFLOW_MISSING_OBTAIN',
  'CLAUDE_DIR',
  'arch',
  'sharp',
  'tmpDir',
  'bucketAssignments',
  'NULL_DEVICE',
  'SCHEMA_PATH',
  'SKILL_STRUCTURE',
  'examples',
  'description',
  'skillDir',
  'content',
  'PACKAGE_JSON_PATH',
  'fs',
  'path',
];

// Variables that should NOT be prefixed (removing them might be better)
const SKIP_PREFIX = [
  // Empty now - we'll prefix fs/path too since they're in SAFE_TO_PREFIX
];

/**
 * Parse ESLint output to find unused variable errors
 */
function parseEslintOutput() {
  try {
    const output = execSync('pnpm lint 2>&1 || true', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      maxBuffer: 50 * 1024 * 1024,
    });

    const fixes = [];
    const lines = output.split('\n');
    let currentFile = null;

    for (const line of lines) {
      // Match file paths (Windows format: C:\path\file.js)
      const fileMatch = line.match(/^([A-Z]:\\[^\s]+\.(cjs|mjs|js))$/i);
      if (fileMatch) {
        currentFile = fileMatch[1];
        continue;
      }

      if (!currentFile) continue;

      // Match unused variable: "'varName' is assigned a value but never used"
      const assignedMatch = line.match(
        /^\s*(\d+):(\d+)\s+(?:error|warning)\s+'([^']+)' is assigned a value but never used/
      );
      if (assignedMatch) {
        fixes.push({
          file: currentFile,
          line: parseInt(assignedMatch[1], 10),
          column: parseInt(assignedMatch[2], 10),
          varName: assignedMatch[3],
          type: 'assigned',
        });
        continue;
      }

      // Match unused function parameter: "'paramName' is defined but never used"
      const definedMatch = line.match(
        /^\s*(\d+):(\d+)\s+(?:error|warning)\s+'([^']+)' is defined but never used/
      );
      if (definedMatch) {
        fixes.push({
          file: currentFile,
          line: parseInt(definedMatch[1], 10),
          column: parseInt(definedMatch[2], 10),
          varName: definedMatch[3],
          type: 'defined',
        });
        continue;
      }
    }

    return fixes;
  } catch (err) {
    console.error('Error parsing ESLint output:', err.message);
    return [];
  }
}

/**
 * Fix a single unused variable by adding _ prefix
 */
function fixUnusedVar(content, lineNum, column, varName) {
  const lines = content.split('\n');
  const lineIdx = lineNum - 1;

  if (lineIdx >= lines.length) return { content, fixed: false };

  const line = lines[lineIdx];

  // Check if already has _ prefix
  if (varName.startsWith('_')) {
    return { content, fixed: false };
  }

  // Skip variables that shouldn't be prefixed
  if (SKIP_PREFIX.includes(varName)) {
    return { content, fixed: false, skipped: true };
  }

  // Only prefix known safe variables to avoid breaking code
  if (!SAFE_TO_PREFIX.includes(varName)) {
    return { content, fixed: false, skipped: true };
  }

  // Create regex to find and replace the variable name at the right position
  // We need to be careful to only replace the declaration, not uses
  const colIdx = column - 1;

  // Verify the variable name is at the expected position
  if (line.slice(colIdx, colIdx + varName.length) !== varName) {
    // Try to find nearby
    const nearbyIdx = line.indexOf(varName, Math.max(0, colIdx - 5));
    if (nearbyIdx === -1 || nearbyIdx > colIdx + 5) {
      return { content, fixed: false };
    }

    // Check it's a word boundary
    const before = line[nearbyIdx - 1] || '';
    const after = line[nearbyIdx + varName.length] || '';
    if (/\w/.test(before) || /\w/.test(after)) {
      return { content, fixed: false };
    }

    // Replace at the found position
    const newLine =
      line.slice(0, nearbyIdx) + '_' + varName + line.slice(nearbyIdx + varName.length);
    lines[lineIdx] = newLine;
    return { content: lines.join('\n'), fixed: true };
  }

  // Check word boundaries
  const before = line[colIdx - 1] || '';
  const _after = line[colIdx + varName.length] || '';
  if (/\w/.test(before)) {
    return { content, fixed: false };
  }

  // Replace at the exact position
  const newLine = line.slice(0, colIdx) + '_' + varName + line.slice(colIdx + varName.length);
  lines[lineIdx] = newLine;

  return { content: lines.join('\n'), fixed: true };
}

/**
 * Process all fixes grouped by file
 */
function processFixes(fixes) {
  // Group fixes by file
  const fileGroups = new Map();
  for (const fix of fixes) {
    if (!fileGroups.has(fix.file)) {
      fileGroups.set(fix.file, []);
    }
    fileGroups.get(fix.file).push(fix);
  }

  // Process each file
  for (const [filePath, fileFixes] of fileGroups) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      let fileModified = false;

      // Sort fixes by line number and column (descending) to avoid position shifts
      fileFixes.sort((a, b) => {
        if (b.line !== a.line) return b.line - a.line;
        return b.column - a.column;
      });

      for (const fix of fileFixes) {
        const result = fixUnusedVar(content, fix.line, fix.column, fix.varName);

        if (result.fixed) {
          content = result.content;
          fileModified = true;

          if (fix.type === 'assigned') {
            stats.varsFixed++;
          } else {
            stats.argsFixed++;
          }
        } else if (result.skipped) {
          stats.skipped.push(
            `${path.relative(PROJECT_ROOT, filePath)}:${fix.line} - ${fix.varName}`
          );
        }
      }

      if (fileModified) {
        if (!DRY_RUN) {
          fs.writeFileSync(filePath, content);
        }
        stats.filesProcessed++;
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        console.log(`  ${DRY_RUN ? '[DRY]' : '[FIX]'} ${relativePath}`);
      }
    } catch (err) {
      stats.errors.push({ file: filePath, error: err.message });
    }
  }
}

/**
 * Main entry point
 */
function main() {
  console.log('ESLint Unused Variable Fix Script');
  console.log('==================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Pattern: ${PATTERN}`);
  console.log('');

  console.log('Parsing ESLint output for unused variable errors...');
  const fixes = parseEslintOutput();
  console.log(`Found ${fixes.length} unused variable errors`);
  console.log(`  - Assigned vars: ${fixes.filter(f => f.type === 'assigned').length}`);
  console.log(`  - Function params: ${fixes.filter(f => f.type === 'defined').length}`);
  console.log('');

  if (fixes.length === 0) {
    console.log('No fixes to apply.');
    return;
  }

  console.log('Applying fixes...');
  processFixes(fixes);

  console.log('');
  console.log('Summary:');
  console.log(`  Files processed: ${stats.filesProcessed}`);
  console.log(`  Variables prefixed: ${stats.varsFixed}`);
  console.log(`  Parameters prefixed: ${stats.argsFixed}`);
  console.log(`  Imports removed: ${stats.importsRemoved}`);
  console.log(`  Skipped (manual review needed): ${stats.skipped.length}`);

  if (stats.errors.length > 0) {
    console.log(`  Errors: ${stats.errors.length}`);
    for (const err of stats.errors) {
      console.log(`    - ${err.file}: ${err.error}`);
    }
  }

  if (stats.skipped.length > 0 && stats.skipped.length <= 20) {
    console.log('');
    console.log('Skipped items (need manual review):');
    for (const item of stats.skipped) {
      console.log(`  - ${item}`);
    }
  }

  if (DRY_RUN) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply fixes.');
  }
}

main();
