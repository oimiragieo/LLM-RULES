#!/usr/bin/env node
'use strict';

const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const corePath = require.resolve('./memory-manager-core.cjs');
delete require.cache[corePath];
const manager = require(corePath);
const { runMemoryManagerCli } = require('./memory-manager-cli.cjs');

const logger = createLogger('memory-manager');

if (require.main === module) {
  runMemoryManagerCli({
    args: process.argv.slice(2),
    manager,
    logger,
    projectRoot: PROJECT_ROOT,
  });
}

module.exports = manager;
