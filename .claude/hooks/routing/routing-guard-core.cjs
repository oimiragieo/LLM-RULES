#!/usr/bin/env node
'use strict';

const impl = require('./routing-guard-core.impl.cjs');

module.exports = impl;

if (require.main === module) {
  impl.main();
}
