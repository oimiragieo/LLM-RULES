#!/usr/bin/env node
/**
 * Agent Registry CLI
 *
 * Generate agent capability registry from agent definitions.
 *
 * Usage:
 *   npm run agents:registry
 *   node .claude/tools/cli/generate-agent-registry.cjs [--validate] [--output <path>]
 *
 * Options:
 *   --validate    Validate existing registry against schema
 *   --output      Custom output path (default: .claude/context/agent-registry.json)
 *   --help        Show this help message
 *
 * @module generate-agent-registry
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { AgentRegistryGenerator } = require('../../lib/tools/agent-registry-generator.cjs');

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    validate: false,
    output: path.join(PROJECT_ROOT, '.claude/context/agent-registry.json'),
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--validate') {
      options.validate = true;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = path.resolve(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Agent Registry CLI

Generate agent capability registry from agent definitions.

Usage:
  npm run agents:registry
  node .claude/tools/cli/generate-agent-registry.cjs [options]

Options:
  --validate    Validate existing registry against schema only
  --output      Custom output path (default: .claude/context/agent-registry.json)
  --help, -h    Show this help message

Examples:
  npm run agents:registry                     # Generate registry
  npm run agents:registry -- --validate       # Validate only
  npm run agents:registry -- --output out.json # Custom output
`);
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const generator = new AgentRegistryGenerator();
  const agentsDir = path.join(PROJECT_ROOT, '.claude/agents');

  console.log('Agent Registry Generator');
  console.log('========================\n');

  if (options.validate) {
    // Validate existing registry only
    const fs = require('fs');
    const registryPath = options.output;

    if (!fs.existsSync(registryPath)) {
      console.error(`Registry file not found: ${registryPath}`);
      process.exit(1);
    }

    console.log(`Validating registry: ${registryPath}\n`);

    const registry = safeParseJSON(fs.readFileSync(registryPath, 'utf-8'));
    const validation = generator.validate(registry);

    if (validation.valid) {
      const agentCount = registry.agents ? Object.keys(registry.agents).length : 0;
      console.log('Validation PASSED');
      console.log(`  Agents: ${agentCount}`);
      console.log(`  Healthy: ${registry.health.healthy.length}`);
      console.log(`  Degraded: ${registry.health.degraded.length}`);
      console.log(`  Unavailable: ${registry.health.unavailable.length}`);
      process.exit(0);
    } else {
      console.error('Validation FAILED:');
      for (const error of validation.errors) {
        console.error(`  Agent: ${error.agentId}`);
        for (const err of error.errors) {
          console.error(`    - ${err.instancePath}: ${err.message}`);
        }
      }
      process.exit(1);
    }
  }

  // Generate registry
  console.log('Scanning agents...\n');

  const startTime = Date.now();
  const registry = await generator.generate(agentsDir);
  const scanTime = Date.now() - startTime;

  console.log(`Scan completed in ${scanTime}ms\n`);
  console.log('Summary:');
  console.log(`  Total agents: ${registry.metadata.totalAgents}`);
  console.log(`  Categories:`);
  for (const [category, agents] of Object.entries(registry.index.byCategory)) {
    console.log(`    - ${category}: ${agents.length} agents`);
  }
  const domainCount = registry.index?.byDomain ? Object.keys(registry.index.byDomain).length : 0;
  const capabilityCount = registry.index?.byCapability
    ? Object.keys(registry.index.byCapability).length
    : 0;
  console.log(`  Domains: ${domainCount}`);
  console.log(`  Capabilities: ${capabilityCount}`);
  console.log();

  // Validate
  console.log('Validating against schema...');
  const validation = generator.validate(registry);

  if (!validation.valid) {
    console.error('\nValidation FAILED:');
    for (const error of validation.errors) {
      console.error(`  Agent: ${error.agentId}`);
      for (const err of error.errors) {
        console.error(`    - ${err.instancePath}: ${err.message}`);
      }
    }
    process.exit(1);
  }

  console.log('Validation PASSED\n');

  // Save
  generator.saveRegistry(registry, options.output);

  console.log('\nDone!');
}

const wrappedMain = wrapCLITool(main, 'generate-agent-registry');

if (require.main === module) {
  wrappedMain();
}

module.exports = { main, parseArgs };
