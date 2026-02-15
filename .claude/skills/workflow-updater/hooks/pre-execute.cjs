#!/usr/bin/env node
'use strict';
const input = JSON.parse(process.argv[2] || '{}');
if (!String(input.workflow || input.name || '').trim()) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'Missing workflow target' }));
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true }));
