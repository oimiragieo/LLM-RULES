#!/usr/bin/env node
'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { parseHookInputSync, formatResult } = require('../../lib/utils/hook-input.cjs');
const { classifyIntent } = require('../../lib/routing/intent-classifier.cjs');

function buildSuggestedRoutePath(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'runtime', 'suggested-route.json');
}

function runTaskAutoRoute(hookInput, options = {}) {
  const input = hookInput || {};
  const prompt = input.prompt || input.message || '';
  if (!prompt) return null;

  const classification = classifyIntent(prompt, {
    includeAlternatives: true,
    maxAlternatives: 2,
  });
  const payload = {
    intent: classification.intent,
    defaultAgent: classification.defaultAgent || null,
    confidence: classification.confidence,
    alternatives: classification.alternatives || [],
    timestamp: new Date().toISOString(),
  };

  const outputPath = options.outputPath || buildSuggestedRoutePath(options.projectRoot);
  atomicWriteJSONSync(outputPath, payload);
  return payload;
}

function main() {
  const input = parseHookInputSync() || {};
  try {
    runTaskAutoRoute(input);
  } catch (_err) {
    // Best effort - advisory hook should not block
  }
  process.stdout.write(formatResult('allow'));
}

if (require.main === module) {
  main();
}

module.exports = { runTaskAutoRoute, buildSuggestedRoutePath };
