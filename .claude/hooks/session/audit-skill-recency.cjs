'use strict';

/**
 * audit-skill-recency.cjs — UserPromptSubmit hook
 *
 * Audits skill freshness at the start of each session prompt. Scans the
 * .claude/skills/ directory for skills whose manifest.json indicates they are
 * stale (current date exceeds lastResearchDate + staleAfterDays). Reports a
 * summary warning so the router/agent knows which skills may have outdated
 * guidance.
 *
 * Behaviour:
 *   - Scans up to MAX_SKILLS_TO_SCAN skills for performance
 *   - Fires at most once per session (sentinel in runtime/)
 *   - Never blocks — always outputs { continue: true }
 *   - On any error: fail-open with { continue: true }
 *
 * Output:
 *   { continue: true }                        — no stale skills found
 *   { continue: true, message: "..." }        — stale skills found
 */

const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of skills to scan per invocation (performance guard) */
const MAX_SKILLS_TO_SCAN = 100;

/** Maximum number of stale skill names to include in the warning message */
const MAX_STALE_NAMES_IN_MESSAGE = 5;

// ─── Path helpers ─────────────────────────────────────────────────────────────

function findProjectRoot() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SENTINEL_PATH = path.join(RUNTIME_DIR, 'audit-skill-recency.sentinel');
const SESSION_ID_PATH = path.join(RUNTIME_DIR, 'session-id.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safely parse JSON, returning fallback on any error. */
function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

/** Read current session ID from runtime, returns null if unavailable. */
function readSessionId() {
  try {
    if (!fs.existsSync(SESSION_ID_PATH)) return null;
    const data = safeParse(fs.readFileSync(SESSION_ID_PATH, 'utf8'), null);
    return data && typeof data.sessionId === 'string' ? data.sessionId : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Check if this hook has already fired for the current session.
 * Returns true if the sentinel matches the current session ID.
 */
function hasAlreadyFiredThisSession(sessionId) {
  try {
    if (!fs.existsSync(SENTINEL_PATH)) return false;
    const sentinelData = safeParse(fs.readFileSync(SENTINEL_PATH, 'utf8'), null);
    if (!sentinelData) return false;
    // If session ID is unknown, use timestamp-based deduplication (1 hour window)
    if (!sessionId || sessionId === 'unknown') {
      if (typeof sentinelData.firedAt === 'string') {
        const elapsed = Date.now() - new Date(sentinelData.firedAt).getTime();
        return elapsed < 60 * 60 * 1000; // 1 hour
      }
      return false;
    }
    return sentinelData.sessionId === sessionId;
  } catch (_e) {
    return false;
  }
}

/** Write the sentinel so this hook does not re-fire in the same session. */
function writeSentinel(sessionId) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmp = SENTINEL_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ sessionId: sessionId || 'unknown', firedAt: new Date().toISOString() }),
      'utf8'
    );
    fs.renameSync(tmp, SENTINEL_PATH);
  } catch (_e) {
    // Non-fatal
  }
}

/**
 * Check if a single skill directory is stale.
 * Returns { skillName, isStale, ageInDays, staleAfterDays, lastResearchDate } or null.
 *
 * @param {string} skillDir - Absolute path to skill directory
 * @param {string} skillName - Name of the skill
 * @returns {{ skillName: string, isStale: boolean, ageInDays: number|null, staleAfterDays: number|null, lastResearchDate: string|null } | null}
 */
function checkSkillStaleness(skillDir, skillName) {
  const manifestPath = path.join(skillDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = safeParse(fs.readFileSync(manifestPath, 'utf8'), null);
  } catch (_e) {
    return null;
  }

  if (!manifest || typeof manifest !== 'object') return null;

  const { lastResearchDate, staleAfterDays } = manifest;
  if (!lastResearchDate || staleAfterDays == null) return null;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastResearchDate)) return null;

  const lastDate = new Date(lastResearchDate + 'T00:00:00Z');
  if (isNaN(lastDate.getTime())) return null;

  const ageInDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  const isStale = ageInDays > staleAfterDays;

  return { skillName, isStale, ageInDays, staleAfterDays, lastResearchDate };
}

/**
 * Collect skill directories from the skills root.
 * Returns an array of { name, dir } objects (up to MAX_SKILLS_TO_SCAN).
 *
 * @param {string} skillsDir - Absolute path to the skills directory
 * @returns {{ name: string, dir: string }[]}
 */
function collectSkillDirs(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip archive directories
      const name = entry.name;
      if (name === '_archive' || name === 'archive' || name === 'dead') continue;
      dirs.push({ name, dir: path.join(skillsDir, name) });
      if (dirs.length >= MAX_SKILLS_TO_SCAN) break;
    }
    return dirs;
  } catch (_e) {
    return [];
  }
}

/**
 * Scan skills for staleness.
 * Returns { staleSkills, scannedCount }.
 *
 * @param {string} skillsDir
 * @returns {{ staleSkills: Array<{skillName: string, ageInDays: number, staleAfterDays: number}>, scannedCount: number }}
 */
function auditSkillRecency(skillsDir) {
  const dirs = collectSkillDirs(skillsDir);
  const staleSkills = [];

  for (const { name, dir } of dirs) {
    const result = checkSkillStaleness(dir, name);
    if (result && result.isStale) {
      staleSkills.push({
        skillName: result.skillName,
        ageInDays: result.ageInDays,
        staleAfterDays: result.staleAfterDays,
        lastResearchDate: result.lastResearchDate,
      });
    }
  }

  // Sort by most overdue first
  staleSkills.sort((a, b) => b.ageInDays - a.ageInDays);

  return { staleSkills, scannedCount: dirs.length };
}

/**
 * Build the warning message for stale skills.
 *
 * @param {Array} staleSkills
 * @param {number} scannedCount
 * @returns {string}
 */
function buildStaleSkillsMessage(staleSkills, scannedCount) {
  const topSkills = staleSkills.slice(0, MAX_STALE_NAMES_IN_MESSAGE);
  const remainder = staleSkills.length - topSkills.length;

  const skillList = topSkills
    .map(s => `${s.skillName} (${s.ageInDays}d old, stale after ${s.staleAfterDays}d)`)
    .join(', ');

  let message =
    `[AUDIT-SKILL-RECENCY] ${staleSkills.length} of ${scannedCount} scanned skills are stale: ` +
    skillList;

  if (remainder > 0) {
    message += ` and ${remainder} more`;
  }

  message +=
    '. Consider running skill-updater or check-skill-staleness to refresh outdated skills.';

  return message;
}

// ─── Hook entry point ─────────────────────────────────────────────────────────

/**
 * Main hook function.
 */
function main() {
  // Read stdin (even though we don't need it — hooks receive input via stdin)
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    try {
      const sessionId = readSessionId();

      // De-duplicate: only fire once per session
      if (hasAlreadyFiredThisSession(sessionId)) {
        process.stdout.write(JSON.stringify({ continue: true }));
        process.exit(0);
        return;
      }

      // Perform the audit
      const { staleSkills, scannedCount } = auditSkillRecency(SKILLS_DIR);

      // Mark as fired for this session
      writeSentinel(sessionId);

      if (staleSkills.length === 0) {
        process.stdout.write(JSON.stringify({ continue: true }));
        process.exit(0);
        return;
      }

      const message = buildStaleSkillsMessage(staleSkills, scannedCount);
      process.stdout.write(JSON.stringify({ continue: true, message }));
      process.exit(0);
    } catch (_err) {
      // Fail-open: never block on error
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  });
}

// ─── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
  checkSkillStaleness,
  collectSkillDirs,
  auditSkillRecency,
  buildStaleSkillsMessage,
  safeParse,
  hasAlreadyFiredThisSession,
  writeSentinel,
  MAX_SKILLS_TO_SCAN,
  MAX_STALE_NAMES_IN_MESSAGE,
};

if (require.main === module) {
  main();
}
