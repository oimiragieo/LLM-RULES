// Agent: code-simplifier | Task: #37 | Session: 2026-04-10
'use strict';

const { resolvePointer } = require('./pointer.cjs');
const {
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
} = require('./evaluators.cjs');

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
      // Pass evaluateKind as a parameter to avoid circular dependency
      return evalAllOf(evaluation.conditions, artifactMap, baseDir, evaluateKind);

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

module.exports = { evaluateKind, isRuleApplicable };
