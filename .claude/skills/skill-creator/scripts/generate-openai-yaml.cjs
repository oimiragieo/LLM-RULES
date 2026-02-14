#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function titleizeSkillName(skillName) {
  return String(skillName)
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveShortDescription(description) {
  const normalized = normalizeWhitespace(description);
  if (!normalized) return 'Helps execute this skill reliably across agent workflows.';
  if (normalized.length >= 25 && normalized.length <= 64) return normalized;
  if (normalized.length > 64) {
    const clipped = normalized.slice(0, 64);
    const wordSafe = clipped.includes(' ') ? clipped.slice(0, clipped.lastIndexOf(' ')) : clipped;
    return wordSafe.length >= 25 ? wordSafe : clipped;
  }

  const suffix = ' for agent workflows';
  const padded = `${normalized}${suffix}`.slice(0, 64);
  if (padded.length >= 25) return padded;
  return 'Reliable skill execution for agent workflows.';
}

function extractMcpDependencies(content) {
  const servers = new Set();
  const mcpPattern = /\bmcp__([a-zA-Z0-9_-]+)__/g;
  for (const match of content.matchAll(mcpPattern)) {
    servers.add(match[1]);
  }

  return Array.from(servers)
    .sort()
    .map(server => ({ type: 'mcp', value: server }));
}

function buildOpenAiYaml(skillName, skillDescription, rawSkillContent) {
  const displayName = titleizeSkillName(skillName);
  const shortDescription = deriveShortDescription(skillDescription);
  const defaultPrompt = `Use the $${skillName} skill to complete this task safely and efficiently.`;
  const dependencies = extractMcpDependencies(rawSkillContent);

  const doc = {
    interface: {
      display_name: displayName,
      short_description: shortDescription,
      default_prompt: defaultPrompt,
    },
  };

  if (dependencies.length > 0) {
    doc.dependencies = {
      tools: dependencies,
    };
  }

  return doc;
}

function generateForSkill(skillDir, options = {}) {
  const skillName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return { status: 'skip', reason: 'missing SKILL.md', skillName };
  }

  const rawSkill = fs.readFileSync(skillMdPath, 'utf8');
  const frontmatter = parseFrontmatter(rawSkill);
  if (!frontmatter || !frontmatter.name || !frontmatter.description) {
    return { status: 'error', reason: 'invalid frontmatter', skillName };
  }

  const agentsDir = path.join(skillDir, 'agents');
  const openAiPath = path.join(agentsDir, 'openai.yaml');
  if (fs.existsSync(openAiPath) && !options.overwrite) {
    return { status: 'skip', reason: 'already exists', skillName };
  }

  fs.mkdirSync(agentsDir, { recursive: true });
  const doc = buildOpenAiYaml(frontmatter.name, frontmatter.description, rawSkill);
  const serialized = yaml.dump(doc, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });

  const tmpPath = `${openAiPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${os.hostname()}`;
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  fs.renameSync(tmpPath, openAiPath);

  return { status: 'ok', skillName, path: openAiPath };
}

function parseArgs(argv) {
  const options = {
    all: false,
    overwrite: false,
    skill: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    if (arg === '--overwrite') options.overwrite = true;
    if (arg === '--skill') {
      options.skill = argv[i + 1] || null;
      i++;
    }
  }

  return options;
}

function runCli() {
  const root = findProjectRoot();
  const skillsDir = path.join(root, '.claude', 'skills');
  const options = parseArgs(process.argv.slice(2));

  const targets = [];
  if (options.skill) {
    targets.push(path.join(skillsDir, options.skill));
  } else if (options.all) {
    const dirs = fs
      .readdirSync(skillsDir)
      .filter(name => {
        const fullPath = path.join(skillsDir, name);
        if (!fs.statSync(fullPath).isDirectory()) return false;
        if (name.startsWith('_')) return false;
        return true;
      })
      .sort();
    for (const dir of dirs) {
      targets.push(path.join(skillsDir, dir));
    }
  } else {
    console.error(
      'Usage: node generate-openai-yaml.cjs --skill <name> [--overwrite] | --all [--overwrite]'
    );
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  for (const skillDir of targets) {
    const result = generateForSkill(skillDir, options);
    if (result.status === 'ok') {
      created++;
      console.log(`created ${result.skillName}`);
      continue;
    }
    if (result.status === 'skip') {
      skipped++;
      console.log(`skipped ${result.skillName}: ${result.reason}`);
      continue;
    }
    errors++;
    console.error(`error ${result.skillName}: ${result.reason}`);
  }

  console.log(`summary created=${created} skipped=${skipped} errors=${errors}`);
  process.exit(errors === 0 ? 0 : 1);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  parseFrontmatter,
  titleizeSkillName,
  deriveShortDescription,
  extractMcpDependencies,
  buildOpenAiYaml,
  generateForSkill,
  parseArgs,
};
