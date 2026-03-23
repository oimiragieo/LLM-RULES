#!/usr/bin/env node
'use strict';
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const result = safeParseJSON(process.argv[2] || '{}');

const summary = {
  ok: Boolean(result && result.ok),
  mode: result && result.mode ? result.mode : 'unknown',
  trigger: result && result.trigger ? result.trigger : 'manual',
  target: result && result.target ? result.target.skillName || null : null,
};

process.stdout.write(JSON.stringify(summary));
process.exit(0);
