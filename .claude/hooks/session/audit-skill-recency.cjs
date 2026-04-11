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
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

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
  return safeParseJSON(raw, null, null, fallback);
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

      // Run the full artifact audit (SKILL.md + agents) and write stale-artifacts.json
      const auditResult = auditArtifacts({ projectRoot: PROJECT_ROOT, writeRuntimeFile: true });

      // Also run legacy manifest-based staleness check for hook message
      const { staleSkills, scannedCount } = auditSkillRecency(SKILLS_DIR);

      // Mark as fired for this session
      writeSentinel(sessionId);

      const totalIssues = auditResult.unverified.length + auditResult.stale.length;

      if (staleSkills.length > 0) {
        const message = buildStaleSkillsMessage(staleSkills, scannedCount);
        process.stdout.write(JSON.stringify({ continue: true, message }));
      } else if (totalIssues > 0) {
        const message = `[AUDIT-SKILL-RECENCY] ${totalIssues} artifact(s) need attention: ${auditResult.stale.length} stale, ${auditResult.unverified.length} unverified.`;
        process.stdout.write(JSON.stringify({ continue: true, message }));
      } else {
        process.stdout.write(JSON.stringify({ continue: true }));
      }
      process.exit(0);
    } catch (_err) {
      // Fail-open: never block on error
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  });
}

// ─── SKILL.md / agent frontmatter audit ──────────────────────────────────────

/**
 * Validate a date string is strictly UTC ISO-8601 (e.g. 2026-02-18T00:00:00Z
 * or 2026-02-18T00:00:00.000Z). Rejects +offset notation, date-only, and
 * non-padded month/day.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isLikelyIso8601(str) {
  if (typeof str !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(str);
}

/**
 * Parse YAML-style frontmatter from the start of a markdown file.
 * Handles simple `key: value` pairs. Values `true`/`false` are cast to boolean.
 *
 * @param {string} content
 * @returns {Record<string, string|boolean>}
 */
function parseFrontmatter(content) {
  const m = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!m) return {};
  const result = {};
  for (const line of m[1].split(/\r?\n/)) {
    const lm = line.match(/^(\w+):\s*(.*)$/);
    if (!lm) continue;
    const key = lm[1];
    let val = lm[2].trim();
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    result[key] = val;
  }
  return result;
}

/**
 * Recursively scan an agents directory for .md files, skipping _archive dirs
 * and README.md. Mutates the unverified/stale arrays.
 *
 * @param {string} dir
 * @param {Array<{label:string,type:string,status:string}>} unverified
 * @param {Array<{label:string,type:string,status:string}>} stale
 */
function scanAgentsMd(dir, unverified, stale) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const n = entry.name;
      if (n === '_archive' || n === 'archive' || n === 'dead') continue;
      scanAgentsMd(full, unverified, stale);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (entry.name === 'README.md') continue;
      let content;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch (_e) {
        continue;
      }
      const fm = parseFrontmatter(content);
      const label = `[AGENT] ${path.basename(entry.name, '.md')}`;
      if (fm.verified === false) {
        unverified.push({ label, type: 'agent', status: 'unverified' });
      } else if (fm.verified === true) {
        const dateVal = fm.lastVerifiedAt != null ? String(fm.lastVerifiedAt) : '';
        if (!dateVal || !isLikelyIso8601(dateVal)) {
          stale.push({ label, type: 'agent', status: 'stale' });
        }
      }
    }
  }
}

/**
 * Programmatic artifact audit: scans SKILL.md files and agent .md files for
 * `verified`/`lastVerifiedAt` frontmatter fields. Returns items categorised as
 * unverified (verified: false) or stale (valid verified: true but invalid date).
 *
 * By default writes `.claude/context/runtime/stale-artifacts.json`. Pass
 * `writeRuntimeFile: false` to suppress the write.
 *
 * @param {{ projectRoot?: string, json?: boolean, writeRuntimeFile?: boolean }} opts
 * @returns {{ unverified: Array<{label,type,status}>, stale: Array<{label,type,status}> }}
 */
function auditArtifacts({ projectRoot, writeRuntimeFile = true } = {}) {
  const root = projectRoot || PROJECT_ROOT;
  const skillsDir = path.join(root, '.claude', 'skills');
  const agentsDir = path.join(root, '.claude', 'agents');
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');

  const unverified = [];
  const stale = [];

  // ── Scan skills (SKILL.md frontmatter) ───────────────────────────────────
  if (fs.existsSync(skillsDir)) {
    let skillEntries;
    try {
      skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch (_e) {
      skillEntries = [];
    }
    for (const entry of skillEntries) {
      if (!entry.isDirectory()) continue;
      const n = entry.name;
      if (n === '_archive' || n === 'archive' || n === 'dead') continue;
      const skillMdPath = path.join(skillsDir, n, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;
      let content;
      try {
        content = fs.readFileSync(skillMdPath, 'utf8');
      } catch (_e) {
        continue;
      }
      const fm = parseFrontmatter(content);
      const label = `[SKILL] ${n}`;
      if (fm.verified === false) {
        unverified.push({ label, type: 'skill', status: 'unverified' });
      } else if (fm.verified === true) {
        const dateVal = fm.lastVerifiedAt != null ? String(fm.lastVerifiedAt) : '';
        if (!dateVal || !isLikelyIso8601(dateVal)) {
          stale.push({ label, type: 'skill', status: 'stale' });
        }
      }
    }
  }

  // ── Scan agents (.md frontmatter) ─────────────────────────────────────────
  if (fs.existsSync(agentsDir)) {
    scanAgentsMd(agentsDir, unverified, stale);
  }

  // ── Write runtime file ────────────────────────────────────────────────────
  if (writeRuntimeFile) {
    try {
      fs.mkdirSync(runtimeDir, { recursive: true });
      const data = { timestamp: new Date().toISOString(), unverified, stale };
      const tmpPath = path.join(runtimeDir, 'stale-artifacts.json.tmp');
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, path.join(runtimeDir, 'stale-artifacts.json'));
    } catch (_e) {
      // Non-fatal
    }
  }

  return { unverified, stale };
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
  // New artifact audit API
  isLikelyIso8601,
  auditArtifacts,
};

if (require.main === module) {
  main();
}
