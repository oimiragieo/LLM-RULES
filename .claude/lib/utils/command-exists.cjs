#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

function commandExists(cmd) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(String(cmd))) {
    return false;
  }

  try {
    const isWindows = process.platform === 'win32';
    const result = spawnSync(isWindows ? 'where' : 'which', [cmd], {
      stdio: 'pipe',
      windowsHide: true,
    });
    return result.status === 0;
  } catch (_err) {
    return false;
  }
}

module.exports = { commandExists };
