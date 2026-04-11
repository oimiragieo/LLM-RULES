// Agent: code-simplifier | Task: #37 | Session: 2026-04-10
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { safeParseJSON } = require('../../utils/safe-json.cjs');
const { resolvePointer } = require('./pointer.cjs');

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
    schema = safeParseJSON(fs.readFileSync(resolvedPath, 'utf8'), {});
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

/**
 * evalAllOf — accepts evaluateKind as a parameter to avoid circular dependency
 * between evaluators.cjs and dispatcher.cjs.
 */
function evalAllOf(conditions, artifactMap, baseDir, evaluateKind) {
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

function evalConditionalIntegrity(handoff, evaluation, _artifactMap) {
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

module.exports = {
  evalJsonSchema,
  evalArrayNonempty,
  evalStringNonempty,
  evalAllOf,
  evalSetSubset,
  evalRegexAllMatch,
  evalMarkdownContainsAll,
  evalVerificationStepsCovered,
  evalJsonPointerAll,
  evalObjectKeysExist,
  evalEquals,
  evalPreconditionParseable,
  evalConditionalIntegrity,
  evalConsistencyWarning,
};
