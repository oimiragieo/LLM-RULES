#!/usr/bin/env node
'use strict';

/**
 * Mission Lint CLI
 *
 * Validates that all feature.skillName entries resolve to .claude/skills/<name>/SKILL.md.
 * Usage: node scripts/mission/mission-lint.cjs <mission-path>
 */

const fs = require('node:fs');
const path = require('node:path');

const missionPath = process.argv[2];
if (!missionPath) {
  console.error('Usage: mission-lint <mission-path>');
  process.exit(1);
}

const resolved = path.resolve(missionPath);
const featuresPath = path.join(resolved, 'features.json');

if (!fs.existsSync(featuresPath)) {
  console.error('features.json not found in mission folder');
  process.exit(1);
}

const { features } = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
const skillsDir = path.join(process.cwd(), '.claude', 'skills');
const errors = [];
const warnings = [];
const checked = new Set();

for (const feature of features) {
  if (!feature.skillName) {
    errors.push(`Feature ${feature.id}: missing skillName`);
    continue;
  }

  if (checked.has(feature.skillName)) continue;
  checked.add(feature.skillName);

  const skillPath = path.join(skillsDir, feature.skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    // Check if it's a known agent type
    const agentPath = path.join(process.cwd(), '.claude', 'agents');
    const agentFiles = [
      path.join(agentPath, 'core', `${feature.skillName}.md`),
      path.join(agentPath, 'domain', `${feature.skillName}.md`),
      path.join(agentPath, 'specialized', `${feature.skillName}.md`),
      path.join(agentPath, 'orchestrators', `${feature.skillName}.md`),
    ];
    const isAgent = agentFiles.some(p => fs.existsSync(p));
    if (isAgent) {
      // skillName points to an agent, not a skill — acceptable
      continue;
    }
    errors.push(
      `Feature ${feature.id}: skillName "${feature.skillName}" not found at ${skillPath}`
    );
  }
}

// Check for empty fulfills
for (const feature of features) {
  if (!feature.fulfills || feature.fulfills.length === 0) {
    warnings.push(`Feature ${feature.id}: no fulfills VAL-* IDs`);
  }
}

console.log(`\n=== Mission Lint: ${resolved} ===`);
console.log(`Features checked: ${features.length}`);
console.log(`Unique skills checked: ${checked.size}`);

if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`);
  for (const err of errors) console.log(`  ✗ ${err}`);
}

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warn of warnings) console.log(`  ⚠ ${warn}`);
}

if (errors.length === 0) {
  console.log('\nResult: PASS');
} else {
  console.log(`\nResult: FAIL (${errors.length} errors)`);
  process.exit(1);
}
