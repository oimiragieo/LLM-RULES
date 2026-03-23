#!/usr/bin/env node
// .claude/tools/behavioral-loop-detection/behavioral-loop-detection.cjs
// Companion CLI tool for behavioral-loop-detection skill
'use strict';

const path = require('path');
const mainScript = path.resolve(
  __dirname,
  '../../skills/behavioral-loop-detection/scripts/main.cjs'
);

// Re-export main script entry point for easy CLI use
require(mainScript);
