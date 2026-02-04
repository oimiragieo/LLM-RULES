#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');

function listModeNamesForRoot(projectRoot) {
  const modesDir = path.join(projectRoot, '.claude', 'config', 'modes');
  if (!fs.existsSync(modesDir)) return [];
  return fs
    .readdirSync(modesDir)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map(file => file.replace(/\.ya?ml$/, ''));
}

function normalizeModes(modes) {
  return (modes || []).map(mode => String(mode).trim()).filter(Boolean);
}

function runSwitchModes(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const modeNames = normalizeModes(options.modeNames || []);
  const validModes = new Set(listModeNamesForRoot(projectRoot));

  const invalid = modeNames.filter(mode => !validModes.has(mode));
  if (invalid.length > 0) {
    return {
      ok: false,
      message: 'Unknown mode(s): ' + invalid.join(', '),
    };
  }

  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  const currentModesPath = path.join(runtimeDir, 'current-modes.json');
  const payload = { modes: modeNames };

  atomicWriteJSONSync(currentModesPath, payload);

  return {
    ok: true,
    message: modeNames.length > 0 ? 'Modes set to: ' + modeNames.join(', ') : 'Modes cleared.',
    modes: modeNames,
    path: currentModesPath,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const result = runSwitchModes({ modeNames: args });
  if (!result.ok) {
    console.error('[switch-modes] ' + result.message);
    process.exit(1);
  }
  console.log(result.message);
}

module.exports = {
  runSwitchModes,
};
