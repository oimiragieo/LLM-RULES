#!/usr/bin/env node
/**
 * @file scripts/validation/ci-validation-gate.cjs
 * @description CLI entry point for CI validation gate
 *
 * Usage:
 *   node ci-validation-gate.cjs [options]
 *
 * Options:
 *   --json              Output results as JSON
 *   --strict            Exit 1 on warnings
 *   --layer <name>      Run specific layer only (existence|forward-ref|backward-ref|semantic)
 *   --project-root <path>  Project root directory (default: cwd)
 *   --registry <path>   Path to agent-registry.json
 */

const fs = require('fs');
const path = require('path');
const { runAllLayers } = require('../../.claude/lib/validation/ci-gate-layers.cjs');

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  strict: args.includes('--strict'),
  layer: args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null,
  projectRoot: args.includes('--project-root')
    ? args[args.indexOf('--project-root') + 1]
    : process.cwd(),
  registryPath: args.includes('--registry') ? args[args.indexOf('--registry') + 1] : null,
};

async function main() {
  const { projectRoot, registryPath } = options;

  // Collect agents from .claude/agents/
  const agentsDir = path.join(projectRoot, '.claude/agents');
  const agents = [];

  if (fs.existsSync(agentsDir)) {
    const walk = dir => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.md')) {
          agents.push(fullPath);
        }
      }
    };
    walk(agentsDir);
  }

  // Run validation
  const result = await runAllLayers(projectRoot, {
    agents,
    skillsDir: path.join(projectRoot, '.claude/skills'),
    settingsPath: path.join(projectRoot, '.claude/settings.json'),
    registryPath,
  });

  // Output results
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('CI Validation Gate Results:');
    console.log('===========================');
    console.log(`Valid: ${result.valid}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Warnings: ${result.warnings.length}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. [${error.layer}] ${error.message}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. [${warning.layer}] ${warning.message}`);
      });
    }
  }

  // Exit with appropriate code
  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;

  if (hasErrors || (options.strict && hasWarnings)) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('CI validation gate failed:', error);
  process.exit(1);
});
