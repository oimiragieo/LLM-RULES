#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function collectActiveHookBasenames(settingsPath) {
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const basenames = new Set();
  const hookConfig = parsed?.hooks || {};

  for (const eventEntries of Object.values(hookConfig)) {
    if (!Array.isArray(eventEntries)) continue;
    for (const entry of eventEntries) {
      const hooks = entry?.hooks;
      if (!Array.isArray(hooks)) continue;
      for (const hook of hooks) {
        const command = String(hook?.command || '');
        if (!command) continue;
        const match = command.match(/([A-Za-z0-9._-]+\.cjs)\b/);
        if (!match) continue;
        basenames.add(match[1]);
      }
    }
  }

  return Array.from(basenames).sort();
}

function findMissingHooks(activeHookBasenames, docsText, exclusions = []) {
  const excluded = new Set((exclusions || []).map(String));
  return activeHookBasenames
    .filter(name => !excluded.has(name))
    .filter(name => !docsText.includes(name))
    .sort();
}

function extractActiveSectionHookNames(docsText) {
  const marker = 'Active settings-registered hooks now explicitly include:';
  const start = docsText.indexOf(marker);
  if (start === -1) return [];
  const after = docsText.slice(start + marker.length);
  const nextHeading = after.search(/\n##\s+/);
  const section = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
  const matches = section.match(/\b([A-Za-z0-9._-]+\.cjs)\b/g) || [];
  return Array.from(new Set(matches)).sort();
}

function findStaleHooksInActiveSection(activeHookBasenames, docsText, exclusions = []) {
  const excluded = new Set((exclusions || []).map(String));
  const active = new Set((activeHookBasenames || []).map(String));
  const listed = extractActiveSectionHookNames(docsText);
  return listed.filter(name => !excluded.has(name) && !active.has(name)).sort();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    settingsPath: path.join(PROJECT_ROOT, '.claude', 'settings.json'),
    docsPaths: [
      path.join(PROJECT_ROOT, '.claude', 'docs', 'HOOKS_REFERENCE.md'),
      path.join(PROJECT_ROOT, '.claude', 'docs', '@HOOK_AGENT_MAP.md'),
    ],
    exclusions: [],
    strict: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--settings' && args[i + 1]) {
      opts.settingsPath = path.resolve(args[++i]);
    } else if (arg === '--docs' && args[i + 1]) {
      opts.docsPaths = args[++i].split(',').map(p => path.resolve(p.trim()));
    } else if (arg === '--exclude' && args[i + 1]) {
      opts.exclusions = args[++i]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (arg === '--strict') {
      opts.strict = true;
    } else if (arg === '--json') {
      opts.json = true;
    }
  }
  return opts;
}

function readDocsText(docPaths) {
  return docPaths
    .map(docPath => {
      try {
        return fs.readFileSync(docPath, 'utf8');
      } catch (_err) {
        return '';
      }
    })
    .join('\n');
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const active = collectActiveHookBasenames(opts.settingsPath);
  const docsText = readDocsText(opts.docsPaths);
  const missing = findMissingHooks(active, docsText, opts.exclusions);
  const stale = findStaleHooksInActiveSection(active, docsText, opts.exclusions);
  const result = {
    settingsPath: path.relative(PROJECT_ROOT, opts.settingsPath),
    docsPaths: opts.docsPaths.map(p => path.relative(PROJECT_ROOT, p)),
    activeCount: active.length,
    missingCount: missing.length,
    missing,
    staleCount: stale.length,
    stale,
    strict: opts.strict,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (missing.length === 0 && stale.length === 0) {
    process.stdout.write('hooks-doc-sync: PASS\n');
  } else {
    process.stdout.write(
      `hooks-doc-sync: ${opts.strict ? 'FAIL' : 'WARN'} (${missing.length} missing, ${stale.length} stale)\n`
    );
    for (const name of missing) {
      process.stdout.write(` - ${name}\n`);
    }
    for (const name of stale) {
      process.stdout.write(` - stale: ${name}\n`);
    }
  }

  if (opts.strict && (missing.length > 0 || stale.length > 0)) {
    process.exitCode = 1;
  }

  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  collectActiveHookBasenames,
  findMissingHooks,
  extractActiveSectionHookNames,
  findStaleHooksInActiveSection,
  parseArgs,
  readDocsText,
  main,
};
