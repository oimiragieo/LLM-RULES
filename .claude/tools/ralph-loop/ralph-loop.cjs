#!/usr/bin/env node
'use strict';

/**
 * ralph-loop companion tool
 * CLI wrapper for ralph loop state management.
 *
 * Usage:
 *   node .claude/tools/ralph-loop/ralph-loop.cjs status
 *   node .claude/tools/ralph-loop/ralph-loop.cjs reset
 *   node .claude/tools/ralph-loop/ralph-loop.cjs config
 */

const path = require('path');
const mainScript = path.resolve(__dirname, '..', '..', 'skills', 'ralph-loop', 'scripts', 'main.cjs');

// Delegate to main skill script
require(mainScript);
