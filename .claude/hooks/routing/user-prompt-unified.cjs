#!/usr/bin/env node
'use strict';

const core = require('./user-prompt-unified.core.cjs');

if (require.main === module) {
  core.main().catch(() => {
    process.exit(0);
  });
}

const { main: _main, ...exportsForTesting } = core;
module.exports = exportsForTesting;
