#!/usr/bin/env node
'use strict';

/**
 * Compatibility wrapper for the historical channel auto-start hook path.
 * The implementation moved under `_archive/`, but tests and older callers
 * still resolve `.claude/hooks/channels/channel-auto-start.cjs`.
 */

const path = require('path');
const legacyHook = require('./_archive/channel-auto-start.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const LOCKFILE = path.join(RUNTIME, 'channel-autostart-cooldown.lock');

if (require.main === module) {
  legacyHook.main();
}

module.exports = {
  ...legacyHook,
  LOCKFILE,
};
