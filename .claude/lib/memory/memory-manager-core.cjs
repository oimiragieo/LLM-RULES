#!/usr/bin/env node
'use strict';

const implPath = require.resolve('./memory-manager-core-impl.cjs');
delete require.cache[implPath];
module.exports = require(implPath);
