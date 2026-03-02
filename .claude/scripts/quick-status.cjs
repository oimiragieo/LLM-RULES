#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../lib/utils/safe-json.cjs');

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return safeParseJSON(raw, null);
}

function runQuickStatus(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const routingTablePath =
    options.routingTablePath ||
    path.join(projectRoot, '.claude', 'lib', 'routing', 'routing-table.cjs');
  const capabilityRoutingPath = path.join(
    projectRoot,
    '.claude',
    'config',
    'capability-routing.json'
  );
  const routingPrototypesPath = path.join(
    projectRoot,
    '.claude',
    'config',
    'routing-prototypes.json'
  );
  const agentRegistryPath = path.join(projectRoot, '.claude', 'context', 'agent-registry.json');

  const results = [];
  let ok = true;

  const checkJson = (label, filePath, optional = false) => {
    if (!fs.existsSync(filePath)) {
      results.push({
        label,
        status: optional ? 'OK (optional missing)' : 'MISSING',
      });
      if (!optional) ok = false;
      return;
    }
    try {
      const parsed = loadJson(filePath);
      // safeParseJSON returns Object.create(null) on parse failure — detect empty results
      if (!parsed || Object.keys(parsed).length === 0) {
        results.push({ label, status: 'INVALID (empty or unparseable)' });
        ok = false;
        return;
      }
      results.push({ label, status: 'OK' });
    } catch (err) {
      results.push({ label, status: `INVALID (${err.message})` });
      ok = false;
    }
  };

  const checkRoutingPrototypes = () => {
    if (!fs.existsSync(routingPrototypesPath)) {
      results.push({ label: 'routing-prototypes.json', status: 'MISSING' });
      ok = false;
      return;
    }
    try {
      const parsed = loadJson(routingPrototypesPath);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.prototypes === 'object' &&
        typeof parsed.dimensions === 'number'
      ) {
        results.push({ label: 'routing-prototypes.json', status: 'OK' });
      } else {
        results.push({
          label: 'routing-prototypes.json',
          status: 'INVALID (missing prototypes or dimensions)',
        });
        ok = false;
      }
    } catch (err) {
      results.push({
        label: 'routing-prototypes.json',
        status: `INVALID (${err.message})`,
      });
      ok = false;
    }
  };

  checkJson('capability-routing.json', capabilityRoutingPath, false);
  checkRoutingPrototypes();
  checkJson('agent-registry.json', agentRegistryPath, true);

  try {
    require(routingTablePath);
    results.push({ label: 'routing-table.cjs', status: 'OK' });
  } catch (err) {
    results.push({ label: 'routing-table.cjs', status: `INVALID (${err.message})` });
    ok = false;
  }

  return { ok, results };
}

function formatLine(entry) {
  return `${entry.label}: ${entry.status}`;
}

function main() {
  const { ok, results } = runQuickStatus();
  for (const entry of results) {
    process.stdout.write(`${formatLine(entry)}\n`);
  }
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { runQuickStatus };
