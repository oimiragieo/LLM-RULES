// Agent: developer | Task: mission-grader | Session: 2026-04-07
/* eslint-disable max-lines */
'use strict';

/**
 * Mission Grader — Rule Evaluator Engine
 *
 * Implements the 17 alignment rules from rules.json, applies scoring from
 * rubric.json, and produces grading-report.schema.json-conformant output.
 *
 * Evaluation kinds implemented:
 *   json_schema, all_of, array_nonempty, string_nonempty, set_subset,
 *   regex_all_match, markdown_contains_all, verification_steps_covered,
 *   json_pointer_all, object_keys_exist, conditional_integrity, equals,
 *   precondition_parseable, consistency_warning, manual_or_llm
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// JSON Pointer (RFC 6901) resolver
// ---------------------------------------------------------------------------

function resolvePointer(obj, pointer) {
  if (!pointer || pointer === '') return obj;
  const parts = pointer.replace(/^\//, '').split('/');
  let current = obj;
  for (const part of parts) {
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current == null || typeof current !== 'object') return undefined;
    current = current[decoded];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Evaluation kind implementations
// ---------------------------------------------------------------------------

function evalJsonSchema(artifact, schemaPath, baseDir) {
  const resolvedPath = path.isAbsolute(schemaPath) ? schemaPath : path.join(baseDir, schemaPath);

  if (!fs.existsSync(resolvedPath)) {
    return { pass: false, evidence: `Schema file not found: ${resolvedPath}` };
  }

  let schema;
  try {
    schema = safeParseJSON(fs.readFileSync(resolvedPath, 'utf8'), {}).data;
  } catch (e) {
    return { pass: false, evidence: `Failed to parse schema: ${e.message}` };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const valid = ajv.validate(schema, artifact);
  if (valid) {
    return { pass: true, evidence: `Validates against ${path.basename(resolvedPath)}` };
  }
  const errors = ajv.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
  return { pass: false, evidence: `Schema validation failed: ${errors}` };
}

function evalArrayNonempty(artifact, pointer) {
  const val = resolvePointer(artifact, pointer);
  if (!Array.isArray(val)) {
    return { pass: false, evidence: `${pointer} is not an array` };
  }
  if (val.length < 1) {
    return { pass: false, evidence: `${pointer} is empty` };
  }
  return { pass: true, evidence: `${pointer} has ${val.length} item(s)` };
}

function evalStringNonempty(artifact, pointer) {
  const val = resolvePointer(artifact, pointer);
  if (typeof val !== 'string') {
    return { pass: false, evidence: `${pointer} is not a string` };
  }
  if (val.trim().length < 1) {
    return { pass: false, evidence: `${pointer} is empty/whitespace` };
  }
  return { pass: true, evidence: `${pointer} is non-empty string` };
}

function evalAllOf(conditions, artifactMap, baseDir) {
  const failures = [];
  for (const cond of conditions) {
    const artifact = artifactMap[cond.artifact] || artifactMap.feature;
    const result = evaluateKind(cond, artifact, artifactMap, baseDir);
    if (!result.pass) {
      failures.push(result.evidence);
    }
  }
  if (failures.length > 0) {
    return { pass: false, evidence: `all_of failed: ${failures.join('; ')}` };
  }
  return { pass: true, evidence: 'All conditions passed' };
}

function evalSetSubset(leftArray, rightObj, asKeys) {
  if (!Array.isArray(leftArray)) {
    return { pass: false, evidence: 'Left operand is not an array' };
  }
  if (rightObj == null || typeof rightObj !== 'object') {
    return { pass: false, evidence: 'Right operand is not an object' };
  }

  const rightSet = asKeys ? new Set(Object.keys(rightObj)) : new Set(rightObj);
  const missing = leftArray.filter(item => !rightSet.has(item));

  if (missing.length > 0) {
    return { pass: false, evidence: `Missing from right: ${missing.join(', ')}` };
  }
  return { pass: true, evidence: `All ${leftArray.length} items found` };
}

function evalRegexAllMatch(arr, pattern) {
  if (!Array.isArray(arr)) {
    return { pass: false, evidence: 'Target is not an array' };
  }
  const re = new RegExp(pattern);
  const failures = arr.filter(s => !re.test(String(s)));
  if (failures.length > 0) {
    return { pass: false, evidence: `Failed regex: ${failures.join(', ')}` };
  }
  return { pass: true, evidence: `All ${arr.length} items match pattern` };
}

function evalMarkdownContainsAll(text, needles) {
  if (typeof text !== 'string') {
    return { pass: false, evidence: 'Contract text is not a string' };
  }
  const missing = needles.filter(n => !text.includes(n));
  if (missing.length > 0) {
    return { pass: false, evidence: `Missing from contract: ${missing.join(', ')}` };
  }
  return { pass: true, evidence: `All ${needles.length} IDs found in contract` };
}

function evalVerificationStepsCovered(steps, commandsRun) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { pass: true, outcome: 'na', evidence: 'No verification steps to check' };
  }
  if (!Array.isArray(commandsRun)) {
    return { pass: false, evidence: 'commandsRun is not an array' };
  }

  const normalize = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const missing = [];

  for (const step of steps) {
    const trimmed = step.trim();
    if (!trimmed) continue;
    const normalizedStep = normalize(trimmed);

    const found = commandsRun.some(c => {
      const cmd = typeof c === 'object' ? c.command : String(c);
      return cmd.includes(trimmed) || normalize(cmd) === normalizedStep;
    });

    if (!found) missing.push(trimmed);
  }

  if (missing.length > 0) {
    return { pass: false, evidence: `Uncovered steps: ${missing.join('; ')}` };
  }
  return { pass: true, evidence: `All ${steps.length} steps covered` };
}

function evalJsonPointerAll(artifact, pointer, itemRule) {
  const arr = resolvePointer(artifact, pointer);
  if (!Array.isArray(arr)) {
    return { pass: false, evidence: `${pointer} is not an array` };
  }
  if (arr.length === 0) {
    return { pass: true, outcome: 'na', evidence: 'Empty array — nothing to check' };
  }

  if (itemRule && itemRule.requiredKeys) {
    const missing = [];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      for (const key of itemRule.requiredKeys) {
        if (!(key in item)) {
          missing.push(`[${i}].${key}`);
        }
      }
    }
    if (missing.length > 0) {
      return { pass: false, evidence: `Missing keys: ${missing.join(', ')}` };
    }
  }
  return { pass: true, evidence: `All ${arr.length} items satisfy rule` };
}

function evalObjectKeysExist(artifact, pointer, requiredKeys) {
  const obj = resolvePointer(artifact, pointer);
  if (obj == null || typeof obj !== 'object') {
    return { pass: false, evidence: `${pointer} is not an object` };
  }
  const missing = requiredKeys.filter(k => !(k in obj));
  if (missing.length > 0) {
    return { pass: false, evidence: `Missing keys: ${missing.join(', ')}` };
  }
  return { pass: true, evidence: `All required keys present` };
}

function evalEquals(left, right) {
  const match = JSON.stringify(left) === JSON.stringify(right);
  if (match) {
    return { pass: true, evidence: `Values match: ${JSON.stringify(left)}` };
  }
  return {
    pass: false,
    evidence: `Mismatch: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`,
  };
}

function evalPreconditionParseable(preconditions, patterns) {
  if (!Array.isArray(preconditions)) {
    return { pass: false, evidence: 'preconditions is not an array' };
  }
  const compiled = patterns.map(p => new RegExp(p));
  const unparsed = [];

  for (const pre of preconditions) {
    const matches = compiled.some(re => re.test(pre));
    if (!matches) unparsed.push(pre);
  }

  // Free-form gates are allowed — info severity, so be lenient
  if (unparsed.length > 0) {
    return {
      pass: true,
      evidence: `${unparsed.length} free-form gate(s): ${unparsed.join('; ')}`,
    };
  }
  return { pass: true, evidence: `All ${preconditions.length} preconditions parseable` };
}

function evalConditionalIntegrity(handoff, evaluation) {
  const { when, then: thenSpec } = evaluation;

  // Resolve the "when" condition
  let conditionMet = false;
  if (when.pointer && 'equals' in when) {
    const val = resolvePointer(handoff, when.pointer);
    conditionMet = val === when.equals;
  }

  if (!conditionMet) {
    return { pass: true, outcome: 'na', evidence: 'Condition not met — rule not applicable' };
  }

  // Evaluate "then"
  if (thenSpec.kind === 'array_nonempty') {
    return evalArrayNonempty(handoff, thenSpec.pointer);
  }
  if (thenSpec.kind === 'all_commands_exit_zero') {
    const cmds = resolvePointer(handoff, thenSpec.pointer);
    if (!Array.isArray(cmds)) {
      return { pass: false, evidence: 'commandsRun is not an array' };
    }
    const nonZero = cmds.filter(c => c.exitCode !== 0);
    if (nonZero.length === 0) {
      return { pass: true, evidence: 'All commands exited 0' };
    }
    // Check if discoveredIssues explains non-zero exits
    const issues = resolvePointer(handoff, '/handoff/discoveredIssues');
    if (Array.isArray(issues) && issues.length > 0) {
      return {
        pass: true,
        evidence: `${nonZero.length} non-zero exit(s) explained by ${issues.length} discoveredIssues`,
      };
    }
    return {
      pass: false,
      evidence: `${nonZero.length} non-zero exit code(s) without discoveredIssues explanation`,
    };
  }

  return { pass: true, evidence: 'Conditional then clause not checkable' };
}

function evalConsistencyWarning(feature, validationState, evaluation) {
  const { when, warnIf, message } = evaluation;

  // Check "when" conditions
  if (when && when.all) {
    for (const cond of when.all) {
      if (cond.feature && 'equals' in cond) {
        const val = resolvePointer(feature, cond.feature);
        if (val !== cond.equals) {
          return { pass: true, outcome: 'na', evidence: 'When condition not met' };
        }
      }
      if (cond.feature && cond.exists) {
        const val = resolvePointer(feature, cond.feature);
        if (val == null) {
          return { pass: true, outcome: 'na', evidence: 'When condition not met — field missing' };
        }
      }
    }
  }

  // Check "warnIf"
  if (warnIf && warnIf.anyFulfills) {
    const fulfills = feature.fulfills || [];
    const assertions = (validationState && validationState.assertions) || {};
    const pending = fulfills.filter(id => {
      const a = assertions[id];
      return !a || a.status !== 'passed';
    });

    if (pending.length > 0) {
      return {
        pass: true,
        outcome: 'pass',
        evidence: `WARNING: ${message} (${pending.length} pending VAL IDs: ${pending.join(', ')})`,
        warning: true,
      };
    }
  }

  return { pass: true, evidence: 'No warning conditions triggered' };
}

// ---------------------------------------------------------------------------
// Main evaluation dispatcher
// ---------------------------------------------------------------------------

function evaluateKind(evaluation, artifact, artifactMap, baseDir) {
  const kind = evaluation.kind;

  switch (kind) {
    case 'json_schema':
      return evalJsonSchema(
        artifactMap[evaluation.artifact] || artifact,
        evaluation.schemaPath,
        baseDir
      );

    case 'all_of':
      return evalAllOf(evaluation.conditions, artifactMap, baseDir);

    case 'array_nonempty':
      return evalArrayNonempty(artifactMap[evaluation.artifact] || artifact, evaluation.pointer);

    case 'string_nonempty':
      return evalStringNonempty(artifactMap[evaluation.artifact] || artifact, evaluation.pointer);

    case 'set_subset': {
      const left = resolvePointer(
        artifactMap[evaluation.left.artifact] || artifact,
        evaluation.left.pointer
      );
      const right = resolvePointer(
        artifactMap[evaluation.right.artifact] || artifact,
        evaluation.right.pointer
      );
      return evalSetSubset(left, right, evaluation.right.asKeys);
    }

    case 'regex_all_match': {
      const arr = resolvePointer(artifactMap[evaluation.artifact] || artifact, evaluation.pointer);
      return evalRegexAllMatch(arr, evaluation.regex);
    }

    case 'markdown_contains_all': {
      const text = artifactMap[evaluation.artifact] || artifactMap.validationContract;
      const needles = resolvePointer(
        artifactMap[evaluation.needlesFrom.artifact] || artifact,
        evaluation.needlesFrom.pointer
      );
      return evalMarkdownContainsAll(text, needles || []);
    }

    case 'verification_steps_covered': {
      const steps = resolvePointer(artifact, evaluation.featurePointer);
      const cmds = resolvePointer(artifactMap.handoff || artifact, evaluation.handoffPointer);
      return evalVerificationStepsCovered(steps, cmds);
    }

    case 'json_pointer_all':
      return evalJsonPointerAll(
        artifactMap[evaluation.artifact] || artifact,
        evaluation.pointer,
        evaluation.itemRule
      );

    case 'object_keys_exist':
      return evalObjectKeysExist(
        artifactMap[evaluation.artifact] || artifact,
        evaluation.pointer,
        evaluation.requiredKeys
      );

    case 'conditional_integrity':
      return evalConditionalIntegrity(artifactMap.handoff || artifact, evaluation, artifactMap);

    case 'equals': {
      const left =
        evaluation.left.literal !== undefined
          ? evaluation.left.literal
          : resolvePointer(
              artifactMap[evaluation.left.artifact] || artifact,
              evaluation.left.pointer
            );
      const right =
        evaluation.right.literal !== undefined
          ? evaluation.right.literal
          : resolvePointer(
              artifactMap[evaluation.right.artifact] || artifact,
              evaluation.right.pointer
            );
      return evalEquals(left, right);
    }

    case 'precondition_parseable': {
      const preconds = resolvePointer(artifact, evaluation.pointer);
      return evalPreconditionParseable(preconds, evaluation.patterns);
    }

    case 'consistency_warning':
      return evalConsistencyWarning(
        artifactMap.feature || artifact,
        artifactMap.validationState,
        evaluation
      );

    case 'manual_or_llm':
      return { pass: true, outcome: 'unknown', evidence: 'Requires manual/LLM evaluation' };

    default:
      return { pass: true, outcome: 'unknown', evidence: `Unknown evaluation kind: ${kind}` };
  }
}

// ---------------------------------------------------------------------------
// Applicability check
// ---------------------------------------------------------------------------

function isRuleApplicable(rule, artifactMap) {
  if (!rule.appliesWhen) return true;

  const aw = rule.appliesWhen;
  const featureOrArtifact = aw.feature ? artifactMap.feature || artifactMap.featuresDocument : null;

  if (aw.feature && aw.exists) {
    const val = resolvePointer(featureOrArtifact, aw.feature);
    return val != null && (Array.isArray(val) ? val.length > 0 : true);
  }

  if (aw.feature && aw.arrayMinLength != null) {
    const val = resolvePointer(featureOrArtifact, aw.feature);
    return Array.isArray(val) && val.length >= aw.arrayMinLength;
  }

  if (aw.feature && aw.regex) {
    const val = resolvePointer(featureOrArtifact, aw.feature);
    return typeof val === 'string' && new RegExp(aw.regex).test(val);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

function loadConfig(baseDir) {
  const configDir = path.join(baseDir, '.claude', 'config', 'mission-alignment');
  const rulesPath = path.join(configDir, 'rules.json');
  const rubricPath = path.join(configDir, 'rubric.json');

  const rules = safeParseJSON(fs.readFileSync(rulesPath, 'utf8'), {}).data;
  const rubric = safeParseJSON(fs.readFileSync(rubricPath, 'utf8'), {}).data;

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
    this.baseDir = options.baseDir || path.resolve(__dirname, '..', '..', '..');
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

    const featuresDoc = safeParseJSON(fs.readFileSync(featuresPath, 'utf8'), {}).data;
    const features = featuresDoc.features || [];

    const validationState = fs.existsSync(validationStatePath)
      ? safeParseJSON(fs.readFileSync(validationStatePath, 'utf8'), { assertions: {} }).data
      : { assertions: {} };

    const validationContract = fs.existsSync(contractPath)
      ? fs.readFileSync(contractPath, 'utf8')
      : '';

    const agentsMd = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';

    const missionState = fs.existsSync(statePath)
      ? safeParseJSON(fs.readFileSync(statePath, 'utf8'), {}).data
      : {};

    // Load handoff files
    const handoffMap = {};
    if (fs.existsSync(handoffsDir)) {
      const files = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const h = safeParseJSON(fs.readFileSync(path.join(handoffsDir, file), 'utf8'), {}).data;
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

module.exports = {
  MissionGrader,
  gradeFeature,
  gradeMission,
  // Exported for testing
  resolvePointer,
  evaluateKind,
  isRuleApplicable,
  computeScore,
  getGradeBand,
  getPointsForRule,
};
