#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const DOCS_ROOT = path.join(PROJECT_ROOT, '.claude', 'docs');

const CHECKS = [
  {
    id: 'removed-hook-memory-health-check',
    regex: /memory-health-check\.cjs/gi,
    allow: [
      {
        fileEndsWith: path.join('.claude', 'docs', 'MEMORY_SYSTEM.md'),
        lineRegex: /no standalone `memory-health-check\.cjs` hook registered/i,
      },
    ],
  },
  {
    id: 'removed-hook-format-memory',
    regex: /format-memory\.cjs/gi,
  },
  {
    id: 'removed-hook-planning-progress-tracker',
    regex: /planning-progress-tracker\.cjs/gi,
  },
  {
    id: 'obsolete-memory-prune-threshold',
    regex: /MEMORY_PRUNE_THRESHOLD/gi,
  },
  {
    id: 'obsolete-memory-pruner-module',
    regex: /memory-pruner\.js/gi,
  },
  {
    id: 'obsolete-memory-manager-js-module',
    regex: /memory-manager\.js/gi,
  },
  {
    id: 'obsolete-router-state-hook-path',
    regex: /\.claude\/hooks\/routing\/router-state\.cjs/gi,
  },
  {
    id: 'obsolete-tasklist-tracker-hook',
    regex: /task-list-tracker\.cjs/gi,
  },
  {
    id: 'obsolete-documentation-routing-guard-hook',
    regex: /documentation-routing-guard\.cjs/gi,
  },
  {
    id: 'invalid-reflection-queue-max-lines-5000',
    regex: /\|\s*`REFLECTION_QUEUE_MAX_LINES`\s*\|[^\n]*\|\s*5000\s*\|/gi,
  },
];

function walkMarkdownFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(fullPath);
    }
  }
  return out;
}

function toRel(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function isAllowed(check, filePath, lineText) {
  const allow = check.allow || [];
  const normalized = filePath.replace(/\\/g, '/');
  return allow.some(rule => {
    const suffix = rule.fileEndsWith.replace(/\\/g, '/');
    if (!normalized.endsWith(suffix)) return false;
    if (rule.lineRegex && !rule.lineRegex.test(lineText)) return false;
    return true;
  });
}

function validate() {
  if (!fs.existsSync(DOCS_ROOT)) {
    console.error(`docs root not found: ${DOCS_ROOT}`);
    process.exit(2);
  }

  const files = walkMarkdownFiles(DOCS_ROOT);
  const findings = [];

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      for (const check of CHECKS) {
        check.regex.lastIndex = 0;
        if (!check.regex.test(line)) continue;
        if (isAllowed(check, filePath, line)) continue;
        findings.push({
          checkId: check.id,
          file: toRel(filePath),
          line: idx + 1,
          text: line.trim(),
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log(`docs stale-pattern guard: PASS (${files.length} files scanned)`);
    return;
  }

  console.error(`docs stale-pattern guard: FAIL (${findings.length} issue(s))`);
  for (const f of findings) {
    console.error(`- [${f.checkId}] ${f.file}:${f.line}`);
    console.error(`  ${f.text}`);
  }
  process.exit(2);
}

validate();
