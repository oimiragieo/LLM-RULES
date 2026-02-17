'use strict';

function createActions(ctx) {
  const {
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
  } = ctx;

  const CONTENT_MINIMUMS = {
    totalLines: 50,
    requiredSections: ['identity', 'capabilities', 'instructions', 'Memory Protocol'],
    descriptionMinLength: 20,
  };

  function preValidateSkill(config) {
    const errors = [];
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      errors.push('ERROR: Not in a Claude Code project. Missing .claude/CLAUDE.md');
    }
    if (config.name && !/^[a-z][a-z0-9-]*$/.test(config.name)) {
      errors.push('ERROR: Invalid skill name format. Must be lowercase-with-hyphens.');
    }
    if (config.description && config.description.length < CONTENT_MINIMUMS.descriptionMinLength) {
      errors.push(
        `ERROR: Description must be at least ${CONTENT_MINIMUMS.descriptionMinLength} characters`
      );
    }
    if (config.name) {
      const skillPath = path.join(SKILLS_DIR, config.name);
      if (fs.existsSync(skillPath)) {
        errors.push(`ERROR: Skill "${config.name}" already exists at ${skillPath}`);
      }
    }
    if (errors.length > 0) {
      errors.forEach(e => console.error(e));
      process.exit(1);
    }
  }

  function validateSkillContent(skillPath) {
    const warnings = [];
    if (!fs.existsSync(skillPath)) {
      return { valid: false, warnings: ['Skill file not found'], lines: 0 };
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const lines = content.split('\n').length;
    if (lines < CONTENT_MINIMUMS.totalLines) {
      warnings.push(
        `Skill has only ${lines} lines (recommended minimum: ${CONTENT_MINIMUMS.totalLines})`
      );
    }
    for (const section of CONTENT_MINIMUMS.requiredSections) {
      const sectionPattern = new RegExp(`(##\\s*${section}|<${section}>)`, 'i');
      if (!sectionPattern.test(content)) warnings.push(`Missing recommended section: ${section}`);
    }
    return { valid: true, warnings, lines };
  }

  function detectComplexity(config) {
    const reasons = [];
    if (config.hooks) reasons.push('hooks');
    if (config.schemas) reasons.push('schemas');
    const toolList = String(config.tools || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    if (toolList.length >= 6) reasons.push('many-tools');
    if (config.args) reasons.push('args');
    if (
      /(orchestrat|pipeline|workflow|integrat|automati)/i.test(String(config.description || ''))
    ) {
      reasons.push('complex-domain');
    }
    return { isComplex: reasons.length >= 2, reasons };
  }

  function writeEnterpriseDirs(skillDir, name, description, flags) {
    if (flags.refs) {
      const refsDir = path.join(skillDir, 'references');
      fs.mkdirSync(refsDir, { recursive: true });
      fs.writeFileSync(path.join(refsDir, '.gitkeep'), '# Reference materials for this skill\n');
      fs.writeFileSync(
        path.join(refsDir, 'research-requirements.md'),
        templates.generateResearchRequirementsContent(name)
      );
    }

    if (flags.hooks) {
      const hooksDir = path.join(skillDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, 'pre-execute.cjs'),
        templates.generatePreHookContent(name, description)
      );
      fs.writeFileSync(
        path.join(hooksDir, 'post-execute.cjs'),
        templates.generatePostHookContent(name, description)
      );
    }

    if (flags.schemas) {
      const schemasDir = path.join(skillDir, 'schemas');
      fs.mkdirSync(schemasDir, { recursive: true });
      fs.writeFileSync(
        path.join(schemasDir, 'input.schema.json'),
        templates.generateInputSchema(name, description)
      );
      fs.writeFileSync(
        path.join(schemasDir, 'output.schema.json'),
        templates.generateOutputSchema(name, description)
      );
    }

    if (flags.templates) {
      const templatesDir = path.join(skillDir, 'templates');
      fs.mkdirSync(templatesDir, { recursive: true });
      fs.writeFileSync(
        path.join(templatesDir, 'implementation-template.md'),
        templates.generateEnterpriseTemplateContent(name)
      );
    }

    if (flags.rules) {
      const rulesDir = path.join(skillDir, 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(rulesDir, `${name}.md`),
        templates.generateEnterpriseRuleContent(name)
      );
    }

    if (flags.commands) {
      const commandsDir = path.join(skillDir, 'commands');
      fs.mkdirSync(commandsDir, { recursive: true });
      fs.writeFileSync(
        path.join(commandsDir, `${name}.md`),
        templates.generateEnterpriseCommandContent(name)
      );
    }
  }

  function createCompanionTool(name, description) {
    const toolDir = path.join(TOOLS_DIR, name);
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(
      path.join(toolDir, `${name}.cjs`),
      templates.generateToolScript(name, description)
    );
    fs.writeFileSync(
      path.join(toolDir, 'README.md'),
      templates.generateToolReadme(name, description)
    );
    return toolDir;
  }

  function maybeCreateCompanionTool(config, enterpriseEnabled, skillDir) {
    if (config.noTool) return null;
    if (config.createTool || enterpriseEnabled) {
      return createCompanionTool(config.name, config.description, skillDir);
    }
    const complexity = detectComplexity(config);
    return complexity.isComplex
      ? createCompanionTool(config.name, config.description, skillDir)
      : null;
  }

  function createWorkflow(name) {
    const workflowsDir = path.join(CLAUDE_DIR, 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const workflowPath = path.join(workflowsDir, `${name}-skill-workflow.md`);
    fs.writeFileSync(workflowPath, templates.generateWorkflowExample(name));
  }

  function createSkill(config) {
    const { name, description, tools, refs, hooks, schemas } = config;
    if (!name) {
      console.error('Skill name is required (--name)');
      process.exit(1);
    }
    if (!description) {
      console.error('Skill description is required (--description)');
      process.exit(1);
    }

    preValidateSkill(config);

    const enterpriseEnabled = config.enterprise !== false && !config.noEnterprise;
    const flags = {
      refs: !!(refs || enterpriseEnabled),
      hooks: !!(hooks || enterpriseEnabled),
      schemas: !!(schemas || enterpriseEnabled),
      templates: !!(config.templates || enterpriseEnabled),
      rules: !!(config.rules || enterpriseEnabled),
      commands: !!(config.commands || enterpriseEnabled),
    };

    const skillDir = path.join(SKILLS_DIR, name);
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), templates.generateSkillContent(config));

    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, 'main.cjs'),
      templates.generateScriptContent(name, description)
    );

    writeEnterpriseDirs(skillDir, name, description, flags);
    formatDirectory(skillDir, PROJECT_ROOT);

    if (!config.noWorkflow) {
      createWorkflow(name);
    }

    const toolDir = maybeCreateCompanionTool(config, enterpriseEnabled, skillDir);

    if (!config.noVerify) {
      const validation = validateSkillContent(path.join(skillDir, 'SKILL.md'));
      if (!validation.valid) {
        console.error('Post-creation validation failed');
        process.exit(1);
      }
    }

    if (toolDir) {
      console.log(`Companion tool created at ${toolDir}`);
    }

    // POST-CREATION INTEGRATION (Phase 4.3 Hardening)
    try {
      updateClaudeMdSkills(name, description);
      updateSkillCatalog(name, description, tools);
      updateRoutingTableKeywords(name, description);
      updateRoutingTableAgents(name);
      regenerateSkillIndex();
    } catch (err) {
      console.error(`Warning: Post-creation integration partial: ${err.message}`);
    }

    void tools;
    return skillDir;
  }

  function updateRoutingTableKeywords(name, description) {
    const filePath = path.join(CLAUDE_DIR, 'lib', 'routing', 'routing-table-intent-keywords.cjs');
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`'${name}':`)) return;

    const keywords = Array.from(new Set([
      name,
      ...name.split('-'),
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
    const filePath = path.join(CLAUDE_DIR, 'lib', 'routing', 'routing-table-intent-agents.cjs');
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`'${name}':`)) return;

    const entry = `  '${name}': '${name}',`;
    const insertionPoint = content.lastIndexOf('};');
    if (insertionPoint !== -1) {
      content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  function updateClaudeMdSkills(name, description) {
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) return;
    let content = fs.readFileSync(claudeMdPath, 'utf8');
    if (content.includes(`\`${name}\``)) return;

    const sectionHeader = '## 8.5 WORKFLOW ENHANCEMENT SKILLS';
    const insertionPoint = content.indexOf('- `framework-context`');
    if (insertionPoint !== -1) {
      content = content.slice(0, insertionPoint) + `- \`${name}\`\n` + content.slice(insertionPoint);
      fs.writeFileSync(claudeMdPath, content, 'utf8');
    }
  }

  function updateSkillCatalog(name, description, tools) {
    const catalogPath = path.join(CLAUDE_DIR, 'context', 'artifacts', 'catalogs', 'skill-catalog.md');
    if (!fs.existsSync(catalogPath)) return;
    let content = fs.readFileSync(catalogPath, 'utf8');
    if (content.includes(`\`${name}\``)) return;

    const entry = `| \`${name}\` | ${description} | ${tools || 'Read'} |`;
    const section = '## Specialized Patterns';
    const idx = content.indexOf(section);
    if (idx !== -1) {
      const nextSection = content.indexOf('\n---', idx);
      const tableEnd = content.lastIndexOf('|', nextSection !== -1 ? nextSection : undefined);
      if (tableEnd !== -1) {
        content = content.slice(0, tableEnd + 1) + `\n${entry}` + content.slice(tableEnd + 1);
        fs.writeFileSync(catalogPath, content, 'utf8');
      }
    }
  }

  function regenerateSkillIndex() {
    const scriptPath = path.join(CLAUDE_DIR, 'tools', 'cli', 'generate-skill-index.cjs');
    const { spawnSync } = require('child_process');
    spawnSync('node', [scriptPath], { windowsHide: true });
  }

  function validateSkill(skillPath) {
    if (!fs.existsSync(skillPath)) {
      console.error(`Skill path not found: ${skillPath}`);
      return false;
    }
    const skillMdPath = fs.statSync(skillPath).isDirectory()
      ? path.join(skillPath, 'SKILL.md')
      : skillPath;
    if (!fs.existsSync(skillMdPath)) {
      console.error('SKILL.md not found');
      return false;
    }

    if (validateData) {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const lines = frontmatterMatch[1].split('\n').filter(Boolean);
        const output = {};
        for (const line of lines) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const key = line.slice(0, idx).trim();
            const value = line
              .slice(idx + 1)
              .trim()
              .replace(/^"|"$/g, '');
            output[key] = value;
          }
        }
        const result = validateData(
          { status: 'success', output },
          path.join(CLAUDE_DIR, 'schemas', 'skill-definition.schema.json')
        );
        if (!result.valid) {
          console.error('Schema validation failed');
          return false;
        }
      }
    }

    return true;
  }

  function listSkills() {
    if (!fs.existsSync(SKILLS_DIR)) {
      console.log('No skills directory found');
      return;
    }
    const skills = fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    skills.forEach(skill => console.log(skill));
  }

  function assignSkillToAgent(skillName, agentName) {
    const categories = ['core', 'specialized', 'domain', 'orchestrators'];
    for (const category of categories) {
      const agentPath = path.join(AGENTS_DIR, category, `${agentName}.md`);
      if (!fs.existsSync(agentPath)) continue;
      const content = fs.readFileSync(agentPath, 'utf8');
      if (content.includes(`- ${skillName}`)) return true;

      if (/skills:\s*\n/.test(content)) {
        const updated = content.replace(/(skills:\s*\n)/, `$1  - ${skillName}\n`);
        fs.writeFileSync(agentPath, updated);
        return true;
      }

      const withSection = `${content.trimEnd()}\n\nskills:\n  - ${skillName}\n`;
      fs.writeFileSync(agentPath, withSection);
      return true;
    }

    console.error(`Agent not found: ${agentName}`);
    return false;
  }

  function registerHooks(skillName) {
    const settings = fs.existsSync(SETTINGS_PATH)
      ? JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
      : {};
    if (!settings.skillHooks) settings.skillHooks = {};
    settings.skillHooks[skillName] = {
      pre: `.claude/skills/${skillName}/hooks/pre-execute.cjs`,
      post: `.claude/skills/${skillName}/hooks/post-execute.cjs`,
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  }

  function registerSchemas(skillName) {
    const globalSchemasDir = path.join(CLAUDE_DIR, 'schemas');
    const skillSchemasDir = path.join(SKILLS_DIR, skillName, 'schemas');
    fs.mkdirSync(globalSchemasDir, { recursive: true });

    const inputSrc = path.join(skillSchemasDir, 'input.schema.json');
    const outputSrc = path.join(skillSchemasDir, 'output.schema.json');

    if (fs.existsSync(inputSrc)) {
      fs.copyFileSync(inputSrc, path.join(globalSchemasDir, `${skillName}.input.schema.json`));
    }
    if (fs.existsSync(outputSrc)) {
      fs.copyFileSync(outputSrc, path.join(globalSchemasDir, `${skillName}.output.schema.json`));
    }
  }

  function showStructure() {
    if (!fs.existsSync(STRUCTURE_PATH)) {
      console.log('Structure documentation not found');
      return;
    }
    process.stdout.write(fs.readFileSync(STRUCTURE_PATH, 'utf8'));
  }

  return {
    createSkill,
    validateSkill,
    listSkills,
    assignSkillToAgent,
    registerHooks,
    registerSchemas,
    showStructure,
  };
}

module.exports = { createActions };
