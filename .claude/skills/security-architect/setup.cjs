#!/usr/bin/env node
/**
 * Security-Architect Skill Setup Check
 * =====================================
 *
 * Checks that all tools declared in this skill's manifest.json are available.
 * Exits 0 if ready, 1 if one or more required tools are missing.
 *
 * Usage:
 *   node setup.cjs            (invoked by skill-tool runSetup() or manually)
 *
 * Output: JSON { ready, missing, warnings } to stdout.
 */

'use strict';

const { runSetupCheck } = require('../../lib/tools/setup-runner.cjs');

const result = runSetupCheck(__dirname);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ready ? 0 : 1);
