'use strict';
/* eslint-disable max-lines */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PROJECT_ROOT,
  canonicalizePathForPlatform,
  safeParseJSON,
} = require('./pre-tool-unified.shared.cjs');
const { ensureDir } = require('./pre-tool-unified.execution.cjs');

const READ_CHUNK_GUARD_BYTES = Number(process.env.READ_CHUNK_GUARD_BYTES || 60000);
const READ_CHUNK_GUARD_TOKENS = Number(process.env.READ_CHUNK_GUARD_TOKENS || 12000);
const READ_ESTIMATED_CHARS_PER_TOKEN = Number(process.env.READ_ESTIMATED_CHARS_PER_TOKEN || 5);
// Host (Cursor/Claude Code) throws MaxFileReadTokenExceededError when Read output exceeds this
const READ_HOST_MAX_FILE_READ_TOKENS = Number(
  process.env.READ_HOST_MAX_FILE_READ_TOKENS ||
    process.env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS ||
    25000
);
const READ_HOST_MAX_SAFE_LINES = Math.floor(READ_HOST_MAX_FILE_READ_TOKENS / 6);
const READ_HARD_BLOCK_LARGE_DIRECT = String(process.env.READ_HARD_BLOCK_LARGE_DIRECT || 'on')
  .trim()
  .toLowerCase();
const READ_REQUIRE_SEARCH_FIRST = String(process.env.READ_REQUIRE_SEARCH_FIRST || 'on')
  .trim()
  .toLowerCase();
const READ_REQUIRE_SEARCH_FIRST_BYTES = Number(
  process.env.READ_REQUIRE_SEARCH_FIRST_BYTES || 50000
);
const READ_REQUIRE_SEARCH_WINDOW_MS = Number(
  process.env.READ_REQUIRE_SEARCH_WINDOW_MS || 15 * 60 * 1000
);
const READ_TOKEN_SAVER_ENFORCEMENT = String(process.env.READ_TOKEN_SAVER_ENFORCEMENT || 'on')
  .trim()
  .toLowerCase();
const READ_TOKEN_SAVER_WINDOW_MS = Number(process.env.READ_TOKEN_SAVER_WINDOW_MS || 20 * 60 * 1000);
const READ_CONTEXT_PRESSURE_BREACH_THRESHOLD = Number(
  process.env.READ_CONTEXT_PRESSURE_BREACH_THRESHOLD || 3
);
const REFLECTION_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const TOKEN_SLO_STATE_PATH = path.join(REFLECTION_RUNTIME_DIR, 'token-slo-state.json');
const TOOL_GOVERNANCE_STATE_PATH = path.join(REFLECTION_RUNTIME_DIR, 'tool-governance-state.json');
const TOOL_GOVERNANCE_STALE_MS = Number(
  process.env.TOOL_GOVERNANCE_STALE_MS || 24 * 60 * 60 * 1000
);
const CORE_MEMORY_READ_WINDOW_MS = Number(process.env.CORE_MEMORY_READ_WINDOW_MS || 60 * 60 * 1000);
const REFLECTION_REMINDER_PATH = path.join(REFLECTION_RUNTIME_DIR, 'reflection-reminder.txt');
const REFLECTION_SPAWN_REQUEST_PATH = path.join(
  REFLECTION_RUNTIME_DIR,
  'reflection-spawn-request.json'
);
const INTEGRATION_QUEUE_PATH = path.join(REFLECTION_RUNTIME_DIR, 'integration-queue.jsonl');
const REPORTS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'reports');
const READ_DIR_LISTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'read-safety-dir-listing.txt'
);
const READ_BLOCKED_TARGET_PLACEHOLDER_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'read-safety-blocked-read.txt'
);
const READ_DIR_LISTING_MAX_ATTEMPTS = 5;
const READ_BLOCKED_PLACEHOLDER_MAX_ATTEMPTS = 5;
const SEARCH_EVIDENCE_PATTERNS = [
  /\bpnpm\s+search:code\b/i,
  /\bhybrid-search\b/i,
  /\bsemantic-search\b/i,
];
const TOKEN_SAVER_SKILL_NAMES = new Set(['context-compressor', 'token-saver-context-compression']);
const CORE_MEMORY_FILES = new Set([
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'patterns.json'),
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'gotchas.json'),
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'decisions.md'),
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'issues.md'),
]);

function isReadSafetyAutoWindowEnabled() {
  return (
    String(process.env.READ_SAFETY_AUTOWINDOW || 'on')
      .trim()
      .toLowerCase() !== 'off'
  );
}

function getReadSafetyAutoWindowLimit() {
  const parsed = Number(process.env.READ_SAFETY_AUTOWINDOW_LIMIT || 4000);
  const raw = !Number.isFinite(parsed) || parsed <= 0 ? 4000 : Math.floor(parsed);
  return Math.min(raw, READ_HOST_MAX_SAFE_LINES);
}

function getReadSafetyMaxWindowLimit() {
  const fallback = getReadSafetyAutoWindowLimit();
  const parsed = Number(process.env.READ_SAFETY_MAX_WINDOW_LIMIT || fallback);
  const raw = !Number.isFinite(parsed) || parsed <= 0 ? fallback : Math.floor(parsed);
  return Math.min(raw, READ_HOST_MAX_SAFE_LINES);
}

function resolveSessionId(hookInput = null) {
  const fromHook = hookInput?.session_id || hookInput?.sessionId || null;
  if (fromHook && String(fromHook).trim()) return String(fromHook).trim();
  const fromEnv = process.env.CLAUDE_SESSION_ID || null;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return 'unknown';
}

function pruneGovernanceSessions(sessions, now = Date.now()) {
  const next = {};
  for (const [sessionId, entry] of Object.entries(sessions || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const lastSeenAt = Number(entry.lastSeenAt || 0);
    if (lastSeenAt > 0 && now - lastSeenAt <= TOOL_GOVERNANCE_STALE_MS) {
      next[sessionId] = entry;
    }
  }
  return next;
}

function readGovernanceState() {
  try {
    if (!fs.existsSync(TOOL_GOVERNANCE_STATE_PATH)) return { sessions: {} };
    const parsed = safeParseJSON(fs.readFileSync(TOOL_GOVERNANCE_STATE_PATH, 'utf8'), null);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sessions !== 'object') {
      return { sessions: {} };
    }
    return { sessions: parsed.sessions || {} };
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeGovernanceState(state) {
  try {
    ensureDir(path.dirname(TOOL_GOVERNANCE_STATE_PATH));
    const sessions = pruneGovernanceSessions(state?.sessions || {});
    fs.writeFileSync(
      TOOL_GOVERNANCE_STATE_PATH,
      JSON.stringify({ sessions }, null, 2) + '\n',
      'utf8'
    );
  } catch (_err) {
    // Best-effort state tracking.
  }
}

function isSearchEvidenceCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return SEARCH_EVIDENCE_PATTERNS.some(pattern => pattern.test(command));
}

function isTokenSaverSkillInvocation(toolInput) {
  const skillNameRaw =
    toolInput?.skill ||
    toolInput?.skill_name ||
    toolInput?.name ||
    toolInput?.skillName ||
    toolInput?.id ||
    null;
  if (!skillNameRaw) return false;
  return TOKEN_SAVER_SKILL_NAMES.has(String(skillNameRaw).trim().toLowerCase());
}

function recordToolGovernanceEvidence(toolName, toolInput, hookInput) {
  const sessionId = resolveSessionId(hookInput);
  const now = Date.now();
  const state = readGovernanceState();
  const entry = state.sessions[sessionId] || {};

  if (toolName === 'Bash' && isSearchEvidenceCommand(toolInput?.command || '')) {
    entry.lastSearchAt = now;
    entry.lastSearchCommand = String(toolInput.command || '').slice(0, 200);
  }

  if (toolName === 'Skill' && isTokenSaverSkillInvocation(toolInput || {})) {
    entry.lastTokenSaverAt = now;
  }

  if (toolName === 'Read') {
    const readPath = resolveReadPath(toolInput);
    if (readPath && CORE_MEMORY_FILES.has(path.resolve(readPath))) {
      entry.lastCoreMemoryReadAt = now;
      entry.lastCoreMemoryReadPath = path
        .relative(PROJECT_ROOT, path.resolve(readPath))
        .replace(/\\/g, '/');
    }
  }

  if (Object.keys(entry).length === 0) return;
  entry.lastSeenAt = now;
  state.sessions[sessionId] = entry;
  writeGovernanceState(state);
}

function getSessionGovernanceSnapshot(hookInput) {
  const sessionId = resolveSessionId(hookInput);
  const now = Date.now();
  const sessions = readGovernanceState().sessions || {};
  const entry = sessions[sessionId] || {};
  return {
    sessionId,
    hasRecentSearch:
      Number(entry.lastSearchAt || 0) > 0 &&
      now - Number(entry.lastSearchAt || 0) <= READ_REQUIRE_SEARCH_WINDOW_MS,
    hasRecentTokenSaver:
      Number(entry.lastTokenSaverAt || 0) > 0 &&
      now - Number(entry.lastTokenSaverAt || 0) <= READ_TOKEN_SAVER_WINDOW_MS,
    hasRecentCoreMemoryRead:
      Number(entry.lastCoreMemoryReadAt || 0) > 0 &&
      now - Number(entry.lastCoreMemoryReadAt || 0) <= CORE_MEMORY_READ_WINDOW_MS,
    lastSearchAt: Number(entry.lastSearchAt || 0),
    lastTokenSaverAt: Number(entry.lastTokenSaverAt || 0),
    lastCoreMemoryReadAt: Number(entry.lastCoreMemoryReadAt || 0),
    lastCoreMemoryReadPath: String(entry.lastCoreMemoryReadPath || ''),
  };
}

function isContextPressureHigh(hookInput) {
  try {
    if (!fs.existsSync(TOKEN_SLO_STATE_PATH)) return false;
    const parsed = safeParseJSON(fs.readFileSync(TOKEN_SLO_STATE_PATH, 'utf8'), null);
    if (!parsed || typeof parsed !== 'object') return false;
    const sessions = parsed?.sessions || {};
    const sessionId = resolveSessionId(hookInput);
    const entry = sessions?.[sessionId];
    if (!entry || typeof entry !== 'object') return false;

    const now = Date.now();
    const downgradedUntil = Number(entry.downgradedUntil || 0);
    if (downgradedUntil > now) return true;

    const breachCount = Number(entry.breachCount || 0);
    const lastBreachAt = Number(entry.lastBreachAt || 0);
    return (
      breachCount >= READ_CONTEXT_PRESSURE_BREACH_THRESHOLD &&
      lastBreachAt > 0 &&
      now - lastBreachAt <= READ_TOKEN_SAVER_WINDOW_MS
    );
  } catch (_err) {
    return false;
  }
}

function hasReadWindow(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
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

function isReadWindowOversized(toolInput) {
  const limit = getReadWindowLimit(toolInput);
  return Number.isFinite(limit) && limit > READ_HOST_MAX_SAFE_LINES;
}

function getReadWindowLimit(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;

  const parsedLimit = Number(toolInput.limit);
  if (Number.isFinite(parsedLimit) && parsedLimit >= 0) {
    return Math.floor(parsedLimit);
  }

  const start = Number(toolInput.start_line ?? toolInput.startLine);
  const end = Number(toolInput.end_line ?? toolInput.endLine);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.floor(end - start + 1);
  }

  return null;
}

function resolveReadPath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.file_path || toolInput.filePath || toolInput.path || null;
  if (!raw || typeof raw !== 'string') return null;
  const normalized = canonicalizePathForPlatform(raw, PROJECT_ROOT);
  return path.isAbsolute(normalized) ? normalized : path.resolve(PROJECT_ROOT, normalized);
}

function isBypassPermissionsMode(hookInput) {
  return hookInput && hookInput.permission_mode === 'bypassPermissions';
}

function ensureReflectionReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  try {
    if (targetPath === REFLECTION_REMINDER_PATH && !fs.existsSync(targetPath)) {
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, '', 'utf8');
      return true;
    }

    if (targetPath === REFLECTION_SPAWN_REQUEST_PATH && !fs.existsSync(targetPath)) {
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, '[]\n', 'utf8');
      return true;
    }
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Reflection target ensure failed:', err.message);
    }
  }

  return false;
}

function ensureReportReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (fs.existsSync(targetPath)) return false;

  const normalizedTarget = path.resolve(targetPath);
  const normalizedReportsDir = path.resolve(REPORTS_DIR);
  const isReportPath = normalizedTarget.startsWith(normalizedReportsDir + path.sep);
  const isMarkdown = normalizedTarget.toLowerCase().endsWith('.md');

  if (!isReportPath || !isMarkdown) {
    return false;
  }

  const relativePath = path.relative(normalizedReportsDir, normalizedTarget);
  if (relativePath.startsWith('..')) {
    return false;
  }

  try {
    ensureDir(path.dirname(normalizedTarget));
    const placeholder = [
      '# Missing Report Placeholder',
      '',
      `Requested report was not found at read time: \`${relativePath.replace(/\\/g, '/')}\``,
      '',
      'This placeholder was auto-created by pre-tool read safety to avoid hard tool failure.',
      'Regenerate the missing report if full content is required.',
      '',
    ].join('\n');
    fs.writeFileSync(normalizedTarget, placeholder, 'utf8');
    return true;
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Report target ensure failed:', err.message);
    }
    return false;
  }
}

function ensureTaskOutputReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (fs.existsSync(targetPath)) return false;

  try {
    const normalizedTarget = path.resolve(targetPath);
    const tempRoot = path.resolve(os.tmpdir(), 'claude');
    const inTempClaude = normalizedTarget.startsWith(tempRoot + path.sep);
    const inTasksDir =
      normalizedTarget.includes(`${path.sep}tasks${path.sep}`) ||
      normalizedTarget.endsWith(`${path.sep}tasks`);
    if (!inTempClaude || !inTasksDir) {
      return false;
    }

    ensureDir(path.dirname(normalizedTarget));
    const placeholder = [
      '# Missing Task Output Placeholder',
      '',
      `Requested task output was not found at read time: \`${normalizedTarget}\``,
      '',
      'This placeholder was auto-created by pre-tool read safety to avoid hard Read failure.',
      '',
    ].join('\n');
    fs.writeFileSync(normalizedTarget, placeholder, 'utf8');
    return true;
  } catch (_err) {
    return false;
  }
}

function ensureIntegrationQueueReadTarget(targetPath) {
  try {
    const normalizedTarget = path.resolve(targetPath);
    if (normalizedTarget !== path.resolve(INTEGRATION_QUEUE_PATH)) return false;
    if (fs.existsSync(normalizedTarget)) return false;
    ensureDir(path.dirname(normalizedTarget));
    fs.writeFileSync(normalizedTarget, '', 'utf8');
    return true;
  } catch (_err) {
    return false;
  }
}

function createDirectoryListingFile(targetDir) {
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const lines = [];
    lines.push(`# Directory listing for ${targetDir}`);
    lines.push(`# Generated by pre-tool read safety (${new Date().toISOString()})`);
    lines.push('');
    for (const entry of entries.slice(0, 300)) {
      const kind = entry.isDirectory() ? '[DIR]' : '[FILE]';
      lines.push(`${kind} ${entry.name}`);
    }
    if (entries.length > 300) {
      lines.push('');
      lines.push(`... truncated (${entries.length - 300} additional entries)`);
    }
    lines.push('');
    ensureDir(path.dirname(READ_DIR_LISTING_PATH));

    for (let attempt = 0; attempt < READ_DIR_LISTING_MAX_ATTEMPTS; attempt += 1) {
      const candidatePath =
        attempt === 0
          ? READ_DIR_LISTING_PATH
          : path.join(
              path.dirname(READ_DIR_LISTING_PATH),
              `read-safety-dir-listing-${process.pid}-${Date.now()}-${attempt}.txt`
            );

      try {
        if (fs.existsSync(candidatePath)) {
          const candidateStats = fs.statSync(candidatePath);
          if (candidateStats.isDirectory()) {
            continue;
          }
        }

        fs.writeFileSync(candidatePath, lines.join('\n'), 'utf8');
        const writtenStats = fs.statSync(candidatePath);
        if (!writtenStats.isDirectory()) {
          return candidatePath;
        }
      } catch (_candidateErr) {
        // Try next candidate path.
      }
    }

    // Fallback: write to os.tmpdir() so we never return null for a valid directory.
    // Ensures directory Read is always rewritten (avoids EISDIR at host when rewrite is applied).
    try {
      const tmpPath = path.join(
        os.tmpdir(),
        `claude-read-safety-dir-listing-${process.pid}-${Date.now()}.txt`
      );
      fs.writeFileSync(tmpPath, lines.join('\n'), 'utf8');
      if (fs.existsSync(tmpPath) && !fs.statSync(tmpPath).isDirectory()) {
        return tmpPath;
      }
    } catch (_tmpErr) {
      // Fall through to null.
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function createBlockedReadPlaceholder(targetPath, reason) {
  try {
    ensureDir(path.dirname(READ_BLOCKED_TARGET_PLACEHOLDER_PATH));
    const relativeTarget = path.relative(PROJECT_ROOT, targetPath || '').replace(/\\/g, '/');
    const lines = [
      '# Read Safety Blocked Target',
      'NON-DELIVERABLE: Diagnostic placeholder, cannot satisfy required output contracts.',
      '',
      `Requested path: ${relativeTarget || String(targetPath || '(unknown)')}`,
      `Reason: ${reason}`,
      '',
      'Use Glob or pnpm search:code to discover a valid file path, then retry Read with offset/limit.',
      '',
    ];

    for (let attempt = 0; attempt < READ_BLOCKED_PLACEHOLDER_MAX_ATTEMPTS; attempt += 1) {
      const candidatePath =
        attempt === 0
          ? READ_BLOCKED_TARGET_PLACEHOLDER_PATH
          : path.join(
              path.dirname(READ_BLOCKED_TARGET_PLACEHOLDER_PATH),
              `read-safety-blocked-read-${process.pid}-${Date.now()}-${attempt}.txt`
            );

      try {
        if (fs.existsSync(candidatePath)) {
          const existingStats = fs.statSync(candidatePath);
          if (existingStats.isDirectory()) {
            continue;
          }
        }

        fs.writeFileSync(candidatePath, lines.join('\n'), 'utf8');
        if (!fs.existsSync(candidatePath)) {
          continue;
        }
        const writtenStats = fs.statSync(candidatePath);
        if (!writtenStats.isDirectory() && writtenStats.size > 0) {
          return candidatePath;
        }
      } catch (_candidateErr) {
        // Try next candidate file.
      }
    }
    // Last-resort diagnostics fallback.
    try {
      const emergencyPath = path.join(
        os.tmpdir(),
        `claude-read-safety-blocked-${process.pid}-${Date.now()}.txt`
      );
      fs.writeFileSync(emergencyPath, lines.join('\n'), 'utf8');
      if (fs.existsSync(emergencyPath) && fs.statSync(emergencyPath).isFile()) {
        return emergencyPath;
      }
    } catch (_emergencyErr) {
      // Fall through to null.
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function isLargeUnwindowedFile(stats, hasWindow) {
  return stats.size > READ_CHUNK_GUARD_BYTES && !hasWindow;
}

function checkReadSafety(toolName, toolInput, hookInput = null) {
  recordToolGovernanceEvidence(toolName, toolInput, hookInput);

  if (toolName !== 'Read') {
    return { checked: false, reason: 'not_read_tool' };
  }

  try {
    const targetPath = resolveReadPath(toolInput);
    if (!targetPath) {
      return {
        checked: true,
        action: 'block',
        message:
          '[READ SAFETY] Missing Read target path. ' +
          'Provide file_path/filePath/path from a prior tool result (TaskOutput/Glob/Write) before calling Read.',
      };
    }

    ensureReflectionReadTarget(targetPath);
    ensureReportReadTarget(targetPath);
    ensureTaskOutputReadTarget(targetPath);
    ensureIntegrationQueueReadTarget(targetPath);
    if (!fs.existsSync(targetPath)) {
      const missingPathHints = {
        '.claude/agents/router.md': '.claude/agents/core/router.md',
        '.claude/lib/utils/safe-json-parse.cjs': '.claude/lib/utils/safe-json.cjs',
        'tests/metrics/metrics-schema-contract.test.cjs':
          'tests/lib/monitoring/metrics-schema-contract.test.cjs',
        'tests/metrics/metrics-reader-rollups.test.cjs':
          'tests/lib/monitoring/metrics-reader-rollups.test.cjs',
        '.claude/context/artifacts/research-reports/p0-fix-research-2026-02-13.md':
          '.claude/context/reports/p0-fix-research-2026-02-13.md',
        '.claude/context/artifacts/research-reports/implementation-patterns-research-2026-02-13.md':
          '.claude/context/reports/implementation-patterns-research-2026-02-13.md',
      };
      const relativePath = path.relative(PROJECT_ROOT, targetPath).replace(/\\/g, '/');
      const suggestedPath = missingPathHints[relativePath];
      if (suggestedPath) {
        const canonicalTarget = path.join(PROJECT_ROOT, suggestedPath);
        return {
          checked: true,
          action: 'rewrite',
          rewrittenToolInput: {
            ...toolInput,
            file_path: canonicalTarget,
          },
          bypassWarning: `[READ SAFETY] Rewrote stale path "${targetPath}" to canonical path "${canonicalTarget}".`,
        };
      }
      const suggestionText = suggestedPath
        ? ` Did you mean "${path.join(PROJECT_ROOT, suggestedPath)}"?`
        : '';
      if (isBypassPermissionsMode(hookInput)) {
        const placeholderPath = createBlockedReadPlaceholder(
          targetPath,
          'target path does not exist'
        );
        if (placeholderPath) {
          return {
            checked: true,
            action: 'rewrite',
            rewrittenToolInput: {
              ...toolInput,
              file_path: placeholderPath,
              offset: 0,
              limit: getReadSafetyAutoWindowLimit(),
            },
            bypassWarning:
              `[READ SAFETY][bypass] "${targetPath}" does not exist. Rewriting Read to diagnostics file ` +
              `"${placeholderPath}" to prevent host Read failure.${suggestionText}`,
          };
        }
      }
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" does not exist. ` +
          `Use Glob/TaskOutput to discover a valid path, or generate the artifact before reading it.${suggestionText}`,
      };
    }

    const stats = fs.statSync(targetPath);
    const strictSearchEnabled = READ_REQUIRE_SEARCH_FIRST !== 'off';
    const strictTokenSaverEnabled = READ_TOKEN_SAVER_ENFORCEMENT !== 'off';
    const isProjectFile = path
      .resolve(targetPath)
      .startsWith(path.resolve(PROJECT_ROOT) + path.sep);
    const hasWindow = hasReadWindow(toolInput);
    const shouldGateLargeDirectRead =
      isProjectFile && !hasWindow && stats.size > READ_REQUIRE_SEARCH_FIRST_BYTES;

    if (hasWindow && isReadWindowOversized(toolInput)) {
      const maxAllowed = getReadSafetyMaxWindowLimit();
      return {
        checked: true,
        action: 'rewrite',
        rewrittenToolInput: {
          ...toolInput,
          limit: maxAllowed,
        },
        bypassWarning: `${
          isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
        }Requested read window exceeded safe max (${READ_HOST_MAX_FILE_READ_TOKENS} tokens); limit clamped to ${maxAllowed}. Prefer ripgrep skill or pnpm search:code for very large files; use Grep only as fallback.`,
      };
    }

    // Read on a directory causes EISDIR at host. Rewrite to a listing file using an absolute path
    // so the host never receives a directory path (fixes EISDIR when host or resolver uses wrong base).
    if (stats.isDirectory()) {
      const listingPath = createDirectoryListingFile(targetPath);
      if (listingPath) {
        const absoluteListingPath = path.resolve(listingPath);
        if (fs.existsSync(absoluteListingPath) && !fs.statSync(absoluteListingPath).isDirectory()) {
          return {
            checked: true,
            action: 'rewrite',
            rewrittenToolInput: {
              ...toolInput,
              file_path: absoluteListingPath,
            },
            bypassWarning: `[READ SAFETY] "${targetPath}" is a directory. Rewrote Read to listing file "${absoluteListingPath}".`,
          };
        }
      }
      return {
        checked: true,
        action: 'block',
        message:
          `${isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '}"${targetPath}" is a directory (Read causes EISDIR). ` +
          'Use Glob or ListDir to list files, then Read a specific file path.',
      };
    }

    if (
      READ_HARD_BLOCK_LARGE_DIRECT !== 'off' &&
      stats.size > READ_CHUNK_GUARD_BYTES &&
      !hasWindow
    ) {
      if (isBypassPermissionsMode(hookInput) && isReadSafetyAutoWindowEnabled()) {
        const limit = getReadSafetyAutoWindowLimit();
        return {
          checked: true,
          action: 'rewrite',
          rewrittenToolInput: {
            ...toolInput,
            offset: 0,
            limit,
          },
          bypassWarning:
            `[READ SAFETY][bypass] Direct Read on large file (${stats.size} bytes) was blocked by policy. ` +
            `Auto-windowed to offset=0, limit=${limit} to avoid oversized host read.`,
        };
      }
      return {
        checked: true,
        action: 'block',
        message:
          `${
            isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
          }Direct Read on large file (${stats.size} bytes) blocked. ` +
          'Retry with offset/limit (or start_line/end_line), e.g. offset: 0, limit: 4000.',
      };
    }

    if (strictSearchEnabled && shouldGateLargeDirectRead) {
      const governance = getSessionGovernanceSnapshot(hookInput);
      if (!governance.hasRecentSearch) {
        if (isBypassPermissionsMode(hookInput) && isReadSafetyAutoWindowEnabled()) {
          const limit = getReadSafetyAutoWindowLimit();
          return {
            checked: true,
            action: 'rewrite',
            rewrittenToolInput: {
              ...toolInput,
              offset: 0,
              limit,
            },
            bypassWarning:
              `[READ SAFETY][bypass] Missing search evidence for large direct Read (${stats.size} bytes). ` +
              `Auto-windowed to offset=0, limit=${limit}. Run \`pnpm search:code "<query>"\` before next large Read.`,
          };
        }
        return {
          checked: true,
          action: 'block',
          message:
            `[READ SAFETY] Large direct Read (${stats.size} bytes) requires search evidence first. ` +
            'Run `pnpm search:code "<query>"` or hybrid-search, then retry Read with offset/limit.',
        };
      }

      if (
        strictTokenSaverEnabled &&
        isContextPressureHigh(hookInput) &&
        !governance.hasRecentTokenSaver
      ) {
        if (isBypassPermissionsMode(hookInput) && isReadSafetyAutoWindowEnabled()) {
          const limit = getReadSafetyAutoWindowLimit();
          return {
            checked: true,
            action: 'rewrite',
            rewrittenToolInput: {
              ...toolInput,
              offset: 0,
              limit,
            },
            bypassWarning:
              '[READ SAFETY][bypass] Context pressure is high and token-saver evidence is missing. ' +
              `Auto-windowed to offset=0, limit=${limit}; run context-compressor or token-saver-context-compression before more large Reads.`,
          };
        }
        return {
          checked: true,
          action: 'block',
          message:
            '[READ SAFETY] Context pressure is high for this session. ' +
            'Invoke `Skill({ skill: "context-compressor" })` or `Skill({ skill: "token-saver-context-compression" })` before large Read calls.',
        };
      }
    }

    if (isLargeUnwindowedFile(stats, hasWindow)) {
      if (isReadSafetyAutoWindowEnabled()) {
        const limit = getReadSafetyAutoWindowLimit();
        return {
          checked: true,
          action: 'rewrite',
          rewrittenToolInput: {
            ...toolInput,
            offset: 0,
            limit,
          },
          bypassWarning: `${
            isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
          }Large file (${stats.size} bytes) auto-windowed to offset=0, limit=${limit}.`,
        };
      }
      return {
        checked: true,
        action: 'block',
        message:
          `${
            isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
          }Large file (${stats.size} bytes) requires chunked Read. ` +
          'Retry with offset/limit (or start_line/end_line), e.g. offset: 0, limit: 4000.',
      };
    }

    if (!hasWindow) {
      const estimatedTokens = Math.ceil(stats.size / Math.max(1, READ_ESTIMATED_CHARS_PER_TOKEN));
      const tokenCap = Math.min(READ_CHUNK_GUARD_TOKENS, READ_HOST_MAX_FILE_READ_TOKENS);
      if (estimatedTokens > tokenCap) {
        if (isReadSafetyAutoWindowEnabled()) {
          const limit = getReadSafetyAutoWindowLimit();
          return {
            checked: true,
            action: 'rewrite',
            rewrittenToolInput: {
              ...toolInput,
              offset: 0,
              limit,
            },
            bypassWarning: `${
              isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
            }Estimated read size (${estimatedTokens} tokens) auto-windowed to offset=0, limit=${limit}.`,
          };
        }
        return {
          checked: true,
          action: 'block',
          message:
            `${
              isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
            }Estimated read size (${estimatedTokens} tokens) requires chunked Read. ` +
            'Retry with offset/limit (or start_line/end_line), e.g. offset: 0, limit: 4000.',
        };
      }
    }

    const maxWindowLimit = getReadSafetyMaxWindowLimit();
    const requestedWindow = getReadWindowLimit(toolInput);
    if (requestedWindow != null && requestedWindow > maxWindowLimit) {
      return {
        checked: true,
        action: 'rewrite',
        rewrittenToolInput: {
          ...toolInput,
          limit: maxWindowLimit,
        },
        bypassWarning: `${
          isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
        }Requested Read window (${requestedWindow}) exceeded safe max (${maxWindowLimit}); limit clamped.`,
      };
    }

    return { checked: true, action: 'allow' };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

module.exports = {
  checkReadSafety,
  isSearchEvidenceCommand,
  isTokenSaverSkillInvocation,
  recordToolGovernanceEvidence,
  getSessionGovernanceSnapshot,
  isContextPressureHigh,
  getReadWindowLimit,
  hasReadWindow,
  resolveReadPath,
  isBypassPermissionsMode,
  ensureReflectionReadTarget,
  ensureReportReadTarget,
  ensureTaskOutputReadTarget,
  ensureIntegrationQueueReadTarget,
  createDirectoryListingFile,
};
