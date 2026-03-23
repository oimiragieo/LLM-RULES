'use strict';

/**
 * project-stage-detection/hooks/pre-execute.cjs
 * Validates input before running project stage detection.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function preExecute(input = {}) {
  const errors = [];

  if (input.targetDir !== undefined) {
    if (typeof input.targetDir !== 'string') {
      errors.push('targetDir must be a string path');
    } else if (!fs.existsSync(path.resolve(input.targetDir))) {
      process.stderr.write(
        `[project-stage-detection/pre-execute] WARNING: targetDir does not exist: ${input.targetDir}\n`
      );
    }
  }

  if (input.outputFormat !== undefined) {
    const validFormats = ['json', 'markdown', 'both'];
    if (!validFormats.includes(input.outputFormat)) {
      errors.push(`outputFormat must be one of: ${validFormats.join(', ')}`);
    }
  }

  if (input.stageOverride !== undefined) {
    const validStages = ['new', 'early', 'mid', 'mature'];
    if (!validStages.includes(input.stageOverride)) {
      errors.push(`stageOverride must be one of: ${validStages.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[project-stage-detection/pre-execute] Validation failed:\n${errors.join('\n')}\n`
    );
    process.exit(2);
  }

  return { continue: true };
}

module.exports = { preExecute };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => (raw += d));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = safeParseJSON(raw);
    } catch (_err) {
      /* non-JSON stdin ignored */
    }
    preExecute(input);
    process.exit(0);
  });
}
