'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const fs = require('fs');

function validateIndex(indexPath) {
  const errors = [];
  const warnings = [];

  try {
    const index = safeParseJSON(fs.readFileSync(indexPath, 'utf8'));

    if (!index.version) {
      errors.push('Missing version field');
    }

    const skillCount = Object.keys(index.skills || {}).length;
    if (skillCount < 100) {
      warnings.push(`Expected 400+ skills, found ${skillCount}`);
    }

    const domainCount = Object.keys(index.index?.byDomain || {}).length;
    if (domainCount < 10) {
      warnings.push(`Expected 20+ domains, found ${domainCount}`);
    }

    for (const [name, skill] of Object.entries(index.skills || {})) {
      if (!skill.requiredTools || skill.requiredTools.length === 0) {
        warnings.push(`Skill ${name} has no required tools`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (err) {
    return { valid: false, errors: [`Failed to parse index: ${err.message}`], warnings };
  }
}

module.exports = { validateIndex };
