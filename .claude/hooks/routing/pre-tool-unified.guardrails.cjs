/* eslint-disable max-lines */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ROOT,
  atomicWriteJSONSync,
  safeParseJSON,
  canonicalizePathForPlatform,
} = require('./pre-tool-unified.shared.cjs');
const { ensureDir } = require('./pre-tool-unified.execution.cjs');
const { isAgentScopedSession } = require('./pre-tool-unified.taskupdate.cjs');
const {
  isFinalizationRequired,
  getFinalizationPrompt,
} = require('../../lib/routing/finalization-checklist.cjs');

/**
 * Agent types that are considered valid finalization subagents.
 * When all pipeline phases are complete, the router should spawn one of these.
 * Extend this list as new finalization-capable agents are added.
 */
const FINALIZATION_AGENT_TYPES = ['qa', 'devops', 'reflection-agent'];

const AGENT_GUARDRAILS_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'agent-guardrails-state.json'
);
const AGENT_BASH_POLL_GUARD = 'AGENT_BASH_POLL_GUARD';
const AGENT_BASH_POLL_STALE_MS = Number(process.env.AGENT_BASH_POLL_STALE_MS || 90 * 1000);
const AGENT_BASH_POLL_REPEAT_THRESHOLD = Number(process.env.AGENT_BASH_POLL_REPEAT_THRESHOLD || 6);
const AGENT_BASH_POLL_WINDOW_MS = Number(process.env.AGENT_BASH_POLL_WINDOW_MS || 120 * 1000);
const AGENT_BASH_POLL_MAX_TRACKED_FILES = Number(
  process.env.AGENT_BASH_POLL_MAX_TRACKED_FILES || 20
);
const AGENT_BASH_ARTIFACT_WRITE_GUARD = 'AGENT_BASH_ARTIFACT_WRITE_GUARD';
const AGENT_WINDOWS_BASH_GUARD = 'AGENT_WINDOWS_BASH_GUARD';
const TASKUPDATE_FIRST_WINDOW_MS = Number(
  process.env.TASKUPDATE_FIRST_WINDOW_MS || 24 * 60 * 60 * 1000
);
const WINDOWS_BASH_GUARDRAIL_MESSAGE =
  '[ROUTER-FIRST PROTOCOL VIOLATION][AGENT-GUARDRAIL] Windows-incompatible Bash heredoc/tmp command blocked. ' +
  'Do not retry with Bash, node -e, or Python in Bash. Use Write/Edit tools: Write({ file_path: "<path>", content: "<content>" }). ' +
  'Avoid `cd /c/...` style prefixes and heredoc (`<<`); use a Windows-safe Bash/PowerShell command or Write/Edit for artifact content.';
const STRUCTURED_MEMORY_PATHS = new Set([
  '.claude/context/memory/patterns.json',
  '.claude/context/memory/gotchas.json',
  '.claude/context/memory/open-findings.json',
  '.claude/context/memory/access-stats.json',
]);

function readAgentGuardrailsState(stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = safeParseJSON(fs.readFileSync(stateFile, 'utf8'), null);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeAgentGuardrailsState(state, stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    ensureDir(path.dirname(stateFile));
    atomicWriteJSONSync(stateFile, state);
  } catch (_err) {
    // Best-effort state tracking.
  }
}

function getSessionGuardrailEntry(hookInput, state) {
  const sessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null;
  if (!sessionId || !state?.sessions || typeof state.sessions !== 'object') {
    return { sessionId: null, entry: null };
  }
  return {
    sessionId,
    entry: state.sessions[sessionId] || null,
  };
}

function getBashCommand(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  if (typeof toolInput.command === 'string') return toolInput.command;
  if (typeof toolInput.cmd === 'string') return toolInput.cmd;
  return '';
}

function normalizeTaskOutputPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let normalized = rawPath.replace(/^['"`]|['"`]$/g, '');
  if (process.platform === 'win32') {
    const unixDriveMatch = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
    if (unixDriveMatch) {
      const drive = unixDriveMatch[1].toUpperCase();
      const rest = unixDriveMatch[2].replace(/\//g, '\\');
      normalized = `${drive}:\\${rest}`;
    }
  }
  return path.resolve(normalized);
}

function extractTaskOutputPathsFromCommand(command) {
  if (!command || typeof command !== 'string') return [];
  const results = new Set();
  const regexes = [
    /([A-Za-z]:\\[^\s"'`]*?tasks\\[^\s"'`]+\.output)/g,
    /(\/[a-zA-Z]\/[^\s"'`]*?\/tasks\/[^\s"'`]+\.output)/g,
  ];
  for (const regex of regexes) {
    let match = regex.exec(command);
    while (match) {
      const normalized = normalizeTaskOutputPath(match[1]);
      if (normalized) results.add(normalized);
      match = regex.exec(command);
    }
  }
  return Array.from(results);
}

function isTaskOutputPollingCommand(command) {
  if (!command || typeof command !== 'string') return false;
  if (extractTaskOutputPathsFromCommand(command).length === 0) return false;
  return /\b(cat|tail|head|grep|wc|ls|stat|sed|awk|Get-Content)\b/i.test(command);
}

function readTailBytes(filePath, maxBytes = 64 * 1024) {
  try {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    if (size <= 0) return '';
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (_err) {
    return '';
  }
}

function hasTerminalTestSummary(outputTail) {
  if (!outputTail || typeof outputTail !== 'string') return false;
  const hasCounts = /#\s+tests\s+\d+/i.test(outputTail) && /#\s+fail\s+\d+/i.test(outputTail);
  const hasLifecycleExit = /ELIFECYCLE|Test failed\. See above for more details\./i.test(
    outputTail
  );
  const hasTapSummary = /1\.\.\d+/i.test(outputTail) && /#\s+duration_ms\s+\d+/i.test(outputTail);
  return hasCounts || hasLifecycleExit || hasTapSummary;
}

function prunePollHistory(pollHistory, now) {
  if (!pollHistory || typeof pollHistory !== 'object') return {};
  const entries = Object.entries(pollHistory)
    .filter(([, value]) => value && typeof value === 'object')
    .sort((a, b) => Number(b[1].lastSeenAt || 0) - Number(a[1].lastSeenAt || 0))
    .slice(0, AGENT_BASH_POLL_MAX_TRACKED_FILES);
  const pruned = {};
  for (const [key, value] of entries) {
    if (now - Number(value.lastSeenAt || 0) <= TASKUPDATE_FIRST_WINDOW_MS) {
      pruned[key] = value;
    }
  }
  return pruned;
}

function evaluateTaskOutputPolling(command, entry) {
  if (!isTaskOutputPollingCommand(command)) {
    return { action: 'allow', updatedEntry: null };
  }

  const now = Date.now();
  const paths = extractTaskOutputPathsFromCommand(command);
  if (paths.length === 0) {
    return { action: 'allow', updatedEntry: null };
  }

  const pollHistory = prunePollHistory(entry?.pollHistory || {}, now);
  let blockMessage = null;

  for (const outputPath of paths) {
    const previous = pollHistory[outputPath] || {
      repeatCount: 0,
      unchangedCount: 0,
      lastSeenAt: 0,
      lastMtimeMs: 0,
    };

    if (!fs.existsSync(outputPath)) {
      pollHistory[outputPath] = {
        ...previous,
        repeatCount:
          now - Number(previous.lastSeenAt || 0) <= AGENT_BASH_POLL_WINDOW_MS
            ? Number(previous.repeatCount || 0) + 1
            : 1,
        lastSeenAt: now,
      };
      continue;
    }

    const stats = fs.statSync(outputPath);
    const staleMs = now - Number(stats.mtimeMs || 0);
    const unchanged = Number(previous.lastMtimeMs || 0) === Number(stats.mtimeMs || 0);
    const repeatCount =
      now - Number(previous.lastSeenAt || 0) <= AGENT_BASH_POLL_WINDOW_MS
        ? Number(previous.repeatCount || 0) + 1
        : 1;
    const unchangedCount = unchanged ? Number(previous.unchangedCount || 0) + 1 : 0;
    const tail = readTailBytes(outputPath);
    const terminal = hasTerminalTestSummary(tail);

    pollHistory[outputPath] = {
      repeatCount,
      unchangedCount,
      lastSeenAt: now,
      lastMtimeMs: Number(stats.mtimeMs || 0),
      terminalSeen: terminal,
    };

    if (terminal) {
      blockMessage =
        `[AGENT-BASH-POLL-GUARD] Blocking repeated polling for "${outputPath}". ` +
        'The output already contains terminal test summary markers. ' +
        'Stop polling and report the final pass/fail counts.';
      break;
    }

    if (
      staleMs >= AGENT_BASH_POLL_STALE_MS &&
      (repeatCount >= AGENT_BASH_POLL_REPEAT_THRESHOLD ||
        unchangedCount >= AGENT_BASH_POLL_REPEAT_THRESHOLD)
    ) {
      blockMessage =
        `[AGENT-BASH-POLL-GUARD] Blocking stale task-output polling for "${outputPath}". ` +
        `No file updates detected for ${Math.round(staleMs / 1000)}s across repeated polls. ` +
        'Switch to diagnosis or spawn a fresh test run instead of looping.';
      break;
    }
  }

  return {
    action: blockMessage ? 'block' : 'allow',
    message: blockMessage,
    updatedEntry: { ...entry, pollHistory, updatedAt: now },
  };
}

function isGitCommitCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return /\bgit\s+(?:commit|push|merge|rebase|cherry-pick)\b/i.test(command);
}

function isCheckpointCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return (
    /\bgit\s+diff\s+--name-only\b/i.test(command) ||
    /\bgit\s+status\s+(?:--porcelain|--short)\b/i.test(command)
  );
}

function isBashArtifactWriteCommand(command) {
  if (!command || typeof command !== 'string') return false;
  const writesWithRedirection = /(cat\s*<<|cat\s+>|>>|\btee\b)/i.test(command);
  if (!writesWithRedirection) return false;
  return /(?:^|[\s"'`\\/])\.claude[\\/]+context[\\/]+(?:reports|memory)[\\/]/i.test(command);
}

function isWindowsIncompatibleBashCommand(command) {
  if (!command || typeof command !== 'string') return false;

  // Deterministic hard-block for /c-style path usage in Bash commands.
  // We enforce this independent of platform because these paths are brittle
  // in our Windows-oriented tool chain and have repeatedly caused guardrail drift.
  const unixDriveCdPrefix = /(?:^|&&|\|\|)\s*cd\s+\/[a-zA-Z]\//i.test(command);
  const unixDrivePathToken = /(?:^|[\s"'`])\/[a-zA-Z]\/[^\s"'`]*/i.test(command);
  if (unixDriveCdPrefix || unixDrivePathToken) {
    return true;
  }

  if (process.platform !== 'win32') return false;
  const usesHeredoc = /<<\s*['"]?[A-Z0-9_-]+['"]?/i.test(command);
  const writesUnixTmp = /(?:^|\s)(?:cat|tee)\s*(?:>|>>).*\/tmp\//i.test(command);
  const readsUnixTmp = /(?:^|\s)cat\s+\/tmp\//i.test(command);
  return usesHeredoc || writesUnixTmp || readsUnixTmp;
}

function evaluateWindowsBashGuard(command, hookInput) {
  const mode = (process.env[AGENT_WINDOWS_BASH_GUARD] || 'block').toLowerCase();
  if (mode === 'off') {
    return { checked: false, reason: 'disabled' };
  }
  if (!isWindowsIncompatibleBashCommand(command)) {
    return { checked: true, action: 'allow' };
  }

  const isBypass =
    hookInput?.permission_mode === 'bypassPermissions' ||
    hookInput?.permissionMode === 'bypassPermissions';
  const isAgent = isAgentScopedSession(hookInput);

  if (isBypass) {
    const { canonicalizePathMentionsInText } = require('../../lib/utils/path-canonicalizer.cjs');
    const rewritten = canonicalizePathMentionsInText(command);
    if (rewritten !== command) {
      return {
        checked: true,
        action: 'rewrite',
        rewrittenCommand: rewritten,
        bypassWarning: `[AGENT-GUARDRAIL][bypass] Auto-rewrote Windows-incompatible bash command to: ${rewritten}`,
      };
    }
  }

  if (mode === 'warn' || (isAgent && isBypass)) {
    return { checked: true, action: 'allow', warning: WINDOWS_BASH_GUARDRAIL_MESSAGE };
  }
  return { checked: true, action: 'block', message: WINDOWS_BASH_GUARDRAIL_MESSAGE };
}

function checkBashArtifactWriteSafety(toolName, toolInput, hookInput) {
  if (toolName !== 'Bash') return { checked: false, reason: 'not_bash' };
  const command = getBashCommand(toolInput);
  const windowsGuardResult = evaluateWindowsBashGuard(command, hookInput);
  if (windowsGuardResult.action === 'block') {
    return windowsGuardResult;
  }
  if (windowsGuardResult.warning) {
    return windowsGuardResult;
  }
  const mode = (process.env[AGENT_BASH_ARTIFACT_WRITE_GUARD] || 'block').toLowerCase();
  if (mode === 'off') return { checked: false, reason: 'disabled' };
  if (!isBashArtifactWriteCommand(command)) return { checked: true, action: 'allow' };
  const message =
    '[AGENT-GUARDRAIL] Bash redirection/heredoc to project artifact paths is blocked. ' +
    'Use Write/Edit tools directly (for example: Write({ file_path: ".claude/context/reports/<name>.md", content: "..." })). ' +
    'Do not use `cat >`, `>>`, or `tee` for artifact writes.';
  if (mode === 'warn') {
    return { checked: true, action: 'allow', warning: message };
  }
  return { checked: true, action: 'block', message };
}

function normalizeToolPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const canonical = canonicalizePathForPlatform(rawPath, PROJECT_ROOT);
  const resolved = path.isAbsolute(canonical) ? canonical : path.resolve(PROJECT_ROOT, canonical);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith('..')) return null;
  return relative.replace(/\\/g, '/');
}

function getMutationPath(toolName, toolInput) {
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    return null;
  }
  const filePath =
    toolInput?.file_path || toolInput?.filePath || toolInput?.path || toolInput?.notebook_path;
  return normalizeToolPath(filePath);
}

function checkStructuredMemoryDirectWrite(toolName, toolInput) {
  const mode = (process.env.MEMORY_DIRECT_WRITE_ENFORCEMENT || 'block').toLowerCase();
  if (mode === 'off') return { checked: false, reason: 'disabled' };

  const mutationPath = getMutationPath(toolName, toolInput);
  if (!mutationPath) return { checked: false, reason: 'no_mutation_path' };

  const normalizedPath = mutationPath.toLowerCase();
  if (!STRUCTURED_MEMORY_PATHS.has(normalizedPath)) {
    return { checked: true, action: 'allow' };
  }

  const message =
    `[MEMORY-GUARD] Direct ${toolName} to structured memory file "${mutationPath}" is not allowed. ` +
    'Use MemoryRecord tool to write structured memory.';

  if (mode === 'warn') {
    return { checked: true, action: 'allow', warning: message };
  }
  return { checked: true, action: 'block', message };
}

function isAllowedByFilePolicy(targetPath, allowlist) {
  if (!targetPath || !Array.isArray(allowlist) || allowlist.length === 0) return true;
  const normalizedTarget = targetPath.toLowerCase();
  return allowlist.some(entry => {
    const normalizedEntry = normalizeToolPath(entry);
    if (!normalizedEntry) return false;
    const candidate = normalizedEntry.toLowerCase();
    return normalizedTarget === candidate || normalizedTarget.startsWith(`${candidate}/`);
  });
}

function isRouterSession(hookInput) {
  if (!hookInput || typeof hookInput !== 'object') return false;
  const agentType = hookInput.agent_type || hookInput.agentType || '';
  return agentType.toLowerCase() === 'router';
}

function checkRouterGuardrails(hookInput, toolName, toolInput) {
  if (toolName === 'Bash') {
    const command = getBashCommand(toolInput);
    const routerGitMode = (process.env.ROUTER_GIT_COMMIT_ENFORCEMENT || 'block').toLowerCase();
    if (routerGitMode !== 'off' && isGitCommitCommand(command)) {
      const message =
        '[ROUTER-GUARDRAIL] Router mode cannot run git commit/push/merge directly. ' +
        'Delegate to a finalization subagent (qa, devops, or developer with allowGitCommit=true).';
      if (routerGitMode === 'warn') return { checked: true, action: 'allow', warning: message };
      return { checked: true, action: 'block', message };
    }
  }
  if (toolName === 'Task') {
    const pipelineContext = hookInput.context || {};
    if (isFinalizationRequired(pipelineContext)) {
      const subagentType = toolInput.subagent_type || toolInput.subagentType || '';
      if (!FINALIZATION_AGENT_TYPES.includes(subagentType.toLowerCase())) {
        const finalizationTypes = FINALIZATION_AGENT_TYPES.join(', ');
        const warning =
          `[ROUTER-GUARDRAIL] All pipeline phases complete. Consider spawning a finalization subagent ` +
          `(${finalizationTypes}) to run lint, format, tests, and git operations before claiming completion. ` +
          `Finalization checklist:\n${getFinalizationPrompt()}`;
        return { checked: true, action: 'allow', warning };
      }
    }
  }
  return null;
}

function checkAgentGuardrails(
  hookInput,
  toolName,
  toolInput,
  stateFile = AGENT_GUARDRAILS_STATE_FILE
) {
  const mode = (process.env.AGENT_GUARDRAIL_ENFORCEMENT || 'block').toLowerCase();
  if (mode === 'off') return { checked: false, reason: 'disabled' };

  if (isRouterSession(hookInput)) {
    const routerResult = checkRouterGuardrails(hookInput, toolName, toolInput);
    if (routerResult) return routerResult;
  }

  if (!isAgentScopedSession(hookInput)) return { checked: false, reason: 'not_agent_session' };

  const state = readAgentGuardrailsState(stateFile);
  const { sessionId, entry } = getSessionGuardrailEntry(hookInput, state);
  if (!sessionId || !entry) return { checked: false, reason: 'missing_policy' };

  if (toolName === 'Bash') {
    const command = getBashCommand(toolInput);
    const windowsGuardResult = evaluateWindowsBashGuard(command, hookInput);
    if (windowsGuardResult.action === 'block') {
      return windowsGuardResult;
    }
    if (windowsGuardResult.warning) {
      return windowsGuardResult;
    }
    const artifactWriteMode = (
      process.env[AGENT_BASH_ARTIFACT_WRITE_GUARD] || 'block'
    ).toLowerCase();
    if (artifactWriteMode !== 'off' && isBashArtifactWriteCommand(command)) {
      const message =
        '[AGENT-GUARDRAIL] Bash redirection/heredoc to project artifact paths is blocked. ' +
        'Use Write/Edit tools directly (for example: Write({ file_path: ".claude/context/reports/<name>.md", content: "..." })). ' +
        'Do not use `cat >`, `>>`, or `tee` for artifact writes.';
      if (artifactWriteMode === 'warn') {
        return { checked: true, action: 'allow', warning: message };
      }
      return { checked: true, action: 'block', message };
    }

    const pollMode = (process.env[AGENT_BASH_POLL_GUARD] || 'block').toLowerCase();
    if (pollMode !== 'off') {
      const pollGuard = evaluateTaskOutputPolling(command, entry);
      if (pollGuard.updatedEntry) {
        state.sessions[sessionId] = pollGuard.updatedEntry;
        writeAgentGuardrailsState(state, stateFile);
      }
      if (pollGuard.action === 'block') {
        if (pollMode === 'warn') {
          return { checked: true, action: 'allow', warning: pollGuard.message };
        }
        return { checked: true, action: 'block', message: pollGuard.message };
      }
    }

    if (isCheckpointCommand(command)) {
      state.sessions[sessionId] = {
        ...entry,
        checkpointDone: true,
        updatedAt: Date.now(),
      };
      writeAgentGuardrailsState(state, stateFile);
      return { checked: true, action: 'allow' };
    }

    const commitMode = (process.env.AGENT_GIT_COMMIT_ENFORCEMENT || 'block').toLowerCase();
    if (commitMode !== 'off' && isGitCommitCommand(command) && entry.allowGitCommit !== true) {
      const message =
        '[AGENT-GUARDRAIL] git commit/push/merge/rebase is blocked unless explicitly allowed in spawn policy.';
      if (commitMode === 'warn') {
        return { checked: true, action: 'allow', warning: message };
      }
      return { checked: true, action: 'block', message };
    }
  }

  const mutationPath = getMutationPath(toolName, toolInput);
  if (!mutationPath) {
    return { checked: true, action: 'allow' };
  }

  const fileAllowlistMode = (process.env.AGENT_FILE_ALLOWLIST_ENFORCEMENT || 'block').toLowerCase();
  const hasAllowlist = Array.isArray(entry.allowedFiles) && entry.allowedFiles.length > 0;
  if (hasAllowlist && !isAllowedByFilePolicy(mutationPath, entry.allowedFiles)) {
    const message = `[AGENT-GUARDRAIL] File "${mutationPath}" is outside the assigned allowlist.`;
    if (fileAllowlistMode === 'warn') {
      return { checked: true, action: 'allow', warning: message };
    }
    if (fileAllowlistMode === 'off') {
      // continue
    } else {
      return { checked: true, action: 'block', message };
    }
  }

  const checkpointMode = (process.env.AGENT_EDIT_CHECKPOINT_ENFORCEMENT || 'block').toLowerCase();
  const touchedFiles = Array.isArray(entry.touchedFiles) ? entry.touchedFiles : [];
  const nextTouched = touchedFiles.includes(mutationPath)
    ? touchedFiles
    : [...touchedFiles, mutationPath];

  if (!entry.firstMutationSeen) {
    state.sessions[sessionId] = {
      ...entry,
      firstMutationSeen: true,
      checkpointDone: false,
      touchedFiles: nextTouched,
      updatedAt: Date.now(),
    };
    writeAgentGuardrailsState(state, stateFile);
    return {
      checked: true,
      action: 'allow',
      warning:
        '[AGENT-GUARDRAIL] First mutation recorded. Run `git diff --name-only` before additional edits.',
    };
  }

  if (!entry.checkpointDone && checkpointMode !== 'off') {
    const message =
      '[AGENT-GUARDRAIL] Missing checkpoint. Run `git diff --name-only` or `git status --porcelain` before additional edits.';
    if (checkpointMode === 'warn') {
      state.sessions[sessionId] = {
        ...entry,
        touchedFiles: nextTouched,
        updatedAt: Date.now(),
      };
      writeAgentGuardrailsState(state, stateFile);
      return { checked: true, action: 'allow', warning: message };
    }
    return { checked: true, action: 'block', message };
  }

  state.sessions[sessionId] = {
    ...entry,
    touchedFiles: nextTouched,
    updatedAt: Date.now(),
  };
  writeAgentGuardrailsState(state, stateFile);
  return { checked: true, action: 'allow' };
}

module.exports = {
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
  checkBashArtifactWriteSafety,
  checkAgentGuardrails,
  extractTaskOutputPathsFromCommand,
  isTaskOutputPollingCommand,
  hasTerminalTestSummary,
  evaluateTaskOutputPolling,
  isGitCommitCommand,
  isCheckpointCommand,
  normalizeToolPath,
  checkStructuredMemoryDirectWrite,
  isAllowedByFilePolicy,
  isWindowsIncompatibleBashCommand,
  evaluateWindowsBashGuard,
  isRouterSession,
  FINALIZATION_AGENT_TYPES,
};
