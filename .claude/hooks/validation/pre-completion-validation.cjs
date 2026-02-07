#!/usr/bin/env node
/**
 * pre-completion-validation.cjs
 *
 * PreToolUse hook that validates artifact integration before allowing
 * TaskUpdate(status: "completed").
 *
 * WHEN IT RUNS:
 * - Before TaskUpdate tool execution
 * - Only when status is being set to "completed"
 *
 * WHAT IT DOES:
 * - Detects if task involves artifact creation
 * - Runs integration validation
 * - Blocks completion if validation fails
 * - Provides clear remediation steps
 *
 * Part of the Post-Creation Validation Workflow.
 * @see .claude/workflows/core/post-creation-validation.md
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Paths
const VALIDATION_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'validate-integration.cjs'
);

/**
 * Extract task metadata from TaskUpdate parameters.
 */
function extractTaskMetadata(params) {
  try {
    const metadata = params.metadata || {};
    return {
      filesModified: metadata.filesModified || [],
      summary: metadata.summary || '',
      taskId: params.taskId,
    };
  } catch (_err) {
    return { filesModified: [], summary: '', taskId: null };
  }
}

/**
 * Detect if any modified files are artifacts.
 */
function detectArtifacts(filesModified) {
  const artifacts = [];

  for (const filePath of filesModified) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check if it's an artifact path
    if (
      normalizedPath.includes('/.claude/agents/') ||
      normalizedPath.includes('/.claude/skills/') ||
      normalizedPath.includes('/.claude/workflows/') ||
      normalizedPath.includes('/.claude/hooks/')
    ) {
      // Extract artifact info
      const type = normalizedPath.includes('/agents/')
        ? 'agent'
        : normalizedPath.includes('/skills/')
          ? 'skill'
          : normalizedPath.includes('/workflows/')
            ? 'workflow'
            : 'hook';

      artifacts.push({
        path: filePath,
        type,
      });
    }
  }

  return artifacts;
}

/**
 * Run validation script on artifact.
 */
function validateArtifact(artifactPath) {
  try {
    // Run validation script
    // SEC-FIX: Use spawnSync with array args instead of string interpolation (prevents command injection)
    const result = spawnSync(process.execPath, [VALIDATION_SCRIPT, artifactPath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Check exit code
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'Validation failed');
    }

    return { passed: true, issues: [] };
  } catch (err) {
    // Validation failed - parse output for issues
    const output = err.stdout || err.stderr || '';
    const issues = [];

    // Extract failed checks from output
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('✗') || line.includes('FAIL')) {
        issues.push(line.trim());
      }
    }

    return {
      passed: false,
      issues: issues.length > 0 ? issues : ['Integration validation failed'],
    };
  }
}

/**
 * Main hook execution.
 */
function main(hookInput) {
  try {
    // Parse hook input
    const input = typeof hookInput === 'string' ? JSON.parse(hookInput) : hookInput;
    const { tool, params } = input;

    // Only intercept TaskUpdate calls
    if (tool !== 'TaskUpdate') {
      // Not a TaskUpdate call - allow
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Only intercept when status is being set to "completed"
    if (params.status !== 'completed') {
      // Not completing a task - allow
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Extract task metadata
    const metadata = extractTaskMetadata(params);

    // Detect artifacts in modified files
    const artifacts = detectArtifacts(metadata.filesModified);

    // If no artifacts, allow completion
    if (artifacts.length === 0) {
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Validate each artifact
    const failedArtifacts = [];

    for (const artifact of artifacts) {
      const validation = validateArtifact(artifact.path);
      if (!validation.passed) {
        failedArtifacts.push({
          ...artifact,
          issues: validation.issues,
        });
      }
    }

    // If all artifacts passed, allow completion
    if (failedArtifacts.length === 0) {
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Block completion - validation failed
    const blockMessage = [
      '',
      '+----------------------------------------------------------+',
      '| PRE-COMPLETION VALIDATION FAILED                         |',
      '+----------------------------------------------------------+',
      '| Cannot complete task - artifact integration incomplete.  |',
      '|                                                          |',
      `| Task ID: ${metadata.taskId || 'unknown'}`,
      `| Artifacts with issues: ${failedArtifacts.length}`,
      '|                                                          |',
    ];

    for (const artifact of failedArtifacts) {
      blockMessage.push(`|  [${artifact.type}] ${path.basename(artifact.path)}`);
      for (const issue of artifact.issues.slice(0, 3)) {
        // Max 3 issues shown
        blockMessage.push(`|    - ${issue.substring(0, 50)}`);
      }
    }

    blockMessage.push('|                                                          |');
    blockMessage.push('| Required action:                                         |');
    blockMessage.push('|  1. Run: node .claude/tools/cli/validate-integration.cjs \\|');
    blockMessage.push('|           <artifact-path>                                |');
    blockMessage.push('|  2. Fix reported issues                                 |');
    blockMessage.push('|  3. Re-run TaskUpdate to complete                       |');
    blockMessage.push('|                                                          |');
    blockMessage.push('| See: .claude/workflows/core/post-creation-validation.md  |');
    blockMessage.push('+----------------------------------------------------------+');
    blockMessage.push('');

    // Block with message
    console.log(
      JSON.stringify({
        allow: false,
        message: blockMessage.join('\n'),
      })
    );
    process.exit(0);
  } catch (err) {
    // Error in hook - allow completion (fail open)
    console.log(
      JSON.stringify({
        allow: true,
        message: `Pre-completion validation error: ${err.message}`,
      })
    );
    process.exit(0);
  }
}

// Read hook input from stdin
let hookInput = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => {
  hookInput += chunk;
});
process.stdin.on('end', () => {
  main(hookInput);
});
