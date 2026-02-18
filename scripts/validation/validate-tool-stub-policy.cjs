#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TOOLS_ROOT = path.join(PROJECT_ROOT, '.claude', 'tools');
const POLICY_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-stub-policy.json');

const STUB_SIGNATURE =
  /process\.stdout\.write\s*\(\s*JSON\.stringify\s*\(\s*\{\s*ok:\s*true\s*,\s*tool:\s*['"][^'"]+['"]\s*\}\s*\)\s*\+\s*['"]\\n['"]\s*\)\s*;?/ms;

function toPosixRelative(absPath) {
  return path.relative(PROJECT_ROOT, absPath).split(path.sep).join('/');
}

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_archive') continue;
        stack.push(full);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!/\.(cjs|mjs)$/u.test(entry.name)) continue;
      if (/\.test\.(cjs|mjs)$/u.test(entry.name)) continue;
      out.push(full);
    }
  }

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function detectStubFiles() {
  const files = walkFiles(TOOLS_ROOT);
  const stubs = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    if (STUB_SIGNATURE.test(raw)) {
      stubs.push(toPosixRelative(file));
    }
  }
  stubs.sort((a, b) => a.localeCompare(b));
  return stubs;
}

function loadPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(`Missing policy file: ${toPosixRelative(POLICY_PATH)}`);
  }
  const raw = fs.readFileSync(POLICY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const allow = Array.isArray(parsed.allowlistedStubs) ? parsed.allowlistedStubs : [];
  return {
    parsed,
    allowlistedStubs: [...new Set(allow.map(item => String(item)))].sort((a, b) =>
      a.localeCompare(b)
    ),
  };
}

function writePolicyBaseline(stubs) {
  const payload = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    policy: {
      summary:
        'Stub tools are temporarily allowed only when explicitly allowlisted and tracked for remediation.',
      enforcement:
        'Any newly introduced no-op tool stub must be rejected until this policy file is intentionally updated.',
      signature: 'process.stdout.write(JSON.stringify({ ok: true, tool: ... }) + "\\n")',
    },
    allowlistedStubs: stubs,
  };
  fs.writeFileSync(POLICY_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function diffSets(actual, allowlist) {
  const allow = new Set(allowlist);
  const actualSet = new Set(actual);

  const undocumented = actual.filter(file => !allow.has(file));
  const stale = allowlist.filter(file => !actualSet.has(file));

  return { undocumented, stale };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const writeBaseline = args.has('--write-baseline');

  const actualStubs = detectStubFiles();
  if (writeBaseline) {
    writePolicyBaseline(actualStubs);
    process.stdout.write('[validate-tool-stub-policy] baseline updated\n');
    return;
  }

  const { allowlistedStubs } = loadPolicy();
  const { undocumented, stale } = diffSets(actualStubs, allowlistedStubs);

  if (undocumented.length > 0 || stale.length > 0) {
    process.stderr.write('[validate-tool-stub-policy] FAILED\n');
    process.stderr.write(`  detected stubs: ${actualStubs.length}\n`);
    process.stderr.write(`  allowlisted stubs: ${allowlistedStubs.length}\n`);
    if (undocumented.length > 0) {
      process.stderr.write(`  undocumented stubs: ${undocumented.length}\n`);
      for (const rel of undocumented.slice(0, 25)) {
        process.stderr.write(`    + ${rel}\n`);
      }
      if (undocumented.length > 25) {
        process.stderr.write(`    ... and ${undocumented.length - 25} more\n`);
      }
    }
    if (stale.length > 0) {
      process.stderr.write(`  stale allowlist entries: ${stale.length}\n`);
      for (const rel of stale.slice(0, 25)) {
        process.stderr.write(`    - ${rel}\n`);
      }
      if (stale.length > 25) {
        process.stderr.write(`    ... and ${stale.length - 25} more\n`);
      }
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('[validate-tool-stub-policy] OK\n');
}

main();
