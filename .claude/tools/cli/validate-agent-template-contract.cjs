#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const path = require('node:path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  CONTRACT_MARKER,
  scanAgentFiles,
  validateAgentFile,
} = require('../../lib/agents/agent-template-contract.cjs');

function parseArgs(argv) {
  const args = {
    agentsRoot: path.join(PROJECT_ROOT, '.claude', 'agents'),
    managedOnly: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--agents-root' && argv[i + 1]) {
      args.agentsRoot = path.resolve(argv[++i]);
    } else if (token === '--all') {
      args.managedOnly = false;
    }
  }
  return args;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = scanAgentFiles(opts.agentsRoot);
  const failures = [];
  let scanned = 0;

  for (const file of files) {
    const result = validateAgentFile(file, { requireMarker: false });
    const shouldCheck = opts.managedOnly ? result.metadata?.hasMarker === true : true;
    if (!shouldCheck) continue;
    scanned += 1;
    const strict = validateAgentFile(file, { requireMarker: true });
    if (!strict.valid) {
      const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
      failures.push(`${rel}: ${strict.errors.join('; ')}`);
    }
  }

  if (failures.length > 0) {
    console.error('Agent template contract validation failed:');
    for (const line of failures.slice(0, 100)) {
      console.error(`- ${line}`);
    }
    if (failures.length > 100) {
      console.error(`- ... ${failures.length - 100} more issue(s)`);
    }
    process.exit(1);
  }

  const scope = opts.managedOnly ? `managed agents (marker: ${CONTRACT_MARKER})` : 'all agents';
  console.log(`Agent template contract validation passed (${scanned} ${scope}).`);
}

const wrappedMain = wrapCLITool(main, 'validate-agent-template-contract');

if (require.main === module) {
  wrappedMain();
}

module.exports = { parseArgs, main };
