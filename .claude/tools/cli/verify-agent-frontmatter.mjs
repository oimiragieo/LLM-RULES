#!/usr/bin/env node
/**
 * Verify agent frontmatter: no BOM, name is first key.
 * Scans .claude/agents/ (all .md under core, domain, etc.) and exits 1 if any file fails.
 * Usage: node .claude/tools/cli/verify-agent-frontmatter.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function* walkMd(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) yield* walkMd(full);
    else if (name.endsWith('.md')) yield full;
  }
}

let failed = 0;
for (const file of walkMd(AGENTS_DIR)) {
  const buf = fs.readFileSync(file);
  const hasBOM = buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
  const content = buf.toString('utf8');
  const lines = content.split(/\r?\n/);
  const firstLine = (lines[0] || '').trim();
  const secondLine = (lines[1] || '').trim();
  const nameFirst = secondLine.startsWith('name:');
  const hasFrontmatter = firstLine === '---';

  if (hasBOM || !nameFirst || !hasFrontmatter) {
    console.error(
      `FAIL: ${path.relative(PROJECT_ROOT, file)} hasBOM=${hasBOM} nameFirst=${nameFirst} hasFrontmatter=${hasFrontmatter}`
    );
    failed++;
  }
}

if (failed > 0) {
  console.error(`verify-agent-frontmatter: ${failed} agent(s) failed.`);
  process.exit(1);
}
console.log('verify-agent-frontmatter: all agents have name-first frontmatter and no BOM.');
