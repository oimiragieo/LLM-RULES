#!/usr/bin/env node
'use strict';

const archivedPath = require.resolve('../_archive/creator-compliance-validator.cjs');
delete require.cache[archivedPath];
const archivedValidator = require(archivedPath);

if (require.main === module) {
  archivedValidator.main();
}

module.exports = archivedValidator;
