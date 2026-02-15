#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(ROOT, '.claude', 'workflows');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');

const errors = [];

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
      continue;
    }
    if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function toRel(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function isIgnoredFile(relPath) {
  return relPath.includes('/_archive/');
}

function isPlaceholderReference(ref) {
  return (
    ref.includes('...') ||
    ref.includes('*') ||
    ref.includes('<') ||
    ref.includes('>') ||
    ref.includes('{') ||
    ref.includes('}') ||
    ref.includes('[') ||
    ref.includes(']')
  );
}

function fileExists(ref) {
  const normalized = ref.replaceAll('/', path.sep);
  return fs.existsSync(path.join(ROOT, normalized));
}

function checkConcreteReferences(filePath, text) {
  const rel = toRel(filePath);
  const refRe =
    /\.claude\/(agents\/[A-Za-z0-9_./-]+\.md|workflows\/[A-Za-z0-9_./-]+\.md|skills\/[A-Za-z0-9_./-]+\/SKILL\.md)/g;
  for (const match of text.matchAll(refRe)) {
    const ref = `.claude/${match[1]}`;
    if (isPlaceholderReference(ref)) continue;
    if (!fileExists(ref)) {
      errors.push(`${rel}: missing referenced artifact ${ref}`);
    }
  }
}

function checkDeprecatedAliases(filePath, text) {
  const rel = toRel(filePath);
  const aliasChecks = [
    { pattern: /\bgo-pro\b/g, message: 'deprecated alias "go-pro" (use "golang-pro")' },
    {
      pattern: /agents\/domain\/go-pro\.md/g,
      message: 'deprecated path ".claude/agents/domain/go-pro.md" (use golang-pro.md)',
    },
    {
      pattern: /skills\/progressive-disclosure\/SKILL\.md/g,
      message:
        'deprecated skill path ".claude/skills/progressive-disclosure/SKILL.md" (use context-compressor)',
    },
  ];
  for (const check of aliasChecks) {
    if (check.pattern.test(text)) {
      errors.push(`${rel}: ${check.message}`);
    }
  }
}

const files = [
  ...walk(WORKFLOWS_DIR, p => p.endsWith('.md')),
  ...walk(SKILLS_DIR, p => p.endsWith('SKILL.md')),
]
  .map(p => p.replaceAll('\\', '/'))
  .filter(p => !isIgnoredFile(p));

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  checkConcreteReferences(file, text);
  checkDeprecatedAliases(file, text);
}

if (errors.length > 0) {
  console.error('workflow/skill contract validator: FAIL');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`workflow/skill contract validator: PASS (${files.length} files scanned)`);
