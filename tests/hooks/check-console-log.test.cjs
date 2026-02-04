#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const checker = require('../../.claude/scripts/hooks/check-console-log.cjs');

describe('check-console-log hook', () => {
  let tempFile;
  let originalError;
  let messages;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `console-log-check-${Date.now()}.js`);
    fs.writeFileSync(tempFile, "console.log('test');\n", 'utf8');
    process.env.CONSOLE_LOG_CHECK_FILES = tempFile;
    messages = [];
    originalError = console.error;
    console.error = msg => messages.push(String(msg));
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    delete process.env.CONSOLE_LOG_CHECK_FILES;
    console.error = originalError;
  });

  it('emits a warning when console.log is found', () => {
    const files = checker.filterScriptFiles(checker.getCandidateFiles());
    checker.scanForConsoleLogs(files);
    assert.ok(messages.some(line => line.includes('console.log found')));
  });
});
