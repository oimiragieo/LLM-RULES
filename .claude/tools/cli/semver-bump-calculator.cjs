#!/usr/bin/env node
'use strict';
/**
 * CLI Tool for computing semantic version bumps
 * Usage:
 *   node semver-bump-calculator.cjs --old <old_file> --new <new_file> --type <agent|skill|schema>
 *   node semver-bump-calculator.cjs diff --from 1.0.0 --to 1.1.0
 */
const fs = require('fs');
const { computeSemverBump, computeSemverDiff } = require('../../lib/artifacts/semver-diff.cjs');

function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'diff') {
    const fromIdx = args.indexOf('--from');
    const toIdx = args.indexOf('--to');
    if (fromIdx < 0 || toIdx < 0) {
      console.error('Usage: diff --from <version> --to <version>');
      process.exit(1);
    }
    const diff = computeSemverDiff(args[fromIdx + 1], args[toIdx + 1]);
    console.log(JSON.stringify(diff, null, 2));
    process.exit(0);
  }

  const oldIdx = args.indexOf('--old');
  const newIdx = args.indexOf('--new');
  const typeIdx = args.indexOf('--type');

  if (oldIdx < 0 || newIdx < 0) {
    console.error('Usage: --old <file> --new <file> [--type <agent|skill|schema>]');
    process.exit(1);
  }

  const oldFile = args[oldIdx + 1];
  const newFile = args[newIdx + 1];
  const type = typeIdx >= 0 ? args[typeIdx + 1] : 'agent';

  if (!fs.existsSync(oldFile) || !fs.existsSync(newFile)) {
    console.error('Files do not exist');
    process.exit(1);
  }

  const oldContent = fs.readFileSync(oldFile, 'utf8');
  const newContent = fs.readFileSync(newFile, 'utf8');

  const bump = computeSemverBump(oldContent, newContent, type);
  console.log(bump);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
