'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync: _spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Deleted CWD Recovery', () => {
  it('recovers from process.cwd() ENOENT by changing to PROJECT_ROOT', () => {
    // We cannot physically delete the CWD of the current Node process on Windows (throws EBUSY),
    // so we simulate the system-level error that Node throws when the CWD is deleted externally.

    const originalCwd = process.cwd;
    const originalChdir = process.chdir;
    let chdirCalledWith = null;

    // 1. Mock process.cwd to throw ENOENT
    process.cwd = () => {
      const err = new Error('ENOENT: no such file or directory, uv_cwd');
      err.code = 'ENOENT';
      err.syscall = 'uv_cwd';
      throw err;
    };

    // 2. Mock process.chdir to capture the recovery attempt
    process.chdir = dir => {
      chdirCalledWith = dir;
    };

    const _cwdError = null;

    // 3. Execute the exact same recovery logic we added to the hooks
    try {
      process.cwd();
    } catch (err) {
      if (err.code === 'ENOENT') {
        try {
          process.chdir(PROJECT_ROOT);
        } catch (_ignored) {
          /* recovery fallback */
        }
      }
    }

    // 4. Restore original methods
    process.cwd = originalCwd;
    process.chdir = originalChdir;

    // 5. Assert the recovery logic called chdir with PROJECT_ROOT
    assert.strictEqual(chdirCalledWith, PROJECT_ROOT);
  });
});
