#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EmbeddingGenerator,
} = require('../../../.claude/lib/code-indexing/embedding-generator.cjs');
const semanticRouter = require('../../../.claude/lib/routing/semantic-router.cjs');

const originalEmbedder = process.env.CODE_INDEX_EMBEDDER;

beforeEach(() => {
  process.env.CODE_INDEX_EMBEDDER = 'mock';
  semanticRouter._clearPrototypeCache();
});

afterEach(() => {
  if (originalEmbedder === undefined) {
    delete process.env.CODE_INDEX_EMBEDDER;
  } else {
    process.env.CODE_INDEX_EMBEDDER = originalEmbedder;
  }
  semanticRouter._clearPrototypeCache();
});

describe('semantic-router', () => {
  it('loadPrototypes returns null for missing file', () => {
    const result = semanticRouter.loadPrototypes(
      path.join(os.tmpdir(), 'missing-routing-prototypes.json')
    );
    assert.strictEqual(result, null);
  });

  it('cosineSimilarity handles normalized vectors', () => {
    const same = semanticRouter.cosineSimilarity([1, 0], [1, 0]);
    const opposite = semanticRouter.cosineSimilarity([1, 0], [-1, 0]);
    const orthogonal = semanticRouter.cosineSimilarity([1, 0], [0, 1]);
    assert.strictEqual(same, 1);
    assert.strictEqual(opposite, -1);
    assert.strictEqual(orthogonal, 0);
  });

  it('predict returns best matching agent', async () => {
    const generator = new EmbeddingGenerator({ cacheEnabled: false });
    await generator.initialize();
    const prompt = 'Build a REST API in Node';
    const embedding = await generator.embed(prompt, false);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-prototypes-'));
    const prototypesPath = path.join(tmpDir, 'routing-prototypes.json');
    const inverted = embedding.map(value => -value);

    fs.writeFileSync(
      prototypesPath,
      JSON.stringify(
        {
          version: '1.0.0',
          dimensions: embedding.length,
          model: 'Xenova/all-MiniLM-L6-v2',
          generatedAt: new Date().toISOString(),
          prototypes: {
            developer: embedding,
            qa: inverted,
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const results = await semanticRouter.predict(prompt, {
      prototypesPath,
      minScore: 0.2,
    });

    assert.ok(results.length >= 1, 'Should return at least one candidate');
    assert.strictEqual(results[0].agent, 'developer');
  });
});
