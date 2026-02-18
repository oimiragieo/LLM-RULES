#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TESTS_DIR = path.join(ROOT, 'tests');
const BASELINE_MAX = Number.parseInt(process.env.ARCHIVED_TESTS_MAX || '114', 10);

function walk(dir, results = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch (_err) {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch (_err) {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, results);
      continue;
    }
    if (entry.endsWith('.archived')) {
      results.push(path.relative(ROOT, full));
    }
  }
  return results;
}

const archived = walk(TESTS_DIR);
if (archived.length > BASELINE_MAX) {
  process.stderr.write(
    [
      `Archived test count regression: ${archived.length} > ${BASELINE_MAX}.`,
      'Do not add new *.archived files; restore or remove tests instead.',
      `Sample: ${archived.slice(0, 10).join(', ')}`,
    ].join('\n') + '\n'
  );
  process.exit(1);
}

process.stdout.write(
  `Archived test count OK: ${archived.length} (baseline max: ${BASELINE_MAX})\n`
);
