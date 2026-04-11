// Agent: code-simplifier | Task: #37 | Session: 2026-04-10
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

function loadConfig(baseDir) {
  const configDir = path.join(baseDir, '.claude', 'config', 'mission-alignment');
  const rulesPath = path.join(configDir, 'rules.json');
  const rubricPath = path.join(configDir, 'rubric.json');

  const rules = safeParseJSON(fs.readFileSync(rulesPath, 'utf8'), {});
  const rubric = safeParseJSON(fs.readFileSync(rubricPath, 'utf8'), {});

  return { rules: rules.rules, rubric };
}

function getPointsForRule(ruleId, severity, rubric) {
  const overrides = rubric.ruleScoring.ruleOverrides || [];
  const override = overrides.find(o => o.ruleId === ruleId);
  if (override) return override.pointsIfPass;
  return rubric.ruleScoring.defaultRulePoints[severity] || 0;
}

function computeScore(results, rubric) {
  const caps = rubric.ruleScoring.categoryCaps;
  const categoryTotals = {};

  for (const r of results) {
    if (r.outcome !== 'pass') continue;
    const cat = r.category || 'unknown';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (r.pointsAwarded || 0);
  }

  // Apply category caps
  let rawSum = 0;
  let maxPossible = 0;
  for (const [cat, cap] of Object.entries(caps)) {
    maxPossible += cap;
    rawSum += Math.min(categoryTotals[cat] || 0, cap);
  }

  // Normalize to 0-100
  if (maxPossible === 0) return 0;
  return Math.round((rawSum / maxPossible) * 100);
}

function getGradeBand(score, rubric) {
  for (const band of rubric.gradeBands) {
    if (score >= band.minScore && score <= band.maxScore) {
      return band.band;
    }
  }
  return 'fail';
}

module.exports = { loadConfig, getPointsForRule, computeScore, getGradeBand };
