'use strict';

function calculateMetricScore(value, threshold) {
  if (value <= threshold.warn * 0.7) return 1.0;
  if (value <= threshold.warn) {
    const ratio = value / threshold.warn;
    return 1.0 - (ratio - 0.7) * (0.2 / 0.3);
  }
  if (value <= threshold.critical) {
    const ratio = (value - threshold.warn) / (threshold.critical - threshold.warn);
    return 0.8 - ratio * 0.3;
  }
  const overRatio = Math.min((value - threshold.critical) / threshold.critical, 1);
  return 0.5 - overRatio * 0.5;
}

function calculateHealthScore(metrics, config) {
  const {
    learningsSizeKB = 0,
    patternsCount = 0,
    gotchasCount = 0,
    codebaseMapEntries = 0,
    mtmSessionCount = 0,
  } = metrics;

  const scores = {
    learnings: calculateMetricScore(learningsSizeKB, config.THRESHOLDS.learningsKB),
    patterns: calculateMetricScore(patternsCount, config.THRESHOLDS.patterns),
    gotchas: calculateMetricScore(gotchasCount, config.THRESHOLDS.gotchas),
    codebaseMap: calculateMetricScore(codebaseMapEntries, config.THRESHOLDS.codebaseMapEntries),
    mtm: calculateMetricScore(mtmSessionCount, config.THRESHOLDS.mtmSessions),
  };

  let totalScore = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(config.HEALTH_WEIGHTS)) {
    totalScore += scores[key] * weight;
    totalWeight += weight;
  }

  return Math.round((totalScore / totalWeight) * 100) / 100;
}

function generateRecommendations(metrics, config) {
  const {
    learningsSizeKB = 0,
    patternsCount = 0,
    gotchasCount = 0,
    codebaseMapEntries = 0,
    mtmSessionCount = 0,
    legacySessionsCount = 0,
  } = metrics;

  const recommendations = [];

  if (learningsSizeKB >= config.THRESHOLDS.learningsKB.critical) {
    recommendations.push(
      `CRITICAL: learnings.md is ${learningsSizeKB}KB - run archival immediately`
    );
  } else if (learningsSizeKB >= config.THRESHOLDS.learningsKB.warn) {
    recommendations.push(
      `Consider archiving learnings.md (${learningsSizeKB}KB approaching ${config.THRESHOLDS.learningsKB.critical}KB threshold)`
    );
  }

  if (patternsCount >= config.THRESHOLDS.patterns.critical) {
    recommendations.push(
      `CRITICAL: patterns.json has ${patternsCount} entries - run deduplication and pruning`
    );
  } else if (patternsCount >= config.THRESHOLDS.patterns.warn) {
    recommendations.push(
      `Consider pruning patterns.json (${patternsCount} entries approaching ${config.THRESHOLDS.patterns.critical} threshold)`
    );
  }

  if (gotchasCount >= config.THRESHOLDS.gotchas.critical) {
    recommendations.push(
      `CRITICAL: gotchas.json has ${gotchasCount} entries - run deduplication and pruning`
    );
  } else if (gotchasCount >= config.THRESHOLDS.gotchas.warn) {
    recommendations.push(
      `Consider pruning gotchas.json (${gotchasCount} entries approaching ${config.THRESHOLDS.gotchas.critical} threshold)`
    );
  }

  if (codebaseMapEntries >= config.THRESHOLDS.codebaseMapEntries.critical) {
    recommendations.push(
      `CRITICAL: codebase_map.json has ${codebaseMapEntries} entries - run TTL pruning`
    );
  } else if (codebaseMapEntries >= config.THRESHOLDS.codebaseMapEntries.warn) {
    recommendations.push(
      `Consider pruning codebase_map.json (${codebaseMapEntries} entries approaching ${config.THRESHOLDS.codebaseMapEntries.critical} threshold)`
    );
  }

  if (mtmSessionCount >= config.THRESHOLDS.mtmSessions.critical) {
    recommendations.push(
      `CRITICAL: MTM has ${mtmSessionCount} sessions - run summarization to LTM immediately`
    );
  } else if (mtmSessionCount >= config.THRESHOLDS.mtmSessions.warn) {
    recommendations.push(
      `Consider summarizing MTM sessions to LTM (${mtmSessionCount} sessions approaching ${config.THRESHOLDS.mtmSessions.critical} limit)`
    );
  }

  if (legacySessionsCount > 0) {
    recommendations.push(
      `Legacy sessions/ has ${legacySessionsCount} files - run migration and delete legacy data`
    );
  }

  return recommendations;
}

module.exports = { calculateHealthScore, generateRecommendations };
