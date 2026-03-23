#!/usr/bin/env node
'use strict';
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const input = safeParseJSON(process.argv[2] || '{}');
const repos = Array.isArray(input.repos)
  ? input.repos
  : typeof input.repos === 'string'
    ? input.repos
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
    : [];

if (repos.length === 0) {
  // Non-blocking: skill can still run in planning-only mode.
  process.stdout.write(
    JSON.stringify({
      ok: true,
      warning: 'No repos supplied; assimilate will run in planning-only mode.',
    })
  );
  process.exit(0);
}

process.stdout.write(JSON.stringify({ ok: true, repoCount: repos.length }));
process.exit(0);
