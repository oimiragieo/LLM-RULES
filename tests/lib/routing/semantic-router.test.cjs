#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  EmbeddingGenerator,
} = require('../../../.claude/lib/code-indexing/embedding-generator.cjs');
const semanticRouter = require('../../../.claude/lib/routing/semantic-router.cjs');

const originalEmbedder = process.env.CODE_INDEX_EMBEDDER;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

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

  it('returns sub-routers in the top results for domain prompts', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-router-domains-'));
    const prototypesPath = path.join(tmpDir, 'routing-prototypes.json');

    const generation = spawnSync(
      process.execPath,
      ['.claude/tools/cli/generate-routing-prototypes.cjs', '--output', prototypesPath],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, CODE_INDEX_EMBEDDER: 'mock' },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(generation.status, 0, generation.stderr || generation.stdout);

    const cases = [
      ['Build a React component with responsive Tailwind styles.', 'domain-router-web-frontend'],
      [
        'Design a FastAPI service with Pydantic models and async endpoints.',
        'domain-router-backend',
      ],
      ['Plan a Kubernetes rollout with Helm and ArgoCD.', 'domain-router-infra'],
      ['Evaluate a RAG pipeline with embeddings and retrieval tuning.', 'domain-router-ai-ml'],
      ['Create a sprint planning and backlog prioritization strategy.', 'domain-router-product'],
    ];

    for (const [prompt, expectedRouter] of cases) {
      const results = await semanticRouter.predict(prompt, {
        prototypesPath,
        topK: 3,
        minScore: -1,
      });

      assert.ok(
        results.some(result => result.agent === expectedRouter),
        `expected ${expectedRouter} in top-3 for "${prompt}", got ${results.map(result => result.agent).join(', ')}`
      );
    }
  });
});
