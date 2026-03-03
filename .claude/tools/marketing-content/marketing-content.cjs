'use strict';

/**
 * marketing-content.cjs — CLI companion tool for marketing-content skill
 *
 * Usage:
 *   node .claude/tools/marketing-content/marketing-content.cjs --action write-copy --platform email
 *   node .claude/tools/marketing-content/marketing-content.cjs --action plan-campaign --goal leads
 *   node .claude/tools/marketing-content/marketing-content.cjs --help
 */

const path = require('path');

// Delegate to skill's main script
const skillMainPath = path.resolve(__dirname, '../../skills/marketing-content/scripts/main.cjs');

try {
  require(skillMainPath);
} catch (err) {
  console.error(`[marketing-content-tool] Failed to load skill: ${err.message}`);
  process.exit(1);
}
