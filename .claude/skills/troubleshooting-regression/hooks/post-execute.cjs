#!/usr/bin/env node
'use strict';

const result = JSON.parse(process.argv[2] || '{}');
const findings = Array.isArray(result.findings) ? result.findings.length : 0;
process.stdout.write(`[TROUBLESHOOTING-REGRESSION] Post-execute summary: findings=${findings}\n`);
