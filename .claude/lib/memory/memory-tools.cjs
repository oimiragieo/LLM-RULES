'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const MEMORY_FILES = Object.freeze({
  decisions: 'decisions.md',
  issues: 'issues.md',
  learnings: 'learnings.md',
  patterns: 'patterns.json',
  gotchas: 'gotchas.json',
});

function resolveMemoryFile(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const filename = MEMORY_FILES[key] || (key ? `${key}.md` : 'memory.md');
  return {
    file: filename,
    path: path.join(MEMORY_DIR, filename),
  };
}

function readTextSafe(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch (_err) {
    return '';
  }
}

function listMemoryPaths() {
  return [...new Set(Object.values(MEMORY_FILES))].map(file => path.join(MEMORY_DIR, file));
}

function memoryGrep(pattern, { maxResults = 20, caseSensitive = false } = {}) {
  const needle = String(pattern || '');
  if (!needle) return [];

  const comparator = caseSensitive ? needle : needle.toLowerCase();
  const results = [];

  for (const filePath of listMemoryPaths()) {
    const content = readTextSafe(filePath);
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const haystack = caseSensitive ? lines[index] : lines[index].toLowerCase();
      if (!haystack.includes(comparator)) continue;
      results.push({
        file: path.basename(filePath),
        line: index + 1,
        text: lines[index],
      });
      if (results.length >= maxResults) {
        return results;
      }
    }
  }

  return results;
}

function extractMarkdownSections(content) {
  const sections = [];
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      sections.push(match[1].trim());
    }
  }
  return sections;
}

function memoryDescribe(name) {
  const resolved = resolveMemoryFile(name);
  const content = readTextSafe(resolved.path);

  if (!content) {
    return {
      file: resolved.file,
      path: resolved.path,
      exists: false,
      size: 0,
      lineCount: 0,
      sections: [],
    };
  }

  return {
    file: resolved.file,
    path: resolved.path,
    exists: true,
    size: Buffer.byteLength(content, 'utf8'),
    lineCount: content.split(/\r?\n/).length,
    sections: resolved.file.endsWith('.md') ? extractMarkdownSections(content) : [],
  };
}

function memoryExpand(name, heading) {
  const resolved = resolveMemoryFile(name);
  const content = readTextSafe(resolved.path);
  const target = String(heading || '')
    .trim()
    .toLowerCase();

  if (!content || !resolved.file.endsWith('.md') || !target) {
    return { found: false, file: resolved.file, heading: String(heading || ''), content: '' };
  }

  const lines = content.split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+(.+)$/);
    if (match && match[2].trim().toLowerCase() === target) {
      start = index;
      break;
    }
  }

  if (start === -1) {
    return { found: false, file: resolved.file, heading: String(heading || ''), content: '' };
  }

  const collected = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (/^#{1,6}\s+/.test(lines[index])) break;
    collected.push(lines[index]);
  }

  return {
    found: true,
    file: resolved.file,
    heading: String(heading || ''),
    content: collected.join('\n').trim(),
  };
}

module.exports = {
  MEMORY_DIR,
  memoryGrep,
  memoryDescribe,
  memoryExpand,
};
