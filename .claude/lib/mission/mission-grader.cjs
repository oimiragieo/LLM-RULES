// Agent: developer | Task: mission-grader | Session: 2026-04-07

'use strict';

/**
 * Mission Grader — Rule Evaluator Engine (facade)
 *
 * Implements the 17 alignment rules from rules.json, applies scoring from
 * rubric.json, and produces grading-report.schema.json-conformant output.
 *
 * Split into sub-modules (H-09 phase 2/3). This facade re-exports the full
 * original public API so all consumers remain unchanged.
 */

const pointer = require('./mission-grader/pointer.cjs');
const evaluators = require('./mission-grader/evaluators.cjs');
const dispatcher = require('./mission-grader/dispatcher.cjs');
const scoring = require('./mission-grader/scoring.cjs');
const graderClass = require('./mission-grader/grader-class.cjs');

module.exports = {
  ...pointer,
  ...evaluators,
  ...dispatcher,
  ...scoring,
  ...graderClass,
};
