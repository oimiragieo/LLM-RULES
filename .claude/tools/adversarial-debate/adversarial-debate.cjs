#!/usr/bin/env node
'use strict';

/**
 * adversarial-debate — Companion CLI Tool
 *
 * Wrapper around the adversarial-debate skill for CLI use.
 * Validates inputs, scaffolds the debate template, and outputs structured JSON.
 *
 * Usage:
 *   node .claude/tools/adversarial-debate/adversarial-debate.cjs \
 *     --topic "Should we adopt microservices?" \
 *     --pro "Yes — independent scaling and deployment" \
 *     --con "No — monolith simpler at current scale" \
 *     --rounds 3
 */

const path = require('path');
const { buildDebateTemplate, parseArgs } = require(
  path.join(__dirname, '..', '..', 'skills', 'adversarial-debate', 'scripts', 'main.cjs')
);
const { validateInput } = require(
  path.join(__dirname, '..', '..', 'skills', 'adversarial-debate', 'hooks', 'pre-execute.cjs')
);

function main() {
  const args = parseArgs(process.argv);

  if (args.help || args.h) {
    console.log(`
adversarial-debate — N-round structured debate for trade-off analysis

Usage:
  node adversarial-debate.cjs --topic "..." --pro "..." --con "..." [options]

Options:
  --topic    (required) The decision question being debated
  --pro      (required) PRO agent stance
  --con      (required) CON agent stance
  --rounds   Number of rounds (1-5, default: 3)
  --context  Background context about system or constraints
  --criteria Success criteria for the recommendation
  --help     Show this help

Output:
  JSON debate template to stdout
  Errors to stderr
    `);
    process.exit(0);
  }

  const input = {
    topic: args.topic,
    proStance: args.pro,
    conStance: args.con,
    rounds: args.rounds ? parseInt(args.rounds, 10) : 3,
    context: args.context || '',
    successCriteria: args.criteria || '',
  };

  const schema = null; // Pre-execute hook loads its own schema
  const { errors, warnings } = validateInput(input, schema);

  if (warnings.length > 0) {
    warnings.forEach(w => process.stderr.write(`WARNING: ${w}\n`));
  }

  if (errors.length > 0) {
    process.stderr.write('Validation failed:\n');
    errors.forEach(e => process.stderr.write(`  - ${e}\n`));
    process.exit(1);
  }

  const template = buildDebateTemplate({
    topic: args.topic,
    proStance: args.pro,
    conStance: args.con,
    rounds: parseInt(args.rounds, 10) || 3,
    context: args.context || '',
    successCriteria: args.criteria || '',
  });

  console.log(JSON.stringify(template, null, 2));
}

main();
