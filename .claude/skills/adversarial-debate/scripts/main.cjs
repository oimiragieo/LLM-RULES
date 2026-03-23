#!/usr/bin/env node
'use strict';

/**
 * adversarial-debate - Main Execution Script
 *
 * Runs an N-round structured debate between PRO and CON agents,
 * then produces a moderator synthesis with confidence-rated recommendation.
 *
 * Usage:
 *   node .claude/skills/adversarial-debate/scripts/main.cjs \
 *     --topic "Should we use event sourcing?" \
 *     --pro "Yes — provides audit trail and temporal queries" \
 *     --con "No — CRUD with snapshots is simpler and sufficient" \
 *     --rounds 3
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Round scoring rubric
// ---------------------------------------------------------------------------
function scoreRound(_proArg, _conArg) {
  // In agent context this would be evaluated by the moderator agent.
  // The script scaffolds the scoring structure; actual evaluation is cognitive.
  return {
    pro: {
      specificity: null,
      evidence: null,
      rebuttalQuality: null,
      relevance: null,
      total: null,
    },
    con: {
      specificity: null,
      evidence: null,
      rebuttalQuality: null,
      relevance: null,
      total: null,
    },
    note: 'Scores to be assigned by moderator agent following rubric in SKILL.md',
  };
}

// ---------------------------------------------------------------------------
// Debate scaffolding
// ---------------------------------------------------------------------------
function buildDebateTemplate(opts) {
  const { topic, proStance, conStance, rounds = 3, context = '', successCriteria = '' } = opts;

  const roundTemplates = [];
  for (let r = 1; r <= rounds; r++) {
    roundTemplates.push({
      round: r,
      pro: {
        stance: proStance,
        instructions: [
          '1 primary argument (specific, concrete)',
          '1 supporting piece of evidence (metric, case study, or first-principles reasoning)',
          '1 anticipated objection pre-addressed',
        ],
        argument: null,
      },
      con: {
        stance: conStance,
        instructions: [
          'Direct refutation of PRO primary argument (must engage it — no deflection)',
          '1 counter-argument from CON stance',
          '1 counter-evidence or challenge to PRO evidence',
        ],
        rebuttal: null,
      },
      score: scoreRound(null, null),
    });
  }

  return {
    topic,
    proStance,
    conStance,
    rounds: roundTemplates,
    context,
    successCriteria,
    synthesis: {
      proTotalScore: null,
      conTotalScore: null,
      strongestProArgument: null,
      strongestConArgument: null,
      decisionFactors: [],
      recommendation: null,
      confidence: null,
      rationale: null,
      caveats: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);

  if (!args.topic || !args.pro || !args.con) {
    process.stderr.write('Usage: main.cjs --topic "..." --pro "..." --con "..." [--rounds N]\n');
    process.stderr.write('  topic:  The decision question being debated\n');
    process.stderr.write('  pro:    The PRO stance\n');
    process.stderr.write('  con:    The CON stance\n');
    process.stderr.write('  rounds: Number of debate rounds (1-5, default 3)\n');
    process.exit(1);
  }

  const rounds = parseInt(args.rounds, 10) || 3;
  if (rounds < 1 || rounds > 5) {
    process.stderr.write('ERROR: rounds must be between 1 and 5\n');
    process.exit(1);
  }

  const template = buildDebateTemplate({
    topic: args.topic,
    proStance: args.pro,
    conStance: args.con,
    rounds,
    context: args.context || '',
    successCriteria: args.criteria || '',
  });

  console.log(JSON.stringify(template, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { buildDebateTemplate, scoreRound, parseArgs };
