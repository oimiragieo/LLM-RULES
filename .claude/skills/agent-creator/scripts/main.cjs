#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');
const {
  ensureDirectory,
  renderAgentTemplate,
  validateAgentFile,
  REQUIRED_SKILLS_BASE,
  REQUIRED_SKILLS_SEARCH_HEAVY,
} = require('../../../lib/agents/agent-template-contract.cjs');

const TEMPLATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'agent-creator',
  'templates',
  'agent-template.md'
);
const ORCHESTRATOR_REQUIRED_FILES = Object.freeze([
  '.claude/CLAUDE.md',
  '.claude/workflows/core/router-decision.md',
  '.claude/workflows/core/ecosystem-creation-workflow.md',
]);

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
    .replace(/\{\{category\}\}/g, params.category)
    .replace(/\{\{temperature\}\}/g, String(params.temperature))
    .replace(/\{\{tools_csv\}\}/g, params.tools.join(', '))
    .replace(/\{\{skills_csv\}\}/g, params.skills.join(', '))
    .replace(/\{\{skills_yaml\}\}/g, params.skills.map(skill => `  - ${skill}`).join('\n'))
    .replace(/\{\{lastVerifiedAt\}\}/g, params.lastVerifiedAt);
}

function ensureContractSkills(skills) {
  return Array.from(
    new Set([
      ...skills,
      ...REQUIRED_SKILLS_BASE,
      // Generated agents always include the search protocol and token-saver section,
      // so they must satisfy the search-heavy contract requirements up front.
      ...REQUIRED_SKILLS_SEARCH_HEAVY,
    ])
  );
}

function buildParams(options) {
  const name = String(options.name || '').trim();
  if (!name) throw new Error('Missing required --name');
  const description = String(options.description || `${name} specialist agent`).trim();
  const model = String(options.model || 'sonnet').trim();
  const category = String(options.category || 'domain').trim();
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
          'task-management-protocol,ripgrep,code-semantic-search,context-compressor,token-saver-context-compression,verification-before-completion,memory-search'
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
    category,
    temperature,
    tools,
    skills: ensureContractSkills(skills),
    lastVerifiedAt: new Date().toISOString(),
  };
}

function getOutputPath(name, category = 'domain') {
  return path.join(PROJECT_ROOT, '.claude', 'agents', category, `${name}.md`);
}

function _findModuleExportInsertionPoint(content) {
  const exportMatch = content.match(/\r?\n\r?\nmodule\.exports\s*=\s*\{/);
  if (!exportMatch) return -1;
  return exportMatch.index;
}

function updateRoutingTableKeywords(name, description) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-keywords-data.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  // Simple heuristic: extract keywords from name and description
  const keywords = Array.from(
    new Set([name, ...name.split('-'), ...(description.toLowerCase().match(/\b\w{4,}\b/g) || [])])
  ).slice(0, 10);

  const formattedKeywords = keywords.map(keyword => `    '${keyword}'`).join(',\n');
  const entry = `  '${name}': [\n${formattedKeywords},\n  ],`;

  const searchStr = '\n};\n\n// Deliberate overlaps';
  const insertionPoint = content.indexOf(searchStr);
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + '\n' + entry + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    throw new Error(`Unable to locate INTENT_KEYWORDS insertion point in ${filePath}`);
  }
}

function updateRoutingTableAgents(name) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-agents.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const entry = `  '${name}': '${name}',`;
  const searchStr = '\n};\n\nmodule.exports = { INTENT_TO_AGENT };';
  const insertionPoint = content.indexOf(searchStr);
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + '\n' + entry + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    throw new Error(`Unable to locate INTENT_TO_AGENT insertion point in ${filePath}`);
  }
}

function updateClaudeMdRouting(name, category, _description) {
  const claudeMdPath = path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return;
  let content = fs.readFileSync(claudeMdPath, 'utf8');
  if (content.includes(`\`${name}\``)) return;

  const entry = `| ${name
    .split('-')
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join(' ')} | \`${name}\` | \`.claude/agents/${category}/${name}.md\` |`;
  const tableHeader = '## 3) AGENT ROUTING TABLE';
  const tableEnd = '### Creator Skills';

  const startIdx = content.indexOf(tableHeader);
  const endIdx = content.indexOf(tableEnd, startIdx);

  if (startIdx !== -1 && endIdx !== -1) {
    const tablePart = content.slice(startIdx, endIdx);
    const lines = tablePart.split('\n');
    const lastRowIdx = lines.findLastIndex(l => l.trim().startsWith('|'));
    if (lastRowIdx !== -1) {
      lines.splice(lastRowIdx + 1, 0, entry);
      const updatedTable = lines.join('\n');
      content = content.slice(0, startIdx) + updatedTable + content.slice(endIdx);
      fs.writeFileSync(claudeMdPath, content, 'utf8');
    }
  }
}

function regenerateAgentRegistry() {
  const scriptPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'cli',
    'generate-agent-registry.cjs'
  );
  const { spawnSync } = require('node:child_process');
  spawnSync('node', [scriptPath], { windowsHide: true });
}

function updateLearnings(name, type) {
  const learningsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
  if (!fs.existsSync(learningsPath)) return;
  const entry = `\n- Created new ${type}: ${name} (${new Date().toISOString().split('T')[0]})\n`;
  fs.appendFileSync(learningsPath, entry, 'utf8');
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

  // POST-CREATION INTEGRATION (Phase 4.3 Hardening)
  try {
    updateClaudeMdRouting(params.name, category, params.description);
    updateRoutingTableKeywords(params.name, params.description);
    updateRoutingTableAgents(params.name);
    regenerateAgentRegistry();
    updateLearnings(params.name, 'agent');
  } catch (err) {
    console.error(`Warning: Post-creation integration partial: ${err.message}`);
  }

  const validation = validateAgentFile(outputPath, { requireMarker: true });
  if (!validation.valid) {
    throw new Error(`Generated agent failed contract: ${validation.errors.join('; ')}`);
  }

  return {
    ok: true,
    action: 'generate',
    outputPath,
    params,
    orchestratorIntegration:
      category === 'orchestrators'
        ? {
            requiredFiles: ORCHESTRATOR_REQUIRED_FILES,
            note: 'Orchestrator creation requires synchronized routing/workflow documentation updates.',
          }
        : null,
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
