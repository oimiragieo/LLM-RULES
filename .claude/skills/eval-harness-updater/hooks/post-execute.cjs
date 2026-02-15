#!/usr/bin/env node
'use strict';
const result = JSON.parse(process.argv[2] || '{}');
process.stdout.write(JSON.stringify({ ok: Boolean(result.ok), checks: result.checks || [] }));
