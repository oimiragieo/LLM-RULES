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
const TEMPLATES_DIR = path.join(CLAUDE_DIR, 'templates');

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

function updateTemplateCatalog(name, category, purpose) {
  const catalogPath = path.join(
    CLAUDE_DIR,
    'context',
    'artifacts',
    'catalogs',
    'template-catalog.md'
  );
  if (!fs.existsSync(catalogPath)) return;
  const content = fs.readFileSync(catalogPath, 'utf8');
  if (content.includes(name)) return;

  const entry = `\n### ${name}.md\n\n| Field | Value |\n| --- | --- |\n| **Path** | \`.claude/templates/${category}/${name}.md\` |\n| **Category** | ${category.charAt(0).toUpperCase() + category.slice(1)} Templates |\n| **Status** | active |\n\n**Purpose:** ${purpose}\n`;
  fs.appendFileSync(catalogPath, entry, 'utf8');
}

function updateTemplatesReadme(name, category, useCase) {
  const readmePath = path.join(TEMPLATES_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) return;
  const content = fs.readFileSync(readmePath, 'utf8');
  if (content.includes(name)) return;

  const entry = `\n- \`${category}/${name}.md\`: ${useCase}\n`;
  fs.appendFileSync(readmePath, entry, 'utf8');
}

function createTemplate(options) {
  const name = String(options.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const category = String(options.category || 'general').trim();
  const content = String(options.content || '# Template').trim();
  const purpose = String(options.purpose || 'Standardized pattern').trim();

  const categoryDir = path.join(TEMPLATES_DIR, category);
  const templatePath = path.join(categoryDir, `${name}.md`);

  if (fs.existsSync(templatePath)) {
    return { ok: true, status: 'exists', path: templatePath };
  }

  if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
  fs.writeFileSync(templatePath, content, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    updateTemplateCatalog(name, category, purpose);
    updateTemplatesReadme(name, category, purpose);
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Created new template: ${category}/${name} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: templatePath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log(
      'Template Creator CLI\nUsage: --name <name> --category <cat> --content <content> [--purpose <purpose>]'
    );
    return;
  }

  const result = createTemplate(options);
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
