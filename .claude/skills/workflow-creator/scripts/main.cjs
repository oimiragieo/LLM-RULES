#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const WORKFLOWS_DIR = path.join(CLAUDE_DIR, 'workflows');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function updateRoutingTableKeywords(name, description) {
  const filePath = path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'routing-table-intent-keywords.cjs');
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const keywords = Array.from(new Set([
    name,
    ...name.split('-'),
    'workflow',
    'phased',
    ...description.toLowerCase().match(/\b\w{4,}\b/g) || []
  ])).slice(0, 10);

  const entry = `  '${name}': ${JSON.stringify(keywords, null, 2).replace(/\]/g, '],')},`;
  const insertionPoint = content.lastIndexOf('};');
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function updateRoutingTableAgents(name) {
  const filePath = path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'routing-table-intent-agents.cjs');
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const entry = `  '${name}': 'master-orchestrator',`; // Default orchestrator for workflows
  const insertionPoint = content.lastIndexOf('};');
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function updateClaudeMdWorkflows(name, category, description) {
  const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return;
  let content = fs.readFileSync(claudeMdPath, 'utf8');
  if (content.includes(name)) return;

  const entry = `\n### ${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join(' ')}\n\n**Path:** \`.claude/workflows/${category}/${name}.md\`\n\n**When to use:** ${description}\n`;
  const sectionHeader = '## 8.6 ENTERPRISE WORKFLOWS';
  const idx = content.indexOf(sectionHeader);
  if (idx !== -1) {
    const nextHeader = content.indexOf('##', idx + 1);
    if (nextHeader !== -1) {
      content = content.slice(0, nextHeader) + entry + '\n' + content.slice(nextHeader);
    } else {
      content += entry;
    }
    fs.writeFileSync(claudeMdPath, content, 'utf8');
  }
}

function createWorkflow(options) {
  const name = String(options.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const category = String(options.category || 'enterprise').trim();
  const description = String(options.description || 'Multi-agent workflow').trim();
  const agents = String(options.agents || '').split(',').map(a => a.trim()).filter(Boolean);

  const categoryDir = path.join(WORKFLOWS_DIR, category);
  const workflowPath = path.join(categoryDir, `${name}.md`);
  
  if (fs.existsSync(workflowPath)) {
    return { ok: true, status: 'exists', path: workflowPath };
  }

  const content = `---
name: ${name}
description: ${description}
version: 1.0.0
verified: true
lastVerifiedAt: ${new Date().toISOString()}
agents:
${agents.map(a => `  - ${a}`).join('\n')}
tags: [workflow]
---

# ${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join(' ')}

${description}

## Phases

1. **Phase 1** - Description here
`;

  if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
  fs.writeFileSync(workflowPath, content, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    updateClaudeMdWorkflows(name, category, description);
    updateRoutingTableKeywords(name, description);
    updateRoutingTableAgents(name); // Workflows map to orchestrators
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(learningsPath, `\n- Created new workflow: ${category}/${name} (${new Date().toISOString().split('T')[0]})\n`, 'utf8');
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: workflowPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log('Workflow Creator CLI\nUsage: --name <name> --category <cat> --description <desc> [--agents <agent1,agent2>]');
    return;
  }

  const result = createWorkflow(options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
