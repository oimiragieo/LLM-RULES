'use strict';

const fs = require('fs');
const path = require('path');
const { calendarDaysBetween } = require('../utils/calendar-days.cjs');

/**
 * Determines whether a text string contains signal content worth storing in LTM.
 *
 * Rejects conversational user-intent phrases, questions, commands, and trivial strings.
 * Accepts technical findings, file references, agent discoveries, and ADR-style decisions.
 *
 * Rules:
 *   1. Noise patterns (reject unconditionally if text STARTS with a noise marker)
 *   2. Signal patterns (accept if ANY signal keyword is found in the text)
 *   3. Length gate (reject if text has NO signal keyword AND is < 80 chars)
 *   4. First-person agent findings ("I found", "I confirmed") are treated as SIGNAL, not noise
 *
 * @param {string} text
 * @returns {boolean}
 */
function isSignalContent(text) {
  if (typeof text !== 'string' || text.length === 0) return false;

  // Noise patterns — reject if text starts with these phrases
  const noisePatterns = [
    /^I\s+(want|would|need|prefer|do not|don't want|wish|would like)\b/i,
    /^(Show me|Can you|Could you|Please|Help me|What|How|Why|When|Where)\b/i,
    /^User prompt submitted/i,
    /^Say\s/i,
  ];

  // Signal patterns — accept if ANY pattern matches anywhere in the text
  const signalPatterns = [
    /\.(cjs|mjs|ts|js|json|md)\b/,
    /\b(ADR|hook|agent|skill|memory|pattern|config|spawn|route|lint|format|test|deploy|schema|middleware|factory|singleton|subscriber|event)\b/i,
    /\.claude\//,
    /function\s+\w+/,
    /\bfix\b.*\bbug\b|\broot cause\b|\bimplement\w*\b/i,
    /\bI\s+(found|confirmed|discovered|verified|identified|noticed|observed)\b/i,
  ];

  const isNoise = noisePatterns.some(p => p.test(text));
  if (isNoise) return false;

  const hasSignal = signalPatterns.some(p => p.test(text));
  if (!hasSignal && text.length < 80) return false;

  return true;
}

/**
 * Generate a summary from multiple sessions (for LTM archive)
 */
function generateSessionSummary(sessions) {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  // Sort by timestamp, treating missing timestamps as epoch 0
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.timestamp ?? 0) - new Date(b.timestamp ?? 0)
  );

  const startDate = (sorted[0].timestamp ?? '').split('T')[0] || 'unknown';
  const endDate = (sorted[sorted.length - 1].timestamp ?? '').split('T')[0] || 'unknown';

  // Aggregate data
  const allLearnings = [];
  const allDecisions = [];
  const allPatterns = [];
  const fileFrequency = {};

  for (const session of sessions) {
    // Collect learnings (from summaries) — filter out noise/user-intent text
    if (session.summary && isSignalContent(session.summary)) {
      allLearnings.push(session.summary);
    }

    // Collect decisions
    if (session.decisions_made) {
      allDecisions.push(...session.decisions_made);
    }

    // Collect patterns
    if (session.patterns_found) {
      allPatterns.push(...session.patterns_found);
    }

    // Track file frequency
    if (session.files_modified) {
      for (const file of session.files_modified) {
        fileFrequency[file] = (fileFrequency[file] || 0) + 1;
      }
    }
  }

  // Get frequently touched files (touched more than once)
  const frequentFiles = Object.entries(fileFrequency)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([file]) => file);

  return {
    type: 'session_summary',
    date_range: {
      start: startDate,
      end: endDate,
    },
    session_count: sessions.length,
    session_ids: sessions.map(s => s.session_id).filter(Boolean),
    key_learnings: allLearnings,
    major_decisions: allDecisions,
    important_patterns: allPatterns,
    files_frequently_touched: frequentFiles,
    created_at: new Date().toISOString(),
  };
}

/**
 * Evict stale LTM entries using a utility-based decay formula.
 * utility = access_count * (1 / (1 + staleness_days * DECAY_FACTOR))
 * Entries with utility < EVICTION_THRESHOLD are deleted.
 * Only runs when LTM file count exceeds LTM_MAX_FILES.
 *
 * Fix 1 (P0 NaN Guard): env var parsing validates with Number.isFinite to prevent NaN bugs.
 * Fix 2 (P0 Mass Extinction Cap): evicts at most (files.length - LTM_MAX_FILES) files, lowest utility first.
 * Fix 3 (P1 mtime Fallback): missing timestamp fields fall back to file mtime instead of Infinity.
 * Fix 4 (P2 Eviction Preview Log): emits a preview warning to stderr before any deletions.
 *
 * @param {string} ltmDir - Path to the LTM directory
 * @returns {{evicted: number, skipped: string|undefined}} Result summary
 */
function evictStaleLTMFiles(ltmDir) {
  if (!fs.existsSync(ltmDir)) return { evicted: 0, skipped: 'ltm_dir_missing' };

  // Fix 1 (P0 NaN Guard): validate env var parsing — fall back to safe defaults on NaN/invalid
  const rawDecay = parseFloat(process.env.LTM_DECAY_FACTOR || '');
  const DECAY_FACTOR = Number.isFinite(rawDecay) && rawDecay > 0 ? rawDecay : 0.05;

  const rawThreshold = parseFloat(process.env.LTM_EVICTION_THRESHOLD || '');
  const EVICTION_THRESHOLD = Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : 0.1;

  const rawMax = parseInt(process.env.LTM_MAX_FILES || '', 10);
  const LTM_MAX_FILES = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 50;

  const files = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
  if (files.length <= LTM_MAX_FILES) return { evicted: 0, skipped: 'below_max_files' };

  const { safeParseJSON } = require('../utils/safe-json.cjs');
  const now = new Date(Date.now());

  // Fix 2 (P0 Mass Extinction Cap): pre-compute utilities for all evictable files,
  // then sort lowest utility first and cap at (files.length - LTM_MAX_FILES) evictions.
  const evictionCap = files.length - LTM_MAX_FILES;
  const candidates = [];

  for (const file of files) {
    // Never evict manually-promoted entries (promoted_*.json)
    if (file.startsWith('promoted_')) continue;

    const filePath = path.join(ltmDir, file);
    let data;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      data = safeParseJSON(raw, null);
    } catch (_e) {
      continue;
    }
    if (!data || typeof data !== 'object') continue;

    // Treat missing/zero access_count as 1 so utility is never 0
    // (prevents evicting all entries when access tracking hasn't fired yet)
    const rawCount =
      typeof data.access_count === 'number' && data.access_count >= 0 ? data.access_count : 0;
    const accessCount = Math.max(rawCount, 1);

    const ts = data.consolidated_at || data.created_at || data.timestamp || null;
    let stalenessDays;
    if (ts) {
      const parsedDays = calendarDaysBetween(ts, now);
      if (Number.isFinite(parsedDays)) {
        stalenessDays = Math.max(0, parsedDays);
      } else {
        // Fix 3 (P1 mtime Fallback): invalid timestamp string → use file mtime
        try {
          const mtimeDays = calendarDaysBetween(new Date(fs.statSync(filePath).mtimeMs), now);
          stalenessDays = Number.isFinite(mtimeDays) ? Math.max(0, mtimeDays) : Infinity;
        } catch (_e) {
          stalenessDays = Infinity;
        }
      }
    } else {
      // Fix 3 (P1 mtime Fallback): no timestamp fields at all → fall back to file mtime
      try {
        const mtimeDays = calendarDaysBetween(new Date(fs.statSync(filePath).mtimeMs), now);
        stalenessDays = Number.isFinite(mtimeDays) ? Math.max(0, mtimeDays) : Infinity;
      } catch (_e) {
        stalenessDays = Infinity;
      }
    }

    const utility = accessCount * (1 / (1 + stalenessDays * DECAY_FACTOR));

    if (utility < EVICTION_THRESHOLD) {
      candidates.push({ file, filePath, utility, accessCount, stalenessDays });
    }
  }

  // Fix 2 (P0 Mass Extinction Cap): sort lowest utility first, cap at evictionCap
  candidates.sort((a, b) => a.utility - b.utility);
  const toEvict = candidates.slice(0, evictionCap);

  // Fix 4 (P2 Eviction Preview Log): emit preview warning before any deletions
  if (toEvict.length > 0) {
    const previewList = toEvict
      .map(
        c =>
          `${c.file}(utility=${c.utility.toFixed(4)},staleness_days=${Number.isFinite(c.stalenessDays) ? c.stalenessDays.toFixed(1) : 'inf'})`
      )
      .join(', ');
    process.stderr.write(
      `[memory-tiers] evictStaleLTM: preview — will evict ${toEvict.length} file(s): ${previewList}\n`
    );
  }

  let evicted = 0;
  for (const { file, filePath, utility, accessCount, stalenessDays } of toEvict) {
    try {
      fs.unlinkSync(filePath);
      process.stderr.write(
        `[memory-tiers] evictStaleLTM: removed ${file} (utility=${utility.toFixed(4)}, access_count=${accessCount}, staleness_days=${Number.isFinite(stalenessDays) ? stalenessDays.toFixed(1) : 'inf'})\n`
      );
      evicted++;
    } catch (_e) {
      // non-critical — skip
    }
  }

  return { evicted };
}

module.exports = {
  isSignalContent,
  generateSessionSummary,
  evictStaleLTMFiles,
};
