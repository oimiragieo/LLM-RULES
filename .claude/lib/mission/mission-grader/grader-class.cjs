// Agent: code-simplifier | Task: #37 | Session: 2026-04-10
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../utils/safe-json.cjs');
const { evaluateKind, isRuleApplicable } = require('./dispatcher.cjs');
const { loadConfig, getPointsForRule, computeScore, getGradeBand } = require('./scoring.cjs');

// ---------------------------------------------------------------------------
// MissionGrader class
// ---------------------------------------------------------------------------

class MissionGrader {
  /**
   * @param {object} options
   * @param {string} [options.baseDir] - Project root (defaults to agent-studio root)
   * @param {object[]} [options.rules] - Override rules array
   * @param {object} [options.rubric] - Override rubric object
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.resolve(__dirname, '..', '..', '..', '..');
    if (options.rules && options.rubric) {
      this.rules = options.rules;
      this.rubric = options.rubric;
    } else {
      const config = loadConfig(this.baseDir);
      this.rules = config.rules;
      this.rubric = config.rubric;
    }
  }

  /**
   * Grade a single feature + handoff pair against all applicable rules.
   *
   * @param {object} feature - Feature object from features.json
   * @param {object} handoff - Handoff JSON from handoffs/*.json
   * @param {object} context - { featuresDocument, validationState, validationContract, agentsMd, missionState }
   * @returns {object} GradingReport conforming to grading-report.schema.json
   */
  gradeFeature(feature, handoff, context = {}) {
    const artifactMap = {
      feature,
      handoff,
      featuresDocument: context.featuresDocument || { features: [feature] },
      validationState: context.validationState || { assertions: {} },
      validationContract: context.validationContract || '',
      agentsMd: context.agentsMd || '',
      missionState: context.missionState || {},
    };

    const results = [];
    let hasBlockerFailure = false;

    for (const rule of this.rules) {
      // Check applicability
      if (!isRuleApplicable(rule, artifactMap)) {
        results.push({
          ruleId: rule.id,
          outcome: 'na',
          weight: 0,
          pointsAwarded: 0,
          evidence: 'Rule not applicable',
          category: rule.category,
        });
        continue;
      }

      // Evaluate
      const result = evaluateKind(rule.evaluation, feature, artifactMap, this.baseDir);
      const outcome = result.outcome || (result.pass ? 'pass' : 'fail');
      const points = getPointsForRule(rule.id, rule.severity, this.rubric);

      if (outcome === 'fail' && rule.severity === 'blocker') {
        hasBlockerFailure = true;
      }

      results.push({
        ruleId: rule.id,
        outcome,
        weight: points,
        pointsAwarded: outcome === 'pass' ? points : 0,
        evidence: result.evidence,
        category: rule.category,
        details: result.warning ? { warning: true } : undefined,
      });
    }

    const score = hasBlockerFailure ? 0 : computeScore(results, this.rubric);
    const passed = !hasBlockerFailure && score >= this.rubric.scale.passThreshold;

    return {
      specVersion: '1.0.0',
      gradedAt: new Date().toISOString(),
      featureId: feature.id,
      summary: {
        score,
        maxScore: 100,
        passed,
        gradeBand: hasBlockerFailure ? 'fail' : getGradeBand(score, this.rubric),
      },
      results: results.map(r => {
        const entry = {
          ruleId: r.ruleId,
          outcome: r.outcome,
          weight: r.weight,
          pointsAwarded: r.pointsAwarded,
          evidence: r.evidence,
        };
        if (r.details) entry.details = r.details;
        return entry;
      }),
    };
  }

  /**
   * Grade an entire mission directory.
   * Reads features.json, finds handoffs for completed features, grades each.
   *
   * @param {string} missionDir - Path to mission bundle directory
   * @returns {object} Aggregate grading report
   */
  gradeMission(missionDir) {
    const featuresPath = path.join(missionDir, 'features.json');
    const validationStatePath = path.join(missionDir, 'validation-state.json');
    const contractPath = path.join(missionDir, 'validation-contract.md');
    const agentsPath = path.join(missionDir, 'AGENTS.md');
    const statePath = path.join(missionDir, 'state.json');
    const handoffsDir = path.join(missionDir, 'handoffs');

    const featuresDoc = safeParseJSON(fs.readFileSync(featuresPath, 'utf8'), {});
    const features = featuresDoc.features || [];

    const validationState = fs.existsSync(validationStatePath)
      ? safeParseJSON(fs.readFileSync(validationStatePath, 'utf8'), { assertions: {} })
      : { assertions: {} };

    const validationContract = fs.existsSync(contractPath)
      ? fs.readFileSync(contractPath, 'utf8')
      : '';

    const agentsMd = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';

    const missionState = fs.existsSync(statePath)
      ? safeParseJSON(fs.readFileSync(statePath, 'utf8'), {})
      : {};

    // Load handoff files
    const handoffMap = {};
    if (fs.existsSync(handoffsDir)) {
      const files = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const h = safeParseJSON(fs.readFileSync(path.join(handoffsDir, file), 'utf8'), {});
          if (h.featureId) {
            // Use latest handoff per feature
            if (!handoffMap[h.featureId] || h.timestamp > handoffMap[h.featureId].timestamp) {
              handoffMap[h.featureId] = h;
            }
          }
        } catch {
          // Skip malformed handoff files
        }
      }
    }

    const context = {
      featuresDocument: featuresDoc,
      validationState,
      validationContract,
      agentsMd,
      missionState,
    };

    // Grade each completed feature that has a handoff
    const featureReports = [];
    for (const feature of features) {
      if (feature.status !== 'completed') continue;
      const handoff = handoffMap[feature.id];
      if (!handoff) continue;

      const report = this.gradeFeature(feature, handoff, context);
      featureReports.push(report);
    }

    // Aggregate scores
    const scores = featureReports.map(r => r.summary.score);
    const avgScore =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const allPassed = featureReports.every(r => r.summary.passed);
    const hasBlocker = featureReports.some(r => r.summary.gradeBand === 'fail');

    return {
      specVersion: '1.0.0',
      gradedAt: new Date().toISOString(),
      missionBaseSessionId: missionState.baseSessionId || null,
      summary: {
        score: hasBlocker ? 0 : avgScore,
        maxScore: 100,
        passed: allPassed && !hasBlocker,
        gradeBand: hasBlocker ? 'fail' : getGradeBand(avgScore, this.rubric),
        featuresGraded: featureReports.length,
        featuresTotal: features.length,
      },
      featureReports,
    };
  }

  /**
   * Get rules that apply to a given feature.
   */
  getApplicableRules(feature, handoff) {
    const artifactMap = { feature, handoff };
    return this.rules.filter(r => isRuleApplicable(r, artifactMap));
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

function gradeFeature(feature, handoff, context, options) {
  const grader = new MissionGrader(options);
  return grader.gradeFeature(feature, handoff, context);
}

function gradeMission(missionDir, options) {
  const grader = new MissionGrader(options);
  return grader.gradeMission(missionDir);
}

module.exports = { MissionGrader, gradeFeature, gradeMission };
