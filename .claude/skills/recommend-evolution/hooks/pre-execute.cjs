#!/usr/bin/env node
'use strict';

const { ALLOWED_TRIGGERS } = require('../scripts/main.cjs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function validateInput(input) {
  const errors = [];
  const trigger = String(input.trigger || '').trim();
  if (!trigger) {
    errors.push('Missing required field: trigger');
  } else if (!ALLOWED_TRIGGERS.has(trigger)) {
    errors.push(`Invalid trigger: ${trigger}`);
  }

  if (trigger === 'stale_skill') {
    const evidence = String(input.evidence || '').trim();
    if (!evidence) {
      errors.push('stale_skill requires evidence text');
    }
  }

  return errors;
}

function main(rawInput) {
  const input = rawInput || {};
  const errors = validateInput(input);
  return {
    ok: errors.length === 0,
    errors,
  };
}

if (require.main === module) {
  const input = safeParseJSON(process.argv[2] || '{}');
  const outcome = main(input);
  if (!outcome.ok) {
    console.error(JSON.stringify(outcome, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(outcome));
  process.exit(0);
}

module.exports = {
  validateInput,
  main,
};
