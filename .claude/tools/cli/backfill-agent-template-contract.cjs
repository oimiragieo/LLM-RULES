#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  CONTRACT_MARKER,
  REQUIRED_SKILLS_BASE,
  REQUIRED_SKILLS_SEARCH_HEAVY,
  TOKEN_SAVER_SKILL,
  isSearchHeavyAgent,
  scanAgentFiles,
} = require('../../lib/agents/agent-template-contract.cjs');

const TOKEN_SAVER_SECTION = `## Token Saver Invocation Rule

Use \`Skill({ skill: '${TOKEN_SAVER_SKILL}' })\` only when context pressure is high and normal search+read would over-expand tokens.

Invoke token-saver when ANY of these conditions hold:
- You need to synthesize across many search hits (typically 10+ candidates).
- Retrieved snippets/logs are too large to keep directly in working context.
- You are preparing evidence-heavy handoff/review output and need compact grounding.

Do NOT invoke token-saver for normal small tasks (few files, short snippets); use regular hybrid search + direct reads instead.
`;

function parseArgs(argv) {
  const options = {
    apply: false,
    agentsRoot: path.join(PROJECT_ROOT, '.claude', 'agents'),
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--apply') options.apply = true;
    else if (token === '--agents-root' && argv[i + 1]) {
      options.agentsRoot = path.resolve(argv[++i]);
    }
  }
  return options;
}

function splitFrontmatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return {
    yamlText: match[1],
    body: match[2] || '',
  };
}

function injectMarker(body) {
  const trimmed = String(body || '').replace(/^\n+/, '');
  return `${CONTRACT_MARKER}\n\n${trimmed}`;
}

function ensureTokenSaverRule(body) {
  const source = String(body || '');
  if (source.includes('## Token Saver Invocation Rule')) return source;

  const memoryHeading = /^## Memory Protocol\b/m;
  if (memoryHeading.test(source)) {
    return source.replace(memoryHeading, `${TOKEN_SAVER_SECTION}\n$&`);
  }

  const trimmed = source.replace(/\s+$/, '');
  if (!trimmed) return `${TOKEN_SAVER_SECTION}\n`;
  return `${trimmed}\n\n${TOKEN_SAVER_SECTION}\n`;
}

function upsertSkills(frontmatter, fullContent) {
  const currentSkills = Array.isArray(frontmatter.skills)
    ? frontmatter.skills.map(skill => String(skill).trim()).filter(Boolean)
    : [];
  const nextSkills = [...currentSkills];

  for (const skill of REQUIRED_SKILLS_BASE) {
    if (!nextSkills.includes(skill)) nextSkills.push(skill);
  }

  if (isSearchHeavyAgent(fullContent, frontmatter)) {
    for (const skill of REQUIRED_SKILLS_SEARCH_HEAVY) {
      if (!nextSkills.includes(skill)) nextSkills.push(skill);
    }
  }

  frontmatter.skills = nextSkills;
}

function rewriteFileContent(content) {
  const parts = splitFrontmatter(content);
  if (!parts) {
    return {
      changed: false,
      skipped: true,
      reason: 'missing frontmatter',
      content: String(content || ''),
    };
  }

  let frontmatter;
  try {
    frontmatter = yaml.load(parts.yamlText) || {};
  } catch {
    return {
      changed: false,
      skipped: true,
      reason: 'invalid frontmatter yaml',
      content: String(content || ''),
    };
  }

  if (!frontmatter || typeof frontmatter !== 'object') {
    return {
      changed: false,
      skipped: true,
      reason: 'invalid frontmatter object',
      content: String(content || ''),
    };
  }

  const original = String(content || '');
  upsertSkills(frontmatter, original);

  let body = parts.body;
  if (!original.includes(CONTRACT_MARKER)) {
    body = injectMarker(body);
  }
  body = ensureTokenSaverRule(body);

  const nextYaml = yaml.dump(frontmatter, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const nextContent = `---\n${nextYaml.trimEnd()}\n---\n\n${String(body).replace(/^\n+/, '')}`;
  return {
    changed: nextContent !== original,
    skipped: false,
    content: nextContent,
  };
}

function main(rawOptions = null) {
  const options = rawOptions || parseArgs(process.argv.slice(2));
  const files = scanAgentFiles(options.agentsRoot);
  const changedFiles = [];
  const skippedFiles = [];

  for (const file of files) {
    const current = fs.readFileSync(file, 'utf8');
    const result = rewriteFileContent(current);
    if (result.skipped) {
      skippedFiles.push({ file, reason: result.reason });
      continue;
    }
    if (!result.changed) continue;
    changedFiles.push(file);
    if (options.apply) {
      fs.writeFileSync(file, result.content, 'utf8');
    }
  }

  const summary = {
    ok: true,
    mode: options.apply ? 'apply' : 'dry-run',
    scanned: files.length,
    changed: changedFiles.length,
    skipped: skippedFiles.length,
    changedFiles: changedFiles.map(file => path.relative(PROJECT_ROOT, file).replace(/\\/g, '/')),
    skippedFiles: skippedFiles.map(item => ({
      file: path.relative(PROJECT_ROOT, item.file).replace(/\\/g, '/'),
      reason: item.reason,
    })),
  };

  if (require.main === module) {
    console.log(JSON.stringify(summary, null, 2));
  }
  return summary;
}

const wrappedMain = wrapCLITool(main, 'backfill-agent-template-contract');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  splitFrontmatter,
  ensureTokenSaverRule,
  rewriteFileContent,
  main,
};
