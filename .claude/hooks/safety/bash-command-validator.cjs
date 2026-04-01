#!/usr/bin/env node
/**
 * Bash Command Validator Hook
 *
 * PreToolUse hook that validates bash commands using the validator registry.
 * Blocks dangerous commands that could harm the system or data.
 *
 * Exit codes:
 * - 0: Allow operation (command is safe or no validator exists)
 * - 2: Block operation (command is dangerous)
 *
 * The hook fails CLOSED (exits 2) on errors to prevent security bypass.
 * Set BASH_VALIDATOR_FAIL_OPEN=true to override for debugging only.
 *
 * PERF-006: Uses shared hook-input utility to eliminate code duplication.
 */

'use strict';

const { validateCommand } = require('./validators/registry.cjs');
const { spawnSync } = require('child_process');

// PERF-006: Use shared hook-input utility instead of duplicated 55-line parseHookInput function
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const {
  CLAUDE_CODE_DANGEROUS_PATTERNS,
  splitCompoundCommand,
  normalizeCommandToken,
  getLeadingCommandTokens,
  findClaudeCodeDangerousPattern,
  formatDangerousPatternWarning,
  analyzeClaudeCodeDangerousPatterns,
} = require('./validators/claude-code-dangerous-patterns.cjs');

// SEC-AUDIT-020: Import emitBlockVerdict for bypass audit trail
let _emitBlockVerdict;
try {
  const bypassAudit = require('./bypass-audit-hook.cjs');
  _emitBlockVerdict = bypassAudit.emitBlockVerdict;
} catch (_) {
  // best-effort: audit hook unavailable, continue without it
}

/**
 * Emit a block verdict to the bypass audit log before exit(2).
 * Best-effort: never throws, never blocks the hook pipeline.
 *
 * @param {string} command - The blocked bash command
 * @param {string} reason - The reason for blocking
 */
function emitBashBlockVerdict(command, reason) {
  if (typeof _emitBlockVerdict !== 'function') return;
  try {
    const inputHash = typeof command === 'string' ? command.slice(0, 40) : '';
    _emitBlockVerdict({
      hook: 'bash-command-validator',
      tool: 'Bash',
      filePath: inputHash,
      reason,
    });
  } catch (_) {
    // best-effort
  }
}

/**
 * Detect shell commands that commonly trigger "bad substitution" because they
 * contain JavaScript-style template expressions inside ${...}.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectBadSubstitutionRisk(command) {
  if (!command || typeof command !== 'string') return null;

  // Examples to block:
  // - echo ${c.code.substring(0, 80)}
  // - printf "${obj.method()}"
  // Safe shell expansions like ${HOME} or ${var:-default} do not match.
  const jsTemplateInShell =
    /\$\{[^}\n]*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\([^}\n]*\)[^}\n]*\}/;
  if (jsTemplateInShell.test(command)) {
    return (
      'Potential JS template interpolation inside ${...} detected; this causes shell bad substitution. ' +
      'Use shell-safe expansion (e.g. $VAR, ${VAR}) or precompute the value outside Bash.'
    );
  }

  // Block dangling default-expansion patterns that trigger runtime failures:
  // - ${VAR:-$}
  // - ${VAR:-$   (unterminated from templating)
  const danglingDefaultExpansion = /\$\{[A-Za-z_][\w]*:-\$(?:\}|[\s"'`]|$)/;
  if (danglingDefaultExpansion.test(command)) {
    return (
      'Potential bad substitution in default expansion detected (e.g. ${VAR:-$}). ' +
      'Use a concrete fallback value (e.g. ${VAR:-default}) or a valid variable expansion.'
    );
  }

  return null;
}

let cachedRipgrepAvailable = null;
const SAFETY_PREFIX = 'set -euo pipefail';

function buildVersionProbeSpawnOptions() {
  return {
    stdio: 'ignore',
    shell: false,
    timeout: 1000,
    windowsHide: true,
  };
}

function isRipgrepAvailable() {
  if (cachedRipgrepAvailable !== null) {
    return cachedRipgrepAvailable;
  }

  try {
    const result = spawnSync('rg', ['--version'], buildVersionProbeSpawnOptions());
    cachedRipgrepAvailable = Boolean(!result.error && result.status === 0);
  } catch (_err) {
    cachedRipgrepAvailable = false;
  }

  return cachedRipgrepAvailable;
}

function detectRipgrepUnavailable(command, options = {}) {
  if (!command || typeof command !== 'string') return null;
  if (!/(^|\s)rg(\s|$)/.test(command)) return null;

  const ripgrepAvailable =
    typeof options.ripgrepAvailable === 'boolean' ? options.ripgrepAvailable : isRipgrepAvailable();

  if (ripgrepAvailable) return null;

  return (
    'ripgrep (rg) is not available in this environment. ' +
    'Use PowerShell fallback: Get-ChildItem -Recurse <path> -File | Select-String -Pattern "<pattern>".'
  );
}

/**
 * Detect unsupported ripgrep type aliases that cause runtime failures in this
 * environment (e.g. `rg --type cjs`).
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectUnsupportedRipgrepType(command) {
  if (!command || typeof command !== 'string') return null;
  if (!/(^|\s)rg(\s|$)/.test(command)) return null;

  const hasUnsupportedType =
    /(^|\s)--type(?:=|\s+)cjs(\s|$)/i.test(command) ||
    /(^|\s)-t\s*cjs(\s|$)/i.test(command) ||
    /(^|\s)-tcjs(\s|$)/i.test(command);

  if (!hasUnsupportedType) return null;

  return (
    'Unsupported ripgrep type alias "cjs". Use "js" instead (which includes .cjs in many environments) or use globs: ' +
    '`rg -n "<pattern>" -g "*.cjs" -S <path>`.'
  );
}

/**
 * Block Bash-based report generation/writes so agents must use Write/Edit
 * for deterministic artifact creation and traceable diffs.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectBashArtifactWrite(command) {
  if (!command || typeof command !== 'string') return null;

  const artifactPathPattern = /\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]+/i;
  if (!artifactPathPattern.test(command)) return null;

  const writesViaRedirection =
    /(?:^|[\s;|&])(?:cat|echo|printf)\b[\s\S]*?(?:>>?|1>>?)\s*['"]?[^'"\s]*\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]+/i.test(
      command
    ) ||
    /(?:>>?|1>>?)\s*['"]?[^'"\s]*\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]+/i.test(
      command
    );
  const writesViaTee = /\btee\b[\s\S]*\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]+/i.test(
    command
  );
  const writesViaFileOps =
    /\b(?:cp|mv|touch)\b[\s\S]*\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]+/i.test(command);

  if (!writesViaRedirection && !writesViaTee && !writesViaFileOps) return null;

  return (
    'Bash writes to .claude/context/reports or .claude/context/memory are not allowed for task artifacts. ' +
    'Use Write/Edit tools to create report files so hooks can validate wiring and completion.'
  );
}
const detectBashReportWrite = detectBashArtifactWrite;

/**
 * Detect brittle cross-shell counting one-liners that frequently fail on Windows
 * and can accidentally fan out to huge scans/output.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectBrittleCrossShellCount(command) {
  if (!command || typeof command !== 'string') return null;

  const usesDirFindCount =
    /(^|[\s;|&])dir\s+\/s\s+\/b\b/i.test(command) && /\|\s*find\s+\/c\b/i.test(command);
  if (usesDirFindCount) {
    return (
      'Brittle cross-shell count pattern detected (`dir /s /b ... | find /c`). ' +
      'Use PowerShell-native counting instead: ' +
      '(Get-ChildItem -Recurse -File <path> -Filter "*.cjs" | Measure-Object).Count'
    );
  }

  const usesLsWcCount = /\bls\b[\s\S]*\|\s*wc\s+-l\b/i.test(command);
  if (usesLsWcCount) {
    return (
      'Brittle `ls ... | wc -l` pattern detected. ' +
      'Use PowerShell-native counting: (Get-ChildItem -Recurse -File <path> | Measure-Object).Count'
    );
  }

  return null;
}

function detectSearchBypassPattern(command) {
  if (!command || typeof command !== 'string') return null;

  const normalized = command.toLowerCase();
  if (
    normalized.includes('pnpm search:code') ||
    normalized.includes('pnpm search:structure') ||
    /(^|\s)rg(\s|$)/.test(normalized)
  ) {
    return null;
  }

  const broadFindPattern =
    /\bfind\b[\s\S]{0,220}(?:\.claude|tests|src)[\s\S]{0,220}\|\s*(?:while|xargs|sort|grep)\b/i;
  const recursiveGrepPattern =
    /\bgrep\b[\s\S]{0,80}\s-(?:r|rn|nr)\b[\s\S]{0,240}(?:\.claude|tests|src)\b/i;

  if (!broadFindPattern.test(command) && !recursiveGrepPattern.test(command)) {
    return null;
  }

  return (
    'Broad shell scanning detected. Use hybrid search first (`pnpm search:code "<query>" --limit 10`) ' +
    'or `rg` for targeted regex, then run bounded reads.'
  );
}

function isMultilineCommand(command) {
  return typeof command === 'string' && /[\r\n]/.test(command);
}

function hasExplicitShellErrorHandling(command) {
  if (!command || typeof command !== 'string') return false;

  return /(?:^|[\r\n;])\s*set(?:\s+-[A-Za-z]*e[A-Za-z]*\b|\s+-o\s+errexit\b)/im.test(command);
}

function buildUpdatedCommand(command) {
  if (!isMultilineCommand(command) || hasExplicitShellErrorHandling(command)) {
    return null;
  }

  return `${SAFETY_PREFIX}\n${command}`;
}

function writeBlockResponse(reason) {
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
}

function writeAllowResponse({ additionalContext, updatedCommand }) {
  if (!additionalContext && !updatedCommand) {
    return;
  }

  const output = {};

  if (additionalContext) {
    output.additionalContext = additionalContext;
  }

  if (updatedCommand) {
    output.hookSpecificOutput = {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: {
        command: updatedCommand,
      },
    };
  }

  process.stdout.write(JSON.stringify(output));
}

/**
 * Detect bash modifications to reflection queue files to prevent the LLM from
 * bypassing mandatory Step 0 processing by simply wiping the queue files.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectReflectionBypass(command) {
  if (!command || typeof command !== 'string') return null;

  const artifactPathPattern =
    /\.claude[\\/]+context[\\/]+runtime[\\/]+reflection-(spawn-request\.json|reminder\.txt)/i;
  if (!artifactPathPattern.test(command)) return null;

  const writesViaRedirection =
    /(?:>>?|1>>?)\s*['"]?[^'"\s]*\.claude[\\/]+context[\\/]+runtime[\\/]+reflection-/i.test(
      command
    );
  const writesViaTee = /\btee\b[\s\S]*\.claude[\\/]+context[\\/]+runtime[\\/]+reflection-/i.test(
    command
  );
  const modifiesViaFileOps =
    /\b(?:cp|mv|touch|rm|del|echo|printf)\b[\s\S]*\.claude[\\/]+context[\\/]+runtime[\\/]+reflection-/i.test(
      command
    );

  if (!writesViaRedirection && !writesViaTee && !modifiesViaFileOps) return null;

  return (
    'BLOCKED: Direct modification of reflection queue files via Bash is prohibited. ' +
    'You MUST process the queue using the Task tool to spawn reflection-agents, which will automatically clear the queue upon completion.'
  );
}

/**
 * Detect bash commands that manipulate or delete `.claude/worktrees`
 * This prevents agents from accidentally committing suicide by deleting their
 * own active isolated worktree, which breaks the Node runtime loading hooks CWD.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectWorktreeMutation(command) {
  if (!command || typeof command !== 'string') return null;

  // ALLOWLIST: Claude Code's native subagent orchestrator teardown payload MUST be allowed to execute.
  // The system itself emits this exact string when a subagent session terminates.
  if (
    command.includes('git worktree remove') &&
    command.includes('--force 2>&1 || true') &&
    command.includes('git worktree prune')
  ) {
    return null; // Safe: System orchestrator cleanup
  }

  // Block `git worktree remove/prune/add` (but allow `list`)
  // Using global flag to catch chained commands, e.g., `cmd || git worktree prune`
  const dangerousGitWorktreePattern = /\bgit[\s\n\r]+worktree[\s\n\r]+(?:remove|prune|add)\b/gi;
  if (dangerousGitWorktreePattern.test(command)) {
    return (
      'BLOCKED: Agents are strictly prohibited from manually mutating git worktrees (`git worktree remove/prune/add`). ' +
      'Worktrees are critical to process isolation. The background orchestrator cron will securely garbage collect stale trees.'
    );
  }

  // Block native OS deletions against the `.claude/worktrees` trajectory natively
  const deleteWorktreesPathPattern =
    /\b(?:rm|del|Remove-Item)\b[\s\S]*\.claude[\\/]+worktrees[\\/]+/i;

  if (deleteWorktreesPathPattern.test(command)) {
    return (
      'BLOCKED: Direct deletion of `.claude/worktrees` files via Bash is prohibited. ' +
      'Do not attempt to manually clean up agent instances. The background orchestrator automatically handles this.'
    );
  }

  // If we are cd'd into a worktree, blocking rm . is too complex without CWD context,
  // but deleting the path directly is covered above.

  return null;
}

/**
 * Extract the bash command from hook input.
 *
 * @param {object} hookInput - The parsed hook context
 * @returns {string|null} The command string or null if not found
 */
function extractCommand(hookInput) {
  if (!hookInput) return null;

  // PERF-006: Use shared utility to get tool input
  const toolInput = getToolInput(hookInput);

  // The Bash tool uses 'command' parameter
  if (toolInput.command && typeof toolInput.command === 'string') {
    return toolInput.command;
  }

  return null;
}

function isBypassPermissionsMode(hookInput) {
  return Boolean(hookInput && hookInput.permission_mode === 'bypassPermissions');
}

/**
 * Format a blocked command message for display.
 *
 * @param {string} command - The blocked command
 * @param {string} reason - The reason for blocking
 * @returns {string} Formatted message
 */
function formatBlockedMessage(command, reason) {
  const truncatedCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;

  return `
+--------------------------------------------------+
| BLOCKED: Dangerous Command Detected              |
+--------------------------------------------------+
| Command: ${truncatedCmd.padEnd(40)} |
|                                                  |
| Reason: ${reason.slice(0, 41).padEnd(41)}|
|                                                  |
| This command was blocked by the safety hook.     |
| If you believe this is a false positive, review  |
| the command and try a safer alternative.         |
+--------------------------------------------------+
`;
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // PERF-006: Parse the hook input using shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // PERF-006: Verify this is a Bash tool call using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Bash') {
      // Not a Bash tool - should not happen but fail open
      process.exit(0);
    }

    // Extract the command
    const command = extractCommand(hookInput);

    if (!command) {
      // No command to validate - allow
      process.exit(0);
    }

    const badSubstitutionReason = detectBadSubstitutionRisk(command);
    if (badSubstitutionReason) {
      emitBashBlockVerdict(command, badSubstitutionReason);
      console.error(formatBlockedMessage(command, badSubstitutionReason));
      writeBlockResponse(badSubstitutionReason);
      process.exit(2);
    }

    const ripgrepTypeReason = detectUnsupportedRipgrepType(command);
    if (ripgrepTypeReason) {
      emitBashBlockVerdict(command, ripgrepTypeReason);
      console.error(formatBlockedMessage(command, ripgrepTypeReason));
      writeBlockResponse(ripgrepTypeReason);
      process.exit(2);
    }

    const ripgrepMissingReason = detectRipgrepUnavailable(command);
    if (ripgrepMissingReason) {
      emitBashBlockVerdict(command, ripgrepMissingReason);
      console.error(formatBlockedMessage(command, ripgrepMissingReason));
      writeBlockResponse(ripgrepMissingReason);
      process.exit(2);
    }

    const reportWriteReason = detectBashArtifactWrite(command);
    if (reportWriteReason) {
      emitBashBlockVerdict(command, reportWriteReason);
      console.error(formatBlockedMessage(command, reportWriteReason));
      writeBlockResponse(reportWriteReason);
      process.exit(2);
    }

    const brittleCountReason = detectBrittleCrossShellCount(command);
    if (brittleCountReason) {
      if (isBypassPermissionsMode(hookInput)) {
        console.error(
          `[BASH-COMMAND-VALIDATOR][warn] ${brittleCountReason} (allowed in bypassPermissions mode)`
        );
        process.exit(0);
      }
      emitBashBlockVerdict(command, brittleCountReason);
      console.error(formatBlockedMessage(command, brittleCountReason));
      writeBlockResponse(brittleCountReason);
      process.exit(2);
    }

    const searchBypassReason = detectSearchBypassPattern(command);
    if (searchBypassReason) {
      if (isBypassPermissionsMode(hookInput)) {
        console.error(
          `[BASH-COMMAND-VALIDATOR][warn] ${searchBypassReason} (allowed in bypassPermissions mode)`
        );
        process.exit(0);
      }
      emitBashBlockVerdict(command, searchBypassReason);
      console.error(formatBlockedMessage(command, searchBypassReason));
      writeBlockResponse(searchBypassReason);
      process.exit(2);
    }

    const reflectionBypassReason = detectReflectionBypass(command);
    if (reflectionBypassReason) {
      if (isBypassPermissionsMode(hookInput)) {
        console.error(
          `[BASH-COMMAND-VALIDATOR][warn] ${reflectionBypassReason} (allowed in bypassPermissions mode)`
        );
        process.exit(0);
      }
      emitBashBlockVerdict(command, reflectionBypassReason);
      console.error(formatBlockedMessage(command, reflectionBypassReason));
      writeBlockResponse(reflectionBypassReason);
      process.exit(2);
    }

    const worktreeMutationReason = detectWorktreeMutation(command);
    if (worktreeMutationReason) {
      emitBashBlockVerdict(command, worktreeMutationReason);
      console.error(formatBlockedMessage(command, worktreeMutationReason));
      writeBlockResponse(worktreeMutationReason);
      process.exit(2);
    }

    // Validate the command using the registry
    const result = validateCommand(command);

    if (!result.valid) {
      // Command is dangerous - block it
      try {
        await eventBus.emit(EventTypes.SECURITY_VIOLATION, {
          type: EventTypes.SECURITY_VIOLATION,
          timestamp: new Date().toISOString(),
          toolName: 'Bash',
          reason: result.error || 'bash_command_blocked',
        });
      } catch (_err) {
        // Best-effort
      }
      emitBashBlockVerdict(command, result.error || 'Unknown safety violation');
      console.error(formatBlockedMessage(command, result.error || 'Unknown safety violation'));
      writeBlockResponse(result.error || 'Unknown safety violation');
      process.exit(2);
    }

    const dangerousPatternAnalysis = analyzeClaudeCodeDangerousPatterns(command);
    if (dangerousPatternAnalysis.blocked) {
      const reason =
        `Compound command segment ${dangerousPatternAnalysis.blocked.segmentIndex} blocked: ` +
        dangerousPatternAnalysis.blocked.error;
      emitBashBlockVerdict(command, reason);
      console.error(formatBlockedMessage(command, reason));
      writeBlockResponse(reason);
      process.exit(2);
    }

    writeAllowResponse({
      additionalContext:
        dangerousPatternAnalysis.matches.length > 0
          ? formatDangerousPatternWarning(dangerousPatternAnalysis.matches)
          : undefined,
      updatedCommand: buildUpdatedCommand(command),
    });

    // Command is safe - allow
    process.exit(0);
  } catch (err) {
    // SEC-008: Fail CLOSED on errors to prevent bypass attacks
    // An attacker could craft input that triggers errors to bypass validation
    // Defense-in-depth principle: deny by default when security state is unknown

    // Allow debug override for troubleshooting
    if (process.env.BASH_VALIDATOR_FAIL_OPEN === 'true') {
      auditLog('bash-command-validator', 'fail_open_override', {
        error: err.message,
        warning: 'Failing open due to BASH_VALIDATOR_FAIL_OPEN override',
      });
      process.exit(0);
    }

    auditLog('bash-command-validator', 'error_fail_closed', { error: err.message });

    if (process.env.DEBUG_HOOKS) {
      console.error('Bash command validator error - BLOCKING for safety:', err.message);
      console.error('Stack trace:', err.stack);
    }
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'bash-command-validator',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    emitBashBlockVerdict('', `error_fail_closed: ${err.message}`);
    writeBlockResponse(`Bash command validator failed closed: ${err.message}`);
    process.exit(2);
  }
}

// Run main function
main();

// Export for testing
// PERF-006: Alias parseHookInput for backward compatibility
module.exports = {
  main,
  extractCommand,
  formatBlockedMessage,
  detectBadSubstitutionRisk,
  detectUnsupportedRipgrepType,
  detectRipgrepUnavailable,
  buildVersionProbeSpawnOptions,
  detectBashArtifactWrite,
  detectBashReportWrite,
  detectBrittleCrossShellCount,
  detectSearchBypassPattern,
  detectReflectionBypass,
  detectWorktreeMutation,
  isMultilineCommand,
  hasExplicitShellErrorHandling,
  buildUpdatedCommand,
  writeBlockResponse,
  writeAllowResponse,
  isBypassPermissionsMode,
  CLAUDE_CODE_DANGEROUS_PATTERNS,
  splitCompoundCommand,
  normalizeCommandToken,
  getLeadingCommandTokens,
  findClaudeCodeDangerousPattern,
  formatDangerousPatternWarning,
  analyzeClaudeCodeDangerousPatterns,
  parseHookInput: parseHookInputAsync,
};
