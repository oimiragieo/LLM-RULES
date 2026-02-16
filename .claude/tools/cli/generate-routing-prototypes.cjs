#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  ROUTING_TABLE,
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
} = require('../../lib/routing/routing-table.cjs');
const { EmbeddingGenerator } = require('../../lib/code-indexing/embedding-generator.cjs');

const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');

function collectPhrasesPerAgent() {
  const byAgent = new Map();
  for (const [keyword, agentId] of Object.entries(ROUTING_TABLE)) {
    if (!byAgent.has(agentId)) byAgent.set(agentId, []);
    const phrase = keyword.length >= 3 ? keyword : `task about ${keyword}`;
    byAgent.get(agentId).push(phrase);
  }
  for (const [intentKey, phrases] of Object.entries(INTENT_KEYWORDS)) {
    const agentId = INTENT_TO_AGENT[intentKey];
    if (!agentId || !Array.isArray(phrases)) continue;
    if (!byAgent.has(agentId)) byAgent.set(agentId, []);
    for (const phrase of phrases) {
      byAgent.get(agentId).push(phrase);
    }
  }
  for (const [agentId, list] of byAgent.entries()) {
    byAgent.set(agentId, Array.from(new Set(list)));
  }

  try {
    if (fs.existsSync(AGENT_REGISTRY_PATH)) {
      const registry = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
      if (registry && registry.agents) {
        for (const [agentId, list] of byAgent.entries()) {
          const card = registry.agents[agentId];
          if (!card || !Array.isArray(card.capabilities)) continue;
          const extra = [];
          for (const cap of card.capabilities) {
            if (Array.isArray(cap.triggerPhrases)) extra.push(...cap.triggerPhrases);
            if (Array.isArray(cap.examples)) extra.push(...cap.examples);
            if (Array.isArray(cap.tags)) extra.push(...cap.tags);
          }
          byAgent.set(agentId, Array.from(new Set([...list, ...extra])));
        }
      }
    }
  } catch (_err) {
    // best-effort; ignore registry load failures
  }

  return byAgent;
}

function normalizeL2(vec) {
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vec;
  return vec.map(value => value / norm);
}

function parseArgs(argv) {
  const args = { output: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: generate-routing-prototypes [--output <path>]');
    process.exit(0);
  }

  const outputPath =
    args.output || path.join(PROJECT_ROOT, '.claude', 'config', 'routing-prototypes.json');
  const byAgent = collectPhrasesPerAgent();

  const cacheEnabled = process.env.ROUTING_PROTOTYPES_CACHE === '1';
  const cachePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'data',
    'routing-prototypes-embedding-cache.json'
  );
  const generator = new EmbeddingGenerator({ cacheEnabled, cachePath });
  await generator.initialize();

  const dimensions = generator.getDimensions();
  const prototypes = {};
  for (const [agentId, phrases] of byAgent.entries()) {
    if (!phrases.length) continue;
    const embeddings = await generator.batchEmbed(phrases);
    const mean = embeddings[0].map(
      (_, index) => embeddings.reduce((sum, vec) => sum + vec[index], 0) / embeddings.length
    );
    prototypes[agentId] = normalizeL2(mean);
  }

  const payload = {
    version: '1.0.0',
    dimensions,
    model: 'Xenova/all-MiniLM-L6-v2',
    generatedAt: new Date().toISOString(),
    prototypes,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Generated routing prototypes.');
}

const wrappedMain = wrapCLITool(main, 'generate-routing-prototypes');

if (require.main === module) {
  wrappedMain();
}
