#!/usr/bin/env node
'use strict';

/**
 * Tool-manifest drift detector (H-4 fix)
 *
 * Compares agent tool lists in agent-config.json against
 * tool-manifest.json toolset definitions and reports mismatches.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT, '.claude', 'config', 'agent-config.json');
const MANIFEST_PATH = path.join(ROOT, '.claude', 'config', 'tool-manifest.json');

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('[SKIP] agent-config.json not found');
    process.exit(0);
  }
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('[SKIP] tool-manifest.json not found');
    process.exit(0);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const toolsets = manifest.toolsets || {};
  const validation = manifest.validation || {};
  const agentDefaults = validation.agentDefaults || {};

  const warnings = [];

  const agents = config.agents || {};
  for (const [agentName, agentConf] of Object.entries(agents)) {
    const configTools = agentConf.tools || [];
    const manifestDefault = agentDefaults[agentName];

    if (!manifestDefault) {
      warnings.push(
        `[DRIFT] ${agentName}: exists in agent-config.json but not in tool-manifest.json agentDefaults`
      );
      continue;
    }

    const manifestToolset = manifestDefault.toolset;
    const manifestTools = toolsets[manifestToolset] || [];

    const configSet = new Set(configTools);
    const manifestSet = new Set(manifestTools);

    const inConfigNotManifest = configTools.filter(t => !manifestSet.has(t));
    const inManifestNotConfig = manifestTools.filter(t => !configSet.has(t));

    if (inConfigNotManifest.length > 0) {
      warnings.push(
        `[DRIFT] ${agentName}: tools in config but not manifest: ${inConfigNotManifest.join(', ')}`
      );
    }
    if (inManifestNotConfig.length > 0) {
      warnings.push(
        `[DRIFT] ${agentName}: tools in manifest but not config: ${inManifestNotConfig.join(', ')}`
      );
    }
  }

  if (warnings.length === 0) {
    console.log('[PASS] No tool-manifest drift detected');
    process.exit(0);
  }

  console.log(`[WARN] ${warnings.length} tool-manifest drift issue(s) found:`);
  warnings.forEach(w => console.log(`  ${w}`));
  // Advisory only — exit 0 so it doesn't block CI until manually reviewed
  process.exit(0);
}

main();
