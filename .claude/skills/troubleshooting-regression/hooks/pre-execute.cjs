#!/usr/bin/env node
'use strict';

const payload = JSON.parse(process.argv[2] || '{}');
const acceptedModes = new Set(['quick', 'full']);
const mode = String(payload.mode || 'quick');

if (!acceptedModes.has(mode)) {
  process.stderr.write('[TROUBLESHOOTING-REGRESSION] Invalid mode. Use quick|full.\n');
  process.exit(1);
}

process.stdout.write('[TROUBLESHOOTING-REGRESSION] Pre-execute validation passed.\n');
