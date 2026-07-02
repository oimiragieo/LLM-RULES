'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Dispatcher } = require('../../../scripts/channels/daemon/dispatcher.cjs');

describe('Dispatcher file attachment safety', () => {
  it('only sends extracted files from approved artifact directories', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-safe-files-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-secret-'));
    const sent = [];

    try {
      const artifactDir = path.join(root, '.claude', 'context', 'artifacts');
      fs.mkdirSync(artifactDir, { recursive: true });
      const allowedFile = path.join(artifactDir, 'report.md');
      const blockedFile = path.join(outside, 'secret.json');
      fs.writeFileSync(allowedFile, 'ok', 'utf8');
      fs.writeFileSync(blockedFile, 'secret', 'utf8');

      const dispatcher = new Dispatcher(
        { resolve: () => [] },
        {},
        {},
        () => {},
        null,
        { projectRoot: root }
      );
      const sink = {
        async sendFile(_chatId, filePath) {
          sent.push(filePath);
          return true;
        },
      };

      await dispatcher._sendExtractedFiles(sink, 'chat1', [allowedFile, blockedFile]);

      assert.deepEqual(sent, [allowedFile]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
