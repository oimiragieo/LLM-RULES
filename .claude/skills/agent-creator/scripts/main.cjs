#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');
const {
  ensureDirectory,
  renderAgentTemplate,
  validateAgentFile,
} = require('../../../lib/agents/agent-template-contract.cjs');

const TEMPLATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'agent-creator',
  'templates',
  'agent-template.md'
);

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

function toTitleCase(name) {
  return String(name || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function loadTemplate() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Agent template missing: ${TEMPLATE_PATH}`);
  }
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function renderFromFileTemplate(template, params) {
  return template
    .replace(/\{\{name\}\}/g, params.name)
    .replace(/\{\{title\}\}/g, params.title)
    .replace(/\{\{description\}\}/g, params.description)
    .replace(/\{\{model\}\}/g, params.model)
    .replace(/\{\{temperature\}\}/g, String(params.temperature))
    .replace(/\{\{tools_csv\}\}/g, params.tools.join(', '))
    .replace(/\{\{skills_yaml\}\}/g, params.skills.map(skill => `  - ${skill}`).join('\n'));
}

function buildParams(options) {
  const name = String(options.name || '').trim();
  if (!name) throw new Error('Missing required --name');
  const description = String(options.description || `${name} specialist agent`).trim();
  const model = String(options.model || 'sonnet').trim();
  const temperature = Number.isFinite(Number(options.temperature))
    ? Number(options.temperature)
    : 0.3;
  const tools = String(
    options.tools || 'Read,Write,Edit,Glob,Grep,Bash,TaskUpdate,TaskList,TaskCreate,TaskGet,Skill'
  )
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const skills = Array.from(
    new Set(
      String(
        options.skills ||
          'task-management-protocol,ripgrep,code-semantic-search,token-saver-context-compression,verification-before-completion'
      )
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
    )
  );

  return {
    name,
    title: toTitleCase(name),
    description,
    model,
    temperature,
    tools,
    skills,
  };
}

function getOutputPath(name, category = 'domain') {
  return path.join(PROJECT_ROOT, '.claude', 'agents', category, `${name}.md`);
}

function generateAgent(options) {
  const params = buildParams(options);
  const template = loadTemplate();
  const rendered = renderFromFileTemplate(template, params);
  const fallback = renderAgentTemplate(params);
  const content = rendered.includes('{{') ? fallback : rendered;
  const category = String(options.category || 'domain').trim();
  const outputPath = options.output
    ? path.resolve(PROJECT_ROOT, String(options.output))
    : getOutputPath(params.name, category);

  ensureDirectory(path.dirname(outputPath));
  fs.writeFileSync(outputPath, content, 'utf8');

  const validation = validateAgentFile(outputPath, { requireMarker: true });
  if (!validation.valid) {
    throw new Error(`Generated agent failed contract: ${validation.errors.join('; ')}`);
  }

  return {
    ok: true,
    action: 'generate',
    outputPath,
    params,
  };
}

function validateAgent(options) {
  const target = options.file
    ? path.resolve(PROJECT_ROOT, String(options.file))
    : options.name
      ? getOutputPath(String(options.name), String(options.category || 'domain'))
      : null;
  if (!target) throw new Error('Provide --file or --name for validate action');
  const validation = validateAgentFile(target, { requireMarker: true });
  return {
    ok: validation.valid,
    action: 'validate',
    file: target,
    errors: validation.errors,
    warnings: validation.warnings,
    metadata: validation.metadata,
  };
}

function main(rawOptions = null) {
  const options = rawOptions || parseArgs(process.argv.slice(2));
  const inferredAction = options.generate ? 'generate' : options.validate ? 'validate' : '';
  const action =
    String(options.action || options.mode || inferredAction)
      .trim()
      .toLowerCase() || 'help';
  if (options.help || action === 'help') {
    return {
      ok: true,
      help: true,
      usage:
        'node main.cjs --action generate --name <agent-name> --description "<text>" [--category domain|specialized|core]\n' +
        'node main.cjs --action validate --file .claude/agents/domain/<agent>.md',
    };
  }
  if (action === 'generate') return generateAgent(options);
  if (action === 'validate') return validateAgent(options);
  throw new Error(`Unknown action: ${action}`);
}

if (require.main === module) {
  try {
    const result = main();
    if (result.help) {
      console.log(result.usage);
      process.exit(0);
    }
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  toTitleCase,
  renderFromFileTemplate,
  buildParams,
  generateAgent,
  validateAgent,
  main,
};
