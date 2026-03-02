#!/usr/bin/env node
'use strict';
/**
 * ecosystem-integrity-scanner - Enterprise Skill Script
 * NOTE: The underlying validator (validate-ecosystem-integrity.cjs) has been
 * removed. This skill now operates in stub mode and returns a deprecation
 * notice. Use the proactive-audit skill or validate:full pipeline instead.
 */

const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

if (options.help) {
  console.log(`
ecosystem-integrity-scanner - Enterprise Skill

Usage:
  node main.cjs              Run the full ecosystem integrity audit
  node main.cjs --json       Output results as JSON (for agent consumption)
  node main.cjs --help       Show this help

Description:
  Wraps scripts/validation/validate-ecosystem-integrity.cjs and runs a
  full structural health check on the Agent Studio framework. Catches:
    - Phantom require() paths (PHANTOM_REQUIRE)
    - Missing skills in agent frontmatter (PHANTOM_SKILL)
    - Empty tool/skill directories (EMPTY_DIR)
    - UTF-16 encoded files (ENCODING)
    - Archive refs in production code (ARCHIVED_REF)
    - Stale agent-registry.json counts (STALE_CATALOG)
`);
  process.exit(0);
}

const ROOT = process.cwd();
const validatorPath = path.join(ROOT, 'scripts', 'validation', 'validate-ecosystem-integrity.cjs');

const fs = require('fs');
if (!fs.existsSync(validatorPath)) {
  const msg =
    'ecosystem-integrity-scanner: validate-ecosystem-integrity.cjs has been removed.\n' +
    'Use Skill({ skill: "proactive-audit" }) or run pnpm validate:full instead.';
  if (options.json) {
    console.log(
      JSON.stringify({
        status: 'UNAVAILABLE',
        errors: 0,
        warnings: 1,
        findings: [msg],
        raw: msg,
      })
    );
  } else {
    process.stderr.write(msg + '\n');
  }
  process.exit(0);
}

const { execSync } = require('child_process');

let stdout = '';
let stderr = '';
let exitCode = 0;

try {
  stdout = execSync('node', [validatorPath], {
    cwd: ROOT,
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  stdout = err.stdout || '';
  stderr = err.stderr || '';
  exitCode = err.status || 1;
}

if (options.json) {
  // Parse error/warning counts from output
  const errorMatch = stdout.match(/Errors found:\s*(\d+)/);
  const warnMatch = stdout.match(/Warnings found:\s*(\d+)/);
  const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0;
  const warnings = warnMatch ? parseInt(warnMatch[1], 10) : 0;

  // Extract individual findings
  const findingLines = (stdout + stderr)
    .split('\n')
    .filter(l =>
      /\[(PHANTOM_REQUIRE|PHANTOM_SKILL|EMPTY_DIR|ENCODING|ARCHIVED_REF|STALE_CATALOG)\]/.test(l)
    )
    .map(l => l.trim());

  const result = {
    status: errors > 0 ? 'FAIL' : 'PASS',
    errors,
    warnings,
    findings: findingLines,
    raw: stdout,
  };
  console.log(JSON.stringify(result, null, 2));
} else {
  // Human-readable passthrough
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

process.exit(exitCode);
