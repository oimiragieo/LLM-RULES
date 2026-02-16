#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const DEFAULT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const DEFAULT_OUTPUT_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-catalog.json');

function parseArgs(argv) {
  const args = { output: null, registry: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === '--registry' && argv[i + 1]) {
      args.registry = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function buildCatalog(registry) {
  const agents = [];
  for (const [agentId, card] of Object.entries(registry.agents || {})) {
    const capabilities = Array.isArray(card.capabilities) ? card.capabilities : [];
    const description =
      capabilities[0]?.description || card?.description || card?.metadata?.description || '';
    const skills = capabilities.map(capability => ({
      id: capability.name,
      name: capability.name,
      description: capability.description || '',
      tags: Array.isArray(capability.tags) ? capability.tags : [],
      examples: Array.isArray(capability.examples) ? capability.examples : [],
    }));
    agents.push({
      id: agentId,
      name: card.displayName || agentId,
      description,
      version: card?.metadata?.version || '1.0.0',
      skills,
    });
  }
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    agents,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: generate-agent-catalog [--registry <path>] [--output <path>]');
    process.exit(0);
  }

  const registryPath = args.registry || DEFAULT_REGISTRY_PATH;
  const outputPath = args.output || DEFAULT_OUTPUT_PATH;

  if (!fs.existsSync(registryPath)) {
    console.error(`[generate-agent-catalog] Registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = safeParseJSON(fs.readFileSync(registryPath, 'utf8'));
  const catalog = buildCatalog(registry);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Generated agent catalog at ${outputPath}`);
}

const wrappedMain = wrapCLITool(main, 'generate-agent-catalog');

if (require.main === module) {
  wrappedMain();
}

module.exports = { buildCatalog };
