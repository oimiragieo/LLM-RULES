'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('./safe-json.cjs');

const REFLECTION_LOG_PATH = path.resolve(__dirname, '../../context/memory/reflection-log.jsonl');
const ROLLING_WINDOW = 10;
// Critical Fail < 0.4 on 0-1 scale = < 4.0 on 1-10 scale
const LOW_SCORE_THRESHOLD = 4.0;
const PROTECTED_AGENTS = ['router', 'planner', 'master-orchestrator', 'evolution-orchestrator'];
const EVOLUTION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Normalize scores from 0-1 scale to 1-10 scale.
 * CTO Directive #2: Handle both scales defensively.
 * @param {number} score - Raw score (either 0-1 or 1-10 scale)
 * @returns {number} Normalized score on 1-10 scale
 */
function normalizeScore(score) {
  // Handle invalid inputs
  if (score === null || score === undefined) return score;
  if (typeof score !== 'number' || Number.isNaN(score)) return score;

  // If score is <= 1.0, treat as 0-1 scale and multiply by 10
  // If score is > 1.0, treat as 1-10 scale (pass through)
  if (score <= 1.0) {
    return score * 10;
  }
  return score;
}

/**
 * Parse reflection-log.jsonl entries, filtering for scored reflections.
 * @param {string} [logPath] - Override path for testing
 * @returns {Array<Object>} Parsed entries with scores
 */
function readReflectionLog(logPath) {
  const filePath = logPath || REFLECTION_LOG_PATH;
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      const entry = safeParseJSON(line);
      if (entry && entry.agentId && entry.scores) {
        entries.push(entry);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Get rolling score summary for a specific agent.
 * @param {string} agentId - The agent to look up
 * @param {string} [logPath] - Override path for testing
 * @returns {Object} Score summary
 */
function getAgentScoreSummary(agentId, logPath) {
  const entries = readReflectionLog(logPath)
    .filter(e => e.agentId === agentId)
    .slice(-ROLLING_WINDOW);

  if (entries.length === 0) {
    return {
      agentId,
      entryCount: 0,
      avgScore: null,
      trend: 'unknown',
      consecutiveLowCount: 0,
      recentScores: [],
    };
  }

  // Compute average score across all dimensions per entry
  // Apply normalization to each dimension score before averaging
  const entryAvgs = entries.map(e => {
    const dims = Object.values(e.scores);
    const normalizedDims = dims.map(normalizeScore);
    return normalizedDims.reduce((a, b) => a + b, 0) / normalizedDims.length;
  });

  const avgScore = entryAvgs.reduce((a, b) => a + b, 0) / entryAvgs.length;

  // Trend: compare last half vs first half
  let trend = 'stable';
  if (entryAvgs.length >= 4) {
    const mid = Math.floor(entryAvgs.length / 2);
    const firstHalf = entryAvgs.slice(0, mid);
    const secondHalf = entryAvgs.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;
    if (diff > 0.5) trend = 'improving';
    else if (diff < -0.5) trend = 'declining';
  }

  // Consecutive low count from the end
  let consecutiveLowCount = 0;
  for (let i = entryAvgs.length - 1; i >= 0; i--) {
    if (entryAvgs[i] < LOW_SCORE_THRESHOLD) {
      consecutiveLowCount++;
    } else {
      break;
    }
  }

  return {
    agentId,
    entryCount: entries.length,
    avgScore: Math.round(avgScore * 100) / 100,
    trend,
    consecutiveLowCount,
    recentScores: entryAvgs.map(s => Math.round(s * 100) / 100),
  };
}

/**
 * Find all agents with consecutive low scores above the evolution trigger threshold.
 * @param {number} [threshold=3] - Minimum consecutive low scores to flag
 * @param {string} [logPath] - Override path for testing
 * @returns {Array<Object>} Underperforming agents with their summaries
 */
function getUnderperformingAgents(threshold, logPath) {
  const minConsecutive = threshold || 3;
  const entries = readReflectionLog(logPath);

  // Get unique agent IDs
  const agentIds = [...new Set(entries.map(e => e.agentId))];

  return agentIds
    .map(id => getAgentScoreSummary(id, logPath))
    .filter(s => s.consecutiveLowCount >= minConsecutive)
    .filter(s => !PROTECTED_AGENTS.includes(s.agentId));
}

/**
 * Check if an agent is eligible for evolution (not protected, not in cooldown).
 * @param {string} agentId
 * @param {string} [logPath] - Override path for testing
 * @returns {{ eligible: boolean, reason?: string }}
 */
function isEvolutionEligible(agentId, logPath) {
  if (PROTECTED_AGENTS.includes(agentId)) {
    return { eligible: false, reason: `${agentId} is a protected core agent` };
  }

  const summary = getAgentScoreSummary(agentId, logPath);
  if (summary.consecutiveLowCount < 3) {
    return {
      eligible: false,
      reason: `Only ${summary.consecutiveLowCount} consecutive lows (need 3+)`,
    };
  }

  // Check cooldown — look for recent evolution requests
  const spawnRequestPath = path.resolve(
    __dirname,
    '../../context/runtime/reflection-spawn-request.json'
  );
  if (fs.existsSync(spawnRequestPath)) {
    try {
      const requests = safeParseJSON(fs.readFileSync(spawnRequestPath, 'utf8'));
      const recentEvolution = requests.find(
        r =>
          r.trigger === 'low-score-evolution' &&
          r.context &&
          r.context.includes(agentId) &&
          r.timestamp &&
          Date.now() - new Date(r.timestamp).getTime() < EVOLUTION_COOLDOWN_MS
      );
      if (recentEvolution) {
        return { eligible: false, reason: `Evolution requested within last 24h (cooldown active)` };
      }
    } catch {
      // If spawn request file is malformed, allow evolution
    }
  }

  return { eligible: true };
}

module.exports = {
  getAgentScoreSummary,
  getUnderperformingAgents,
  isEvolutionEligible,
  readReflectionLog,
  normalizeScore,
  LOW_SCORE_THRESHOLD,
  ROLLING_WINDOW,
  PROTECTED_AGENTS,
};
