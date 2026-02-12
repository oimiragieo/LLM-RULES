#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  formatManifestJson,
} = require(path.join('..', '..', '.claude', 'tools', 'cli', 'generate-tool-manifest.cjs'));

describe('generate-tool-manifest formatting', () => {
  it('formats JSON with resolved Prettier config and trailing newline', async () => {
    const manifestPath = path.join(process.cwd(), '.claude', 'config', 'tool-manifest.json');
    const manifest = {
      longList: [
        'aaaaaaaaaa',
        'bbbbbbbbbb',
        'cccccccccc',
        'dddddddddd',
        'eeeeeeeeee',
        'ffffffffff',
        'gggggggggg',
      ],
    };

    const raw = JSON.stringify(manifest, null, 2);
    const prettier = await import('prettier');
    const resolved = await prettier.resolveConfig(manifestPath);
    const expected = await prettier.format(raw, { ...(resolved || {}), filepath: manifestPath });

    const actual = await formatManifestJson(manifest);
    const normalizedExpected = expected.endsWith('\n') ? expected : `${expected}\n`;

    assert.strictEqual(actual, normalizedExpected);
    assert.ok(actual.endsWith('\n'));
  });
});
