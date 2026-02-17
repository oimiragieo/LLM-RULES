'use strict';

const path = require('path');
const {
  extractFilePath,
  getEnforcementMode,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const routerState = require('../../lib/routing/router-state.cjs');
const {
  BLACKLISTED_TOOLS,
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  isAlwaysAllowedWrite,
  isWhitelistedBashCommand,
} = require('./routing-guard-core.policy.cjs');
const {
  getMemoryMonitor,
  getViolationTracker,
  getCachedRouterState,
  registerBlockAttempt,
  compactFallbackMessage,
  buildRouterSelfCheckMessage,
} = require('./routing-guard-core.shared.cjs');

function hasExplicitAgentContext(hookInput = null) {
  if (!hookInput || typeof hookInput !== 'object') return false;
  const taskId = String(hookInput.task_id || hookInput.taskId || '').trim();
  if (taskId) return true;
  const allowedTools = Array.isArray(hookInput.allowed_tools) ? hookInput.allowed_tools : [];
  if (allowedTools.includes('TaskUpdate')) return true;
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId && agentId !== 'router') return true;

  // Fallback: check persistent router state
  try {
    const state = getCachedRouterState();
    if (state.mode === 'agent' || state.taskSpawned === true) return true;
    if (state.currentSpawnTaskId || state.lastTaskUpdateTaskId) return true;
  } catch (_err) {
    // Best-effort only
  }

  return false;
}

function extractPrimaryShellCommand(command) {
  if (!command || typeof command !== 'string') return '';

  const segments = command
    .split(/&&|\|\||;/)
    .map(segment => segment.trim())
    .filter(Boolean);
  if (!segments.length) return '';

  let first = segments[0];
  // Skip leading env var assignments like FOO=bar BAR=baz cmd ...
  while (/^[A-Za-z_][\w]*=/.test(first)) {
    const spaceIndex = first.indexOf(' ');
    if (spaceIndex === -1) return '';
    first = first.slice(spaceIndex + 1).trim();
  }
  if (!first) return '';

  const firstToken = first.split(/\s+/)[0];
  const basename = firstToken.includes('/') ? firstToken.split('/').pop() : firstToken;
  return String(basename || '')
    .trim()
    .toLowerCase();
}

function checkRouterBash(toolName, toolInput = {}, hookInput = null) {
  if (toolName !== 'Bash') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('ROUTER_BASH_GUARD', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(
      'routing-guard',
      'ROUTER_BASH_GUARD',
      'off',
      'Router can use any Bash command'
    );
    return { pass: true };
  }

  if (hasExplicitAgentContext(hookInput)) {
    return { pass: true };
  }
  try {
    if (
      typeof routerState.getCurrentSpawnTaskId === 'function' &&
      routerState.getCurrentSpawnTaskId()
    ) {
      return { pass: true };
    }
  } catch (_err) {
    // Best-effort only.
  }

  const command = toolInput.command || '';
  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  const isBypassPermissions = permissionMode === 'bypasspermissions';
  const isBrittleSleepCatPolling =
    typeof command === 'string' &&
    /\b(sleep|timeout)\b/i.test(command) &&
    /\bcat\b/i.test(command) &&
    /\/c\/users\//i.test(command);
  if (isBypassPermissions && isBrittleSleepCatPolling) {
    return {
      pass: false,
      result: 'block',
      message:
        '[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER BASH GUARD][bypass] Blocked brittle sleep+cat polling command. ' +
        'Use Read with offset/limit against a concrete file path instead.',
    };
  }
  if (isBypassPermissions) {
    const primaryCommand = extractPrimaryShellCommand(command);
    const isDiscovery =
      typeof command === 'string' &&
      ['find', 'ls', 'grep', 'stat', 'head', 'tail', 'cat', 'wc', 'sort', 'uniq', 'du', 'df'].includes(
        primaryCommand
      ) &&
      !/>>|>/.test(command); // No redirection

    const message =
      '[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER BASH GUARD][bypass] Direct Bash is not allowed in router mode, even with bypassPermissions. ' +
      'Use whitelisted git discovery commands only, or delegate via Task() to a specialist agent.';

    if (isWhitelistedBashCommand(command) || isDiscovery) {
      return { pass: true, result: 'warn', message };
    }
    return { pass: false, result: 'block', message };
  }

  if (isWhitelistedBashCommand(command)) {
    return { pass: true };
  }

  const truncatedCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;
  const dedupe = registerBlockAttempt('router-bash-check', toolName, hookInput);
  const violationTitle =
    enforcement === 'block'
      ? 'ROUTER-FIRST PROTOCOL VIOLATION | ROUTER BASH VIOLATION BLOCKED (ADR-030)'
      : 'ROUTER-FIRST PROTOCOL VIOLATION | ROUTER BASH VIOLATION WARNED (ADR-030)';
  if (dedupe.dedupe) {
    const fallback =
      "Task({ task_id: 'task-1', subagent_type: 'general-purpose', description: 'Run bash command safely', prompt: 'Use Bash for the required command and report results.' })";
    const message = compactFallbackMessage(
      violationTitle,
      truncatedCmd || 'bash',
      dedupe.count,
      fallback
    );
    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    return { pass: true, result: 'warn', message };
  }
  const message = `
+======================================================================+
|  ${violationTitle.padEnd(66)}|
+======================================================================+
|  Command: ${truncatedCmd.padEnd(56)}|
|                                                                      |
|  Router can ONLY use these Bash commands:                            |
|    - git status [-s|--short]                                         |
|    - git log --oneline -N (where N is 1-99)                          |
|    - git diff --name-only                                            |
|    - git branch                                                      |
|                                                                      |
|  ALL other Bash commands require spawning an agent:                  |
|    - Test execution (pnpm test, npm test) --> Spawn QA               |
|    - Build commands --> Spawn DEVELOPER                              |
|    - File operations --> Spawn DEVELOPER                             |
|                                                                      |
|  Example:                                                            |
|    Task({                                                            |
  task_id: 'task-2',
|      subagent_type: 'general-purpose',                               |
|      description: 'QA running tests',                                |
|      prompt: 'You are QA. Run tests and analyze results...'          |
|    })                                                                |
|                                                                      |
+======================================================================+
`;

  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: 'Bash',
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'router-bash-whitelist',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
      metadata: { command: truncatedCmd },
    });
  }

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

function checkRouterSelfCheck(toolName, toolInput = {}, hookInput = null) {
  const DEBUG = process.env.ROUTER_DEBUG === 'true';

  function debugLog(message, data = null) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [routing-guard]`;
    if (data) {
      console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`${prefix} ${message}`);
    }
  }

  debugLog('checkRouterSelfCheck called', { tool: toolName });

  const enforcement = getEnforcementMode('ROUTER_SELF_CHECK', 'block');
  debugLog('Enforcement mode check', { enforcement });

  if (enforcement === 'off') {
    debugLog('ALLOW: enforcement disabled');
    return { pass: true };
  }

  if (WHITELISTED_TOOLS.includes(toolName)) {
    debugLog('ALLOW: tool is whitelisted', { tool: toolName });
    return { pass: true };
  }

  if (!BLACKLISTED_TOOLS.includes(toolName)) {
    debugLog('ALLOW: tool not in blacklist', { tool: toolName });
    return { pass: true };
  }

  debugLog('Tool is blacklisted, checking context...', { tool: toolName });

  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = extractFilePath(toolInput);
    if (isAlwaysAllowedWrite(filePath)) {
      debugLog('ALLOW: write to always-allowed file', { tool: toolName, filePath });
      return { pass: true };
    }
  }

  const state = getCachedRouterState();
  debugLog('Router state check', {
    mode: state.mode,
    taskSpawned: state.taskSpawned,
    lastReset: state.lastReset,
  });

  if (hasExplicitAgentContext(hookInput)) {
    debugLog('ALLOW: Agent mode or task spawned', {
      mode: state.mode,
      taskSpawned: state.taskSpawned,
    });
    return { pass: true };
  }

  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  const isBypassPermissions = permissionMode === 'bypasspermissions';
  if (isBypassPermissions && toolName === 'WebSearch') {
    const dedupe = registerBlockAttempt('router-bypass-websearch', toolName, hookInput);
    if (dedupe.dedupe) {
      return {
        pass: false,
        result: 'block',
        message:
          `[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER SELF-CHECK BYPASS] Repeated WebSearch in bypassPermissions mode (${dedupe.count}x) is blocked to prevent loops. ` +
          'Spawn a researcher/planner via Task() for external research.',
      };
    }
    return {
      pass: true,
      result: 'warn',
      message:
        '[ROUTER SELF-CHECK BYPASS] Allowing one WebSearch in bypassPermissions mode. ' +
        'Do not loop WebSearch; spawn a researcher/planner via Task() if more research is needed.',
    };
  }
  if (
    isBypassPermissions &&
    (toolName === 'Glob' ||
      toolName === 'Grep' ||
      toolName === 'Write' ||
      toolName === 'Edit' ||
      toolName === 'NotebookEdit')
  ) {
    return {
      pass: true,
      result: 'warn',
      message:
        `[ROUTER SELF-CHECK BYPASS] Allowing ${toolName} in bypassPermissions mode to avoid router deadlocks. ` +
        'Prefer Task() delegation for deeper analysis.',
    };
  }

  debugLog('BLOCK: Router using blacklisted tool', { tool: toolName, enforcement });
  const dedupe = registerBlockAttempt('router-self-check', toolName, hookInput);
  const message = buildRouterSelfCheckMessage(toolName, dedupe);

  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: toolName,
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'router-blacklist',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
    });
  }

  if (enforcement === 'block') {
    debugLog('Returning BLOCK decision');
    return { pass: false, result: 'block', message };
  } else {
    debugLog('Returning WARN decision');
    return { pass: true, result: 'warn', message };
  }
}

function hasReadWindow(toolInput = {}) {
  const numeric = value => Number.isFinite(Number(value)) && Number(value) >= 0;
  return (
    numeric(toolInput.offset) ||
    numeric(toolInput.limit) ||
    numeric(toolInput.start_line) ||
    numeric(toolInput.end_line) ||
    numeric(toolInput.startLine) ||
    numeric(toolInput.endLine)
  );
}

function checkRouterReadGovernance(toolName, toolInput = {}) {
  if (toolName !== 'Read') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('ROUTER_READ_GOVERNANCE', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const state = getCachedRouterState();
  if (state.mode === 'agent' || state.taskSpawned) {
    return { pass: true };
  }

  if (hasReadWindow(toolInput)) {
    return { pass: true };
  }

  const message =
    '[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER READ GOVERNANCE] Unwindowed Read blocked in router mode. ' +
    'Run hybrid search first (`pnpm search:code`), then use Read with offset/limit. ' +
    'If context pressure is high, invoke token-saver-context-compression before large reads.';

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkRouterWrite(toolName, toolInput) {
  if (!WRITE_TOOLS.includes(toolName)) {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('ROUTER_WRITE_GUARD', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(
      'routing-guard',
      'ROUTER_WRITE_GUARD',
      'off',
      'Router can write without agent context'
    );
    return { pass: true };
  }

  const filePath = extractFilePath(toolInput);

  if (isAlwaysAllowedWrite(filePath)) {
    return { pass: true };
  }

  const { allowed } = routerState.checkWriteAllowed();
  if (allowed) {
    return { pass: true };
  }

  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const message = `[ROUTER-FIRST PROTOCOL VIOLATION][ROUTER WRITE BLOCKED] Tool: ${toolName}, File: ${fileName}
The Router cannot directly edit files. Spawn an agent using the Task tool.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

function checkMemoryPressure(toolName) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const throttlingEnabled = process.env.MEMORY_SPAWN_THROTTLING !== 'false';
  if (!throttlingEnabled) {
    return { pass: true };
  }

  const monitor = getMemoryMonitor();
  if (!monitor) {
    return { pass: true };
  }

  monitor.checkHeap();

  const { shouldPause, reason, stats } = monitor.shouldPauseSpawning();

  if (shouldPause) {
    const heapUsedMB = stats?.current?.heapUsedMB?.toFixed(1) || 'unknown';
    const heapLimitMB = stats?.current?.heapLimitMB?.toFixed(1) || 'unknown';
    const percentStr = stats?.current?.percent
      ? (stats.current.percent * 100).toFixed(1)
      : 'unknown';

    const message = `
+======================================================================+
|  MEMORY PRESSURE - AGENT SPAWNING PAUSED                             |
+======================================================================+
|  Heap Usage: ${heapUsedMB}MB / ${heapLimitMB}MB (${percentStr}%)
|
|  Reason: ${reason}
|
|  Actions to recover:
|    1. Wait for existing agents to complete
|    2. Reduce concurrent agent spawns
|    3. Increase NODE_OPTIONS --max-old-space-size
|    4. Set MEMORY_SPAWN_THROTTLING=false to override (not recommended)
|
|  Memory Stats:
|    - Min: ${(stats?.min * 100)?.toFixed(1) || 'N/A'}%
|    - Max: ${(stats?.max * 100)?.toFixed(1) || 'N/A'}%
|    - Avg: ${(stats?.avg * 100)?.toFixed(1) || 'N/A'}%
|    - Trend: ${stats?.trend > 0 ? '+' : ''}${(stats?.trend * 100)?.toFixed(2) || 'N/A'}%
|
+======================================================================+
`;

    auditLog('routing-guard', 'memory_pressure_block', {
      heapUsedMB,
      heapLimitMB,
      percent: percentStr,
      reason,
    });

    return { pass: false, result: 'block', message };
  }

  if (process.env.DEBUG_HOOKS === 'true' && stats) {
    console.error(
      `[routing-guard] Memory check passed: ${(stats.current.percent * 100).toFixed(1)}%`
    );
  }

  return { pass: true };
}

module.exports = {
  checkRouterBash,
  checkRouterSelfCheck,
  checkRouterReadGovernance,
  checkRouterWrite,
  checkMemoryPressure,
};
