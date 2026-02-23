#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../lib/utils/project-root.cjs');

const PROJECT_ROOT = findProjectRoot(__dirname);
const CLAUDE_MD_PATH = path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listAgentFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '_archive') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listAgentFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { fm: '', tools: [] };
  const fm = match[1];

  const inlineArray = fm.match(/(?:^|\n)tools:\s*\[([\s\S]*?)\]/);
  if (inlineArray) {
    const tools = inlineArray[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return { fm, tools };
  }

  const toolsMatch = fm.match(/(?:^|\n)tools:\n((?:\s*-\s.*(?:\n|$))+)/);
  if (!toolsMatch) return { fm, tools: [] };
  const tools = toolsMatch[1]
    .split('\n')
    .map(line => line.match(/^\s*-\s*(.+?)\s*$/))
    .filter(Boolean)
    .map(m => m[1].trim());
  return { fm, tools };
}

function extractSection8(text) {
  const start = text.search(/^##\s*8\)/m);
  if (start === -1) return '';
  const rest = text.slice(start);
  const nextHeaderOffset = rest.slice(1).search(/^##\s*\d+\)/m);
  const nextHeader = nextHeaderOffset === -1 ? -1 : nextHeaderOffset + 1;
  if (nextHeader === -1) return rest;
  return rest.slice(0, nextHeader);
}

function hasMemoryRecordInstruction(body) {
  const hasMemoryRecord = /MemoryRecord/i.test(body);
  const hasStructuredHint =
    /(structured memory|patterns\.json|gotchas\.json|memory updates|memory record)/i.test(body);
  return hasMemoryRecord && hasStructuredHint;
}

function main() {
  const failures = [];
  const requiredAgents = new Set([
    'developer',
    'qa',
    'planner',
    'architect',
    'technical-writer',
    'code-reviewer',
    'devops',
    'code-simplifier',
    'security-architect',
    'database-architect',
    'devops-troubleshooter',
    'incident-responder',
    'reflection-agent',
  ]);

  const claudeMd = readText(CLAUDE_MD_PATH);
  const section8 = extractSection8(claudeMd);
  if (!section8) {
    failures.push(`${CLAUDE_MD_PATH}: missing section 8`);
  } else {
    if (!/MemoryRecord/i.test(section8)) {
      failures.push(`${CLAUDE_MD_PATH}: section 8 missing 'MemoryRecord' requirement`);
    }
    if (
      !/(do not|forbid|blocked|block).*?(patterns\.json|gotchas\.json)|MemoryRecord.*?(patterns\.json|gotchas\.json)/i.test(
        section8
      )
    ) {
      failures.push(
        `${CLAUDE_MD_PATH}: section 8 missing structured-memory guard wording for patterns/gotchas`
      );
    }
  }

  const agentFiles = listAgentFiles(AGENTS_DIR);
  for (const file of agentFiles) {
    const text = readText(file);
    const { tools } = parseFrontmatter(text);
    const hasWriteOrEdit = tools.includes('Write') || tools.includes('Edit');
    const hasMemoryRecord = tools.includes('MemoryRecord');
    const basename = path.basename(file, '.md');
    if (!requiredAgents.has(basename)) continue;

    if (hasWriteOrEdit && !hasMemoryRecord) {
      failures.push(`${file}: has Write/Edit but missing MemoryRecord in tools`);
    }
    if (hasMemoryRecord && !hasMemoryRecordInstruction(text)) {
      failures.push(`${file}: has MemoryRecord but missing structured-memory instruction in body`);
    }
  }

  if (failures.length > 0) {
    console.error('validate-agent-memory: FAIL');
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }

  console.log('validate-agent-memory: PASS');
}

if (require.main === module) {
  main();
}
