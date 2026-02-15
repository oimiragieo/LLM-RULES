#!/usr/bin/env node
'use strict';
const input = JSON.parse(process.argv[2] || '{}');
if (!String(input.harness || input.name || '').trim()) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'Missing harness target' }));
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true }));
