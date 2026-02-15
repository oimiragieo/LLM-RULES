#!/usr/bin/env node
'use strict';
const input = JSON.parse(process.argv[2] || '{}');
const agent = String(input.agent || input.name || '').trim();
if (!agent) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'Missing agent target' }));
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true, agent }));
