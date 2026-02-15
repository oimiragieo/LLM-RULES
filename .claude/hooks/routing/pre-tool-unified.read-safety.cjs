'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PROJECT_ROOT,
  canonicalizePathForPlatform,
} = require('./pre-tool-unified.shared.cjs');
const { ensureDir } = require('./pre-tool-unified.execution.cjs');

const READ_CHUNK_GUARD_BYTES = Number(process.env.READ_CHUNK_GUARD_BYTES || 120000);
const REFLECTION_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
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
const READ_DIR_LISTING_MAX_ATTEMPTS = 5;

function isReadSafetyAutoWindowEnabled() {
  return (
    String(process.env.READ_SAFETY_AUTOWINDOW || 'on')
      .trim()
      .toLowerCase() !== 'off'
  );
}

function getReadSafetyAutoWindowLimit() {
  const parsed = Number(process.env.READ_SAFETY_AUTOWINDOW_LIMIT || 4000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4000;
  return Math.floor(parsed);
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

    return null;
  } catch (_err) {
    return null;
  }
}

function checkReadSafety(toolName, toolInput, hookInput = null) {
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
        '.claude/lib/memory/memory-query.cjs': '.claude/lib/memory/core/memory-query.cjs',
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
        if (fs.existsSync(canonicalTarget)) {
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
      }
      const suggestionText = suggestedPath
        ? ` Did you mean "${path.join(PROJECT_ROOT, suggestedPath)}"?`
        : '';
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" does not exist. ` +
          `Use Glob/TaskOutput to discover a valid path, or generate the artifact before reading it.${suggestionText}`,
      };
    }

    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
      if (isBypassPermissionsMode(hookInput)) {
        return {
          checked: true,
          action: 'block',
          message:
            `[READ SAFETY][bypass] "${targetPath}" is a directory. ` +
            'Read requires a concrete file path. Use Glob/rg --files to list files, then Read a specific file.',
        };
      }
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" is a directory. ` +
          'Use Glob/rg --files for directory listing, then Read a specific file.',
      };
    }

    if (stats.size > READ_CHUNK_GUARD_BYTES && !hasReadWindow(toolInput)) {
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
  hasReadWindow,
  resolveReadPath,
  isBypassPermissionsMode,
  ensureReflectionReadTarget,
  ensureReportReadTarget,
  ensureTaskOutputReadTarget,
  ensureIntegrationQueueReadTarget,
  createDirectoryListingFile,
};
