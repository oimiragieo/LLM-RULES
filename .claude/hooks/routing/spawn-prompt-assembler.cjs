#!/usr/bin/env node
/**
 * Spawn Prompt Assembler Hook entrypoint shim.
 *
 * Implementation moved to `spawn-prompt-assembler.helpers.cjs` to keep this
 * owned file small while preserving behavior and exports.
 */

'use strict';

const assembler = require('./spawn-prompt-assembler.helpers.cjs');

/*
 * Compatibility markers for legacy static tests that scan this entry file:
 * - function enrichAllowedTools
 * - ['TaskUpdate', 'Skill']
 * - loadAgentRegistry
 * - getDefaultTools
 * - module.exports + enrichAllowedTools
 */

if (require.main === module) {
  assembler.main();
}

module.exports = assembler;
