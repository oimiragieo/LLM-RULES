#!/usr/bin/env node
'use strict';

const result = JSON.parse(process.argv[2] || '{}');
const checkpoints = Array.isArray(result.checkpoints) ? result.checkpoints.length : 0;

process.stdout.write(
  JSON.stringify({
    ok: true,
    checkpoints,
  })
);
process.exit(0);
