#!/usr/bin/env node
'use strict';

const {
  fs,
  path,
  findProjectRoot,
  parseOptions,
  runNodeScript,
  formatDirectory,
  loadSchemaValidator,
} = require('./create-utils.cjs');
const templates = require('./create-templates.cjs');
const { createActions } = require('./create-actions.cjs');

const PROJECT_ROOT = findProjectRoot(__dirname);
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const TOOLS_DIR = path.join(CLAUDE_DIR, 'tools');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const STRUCTURE_PATH = path.join(
  CLAUDE_DIR,
  'skills',
  'skill-creator',
  'references',
  'skill-structure.md'
);
const LEGACY_SCRIPT = path.join(__dirname, 'create.legacy.cjs.bak');

const validateData = loadSchemaValidator();
const args = process.argv.slice(2);
const options = parseOptions(args);
const actions = createActions({
  fs,
  path,
  PROJECT_ROOT,
  CLAUDE_DIR,
  SKILLS_DIR,
  AGENTS_DIR,
  TOOLS_DIR,
  SETTINGS_PATH,
  STRUCTURE_PATH,
  formatDirectory,
  validateData,
  templates,
});

function shouldFallbackToLegacy(opts) {
  const legacyFlags = [
    'analyze',
    'recommend',
    'merge',
    'update',
    'install',
    'convert-codebase',
    'convert-rule',
    'convert-rules',
    'original-request',
    'test',
    'create-tool',
    'no-tool',
    'register-hooks',
    'register-schemas',
  ];

  if (opts.name && fs.existsSync(LEGACY_SCRIPT)) {
    const unsupportedForRefactor = legacyFlags.some(flag => Object.hasOwn(opts, flag));
    if (
      unsupportedForRefactor &&
      !(opts['register-hooks'] && !opts.name) &&
      !(opts['register-schemas'] && !opts.name)
    ) {
      return true;
    }
  }

  return false;
}

try {
  if (options.help) {
    console.log(templates.generateHelpText());
    process.exit(0);
  }

  if (options['show-structure']) {
    actions.showStructure();
    process.exit(0);
  }

  if (shouldFallbackToLegacy(options)) {
    runNodeScript(LEGACY_SCRIPT, args, PROJECT_ROOT);
  }

  if (options.list) {
    actions.listSkills();
    process.exit(0);
  }

  if (options.validate) {
    const valid = actions.validateSkill(options.validate);
    process.exit(valid ? 0 : 1);
  }

  if (options.assign && options.agent) {
    const ok = actions.assignSkillToAgent(options.assign, options.agent);
    process.exit(ok ? 0 : 1);
  }

  if (options['register-hooks'] && !options.name) {
    const skillName = options['register-hooks'];
    actions.registerHooks(skillName);
    process.exit(0);
  }

  if (options['register-schemas'] && !options.name) {
    const skillName = options['register-schemas'];
    actions.registerSchemas(skillName);
    process.exit(0);
  }

  if (options.name) {
    const result = actions.createSkill({
      name: options.name,
      description: options.description,
      tools: options.tools,
      args: options.args,
      refs: options.refs,
      hooks: options.hooks,
      schemas: options.schemas,
      registerHooks: options['register-hooks'],
      registerSchemas: options['register-schemas'],
      enterprise: options.enterprise,
      noEnterprise: options['no-enterprise'],
      rules: options.rules,
      commands: options.commands,
      templates: options.templates,
      noWorkflow: options['no-workflow'],
      noVerify: options['no-verify'],
      noTool: options['no-tool'],
      createTool: options['create-tool'],
      agents: options.agents,
      category: options.category,
      tags: options.tags,
    });
    if (result && result.ok) {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }

  if (fs.existsSync(LEGACY_SCRIPT)) {
    runNodeScript(LEGACY_SCRIPT, args, PROJECT_ROOT);
  }

  console.error('No action specified. Use --help for usage information.');
  process.exit(1);
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
