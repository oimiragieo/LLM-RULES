'use strict';
/* eslint-disable max-lines */

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
  const REGISTRATION_TARGETS = {
    claudeMd: path.join(CLAUDE_DIR, 'CLAUDE.md'),
    skillCatalog: path.join(CLAUDE_DIR, 'context', 'artifacts', 'catalogs', 'skill-catalog.md'),
    routingKeywords: path.join(CLAUDE_DIR, 'lib', 'routing', 'routing-table-intent-keywords.cjs'),
    routingAgents: path.join(CLAUDE_DIR, 'lib', 'routing', 'routing-table-intent-agents.cjs'),
    skillIndex: path.join(CLAUDE_DIR, 'config', 'skill-index.json'),
  };
  const SKILL_INDEX_SCRIPT_PATH = path.join(CLAUDE_DIR, 'tools', 'cli', 'generate-skill-index.cjs');

  function preValidateSkill(config) {
    const errors = [];
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      errors.push(`Missing required project file: ${claudeMdPath}`);
    }
    if (config.name && !/^[a-z][a-z0-9-]*$/.test(config.name)) {
      errors.push('Invalid skill name format. Must be lowercase-with-hyphens.');
    }
    if (config.description && config.description.length < CONTENT_MINIMUMS.descriptionMinLength) {
      errors.push(
        `Description must be at least ${CONTENT_MINIMUMS.descriptionMinLength} characters`
      );
    }
    if (config.name) {
      const skillPath = path.join(SKILLS_DIR, config.name);
      if (fs.existsSync(skillPath)) {
        errors.push(`Skill "${config.name}" already exists at ${skillPath}`);
      }
    }
    if (errors.length > 0) {
      throw createActionableError({
        artifactType: 'skill',
        stage: 'preflight',
        reason: errors.join(' | '),
        remediation:
          'Fix the reported project or input issues, then rerun the creator with a unique kebab-case name and a full description.',
      });
    }
  }

  function createActionableError({
    artifactType = 'artifact',
    stage,
    step,
    reason,
    remediation,
    artifactPath,
    result,
  }) {
    const detail = [
      `${artifactType} creation failed during ${stage}${step ? ` (${step})` : ''}.`,
      `What failed: ${reason}`,
      artifactPath ? `Where: ${artifactPath}` : null,
      `Remediation: ${remediation}`,
    ]
      .filter(Boolean)
      .join(' ');

    const error = new Error(detail);
    error.stage = stage;
    if (step) error.step = step;
    if (artifactPath) error.artifactPath = artifactPath;
    if (result) error.result = result;
    return error;
  }

  function snapshotPath(filePath) {
    if (!filePath) return null;
    return {
      filePath,
      existed: fs.existsSync(filePath),
      content: fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null,
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.filePath) return;
    if (snapshot.existed) {
      fs.mkdirSync(path.dirname(snapshot.filePath), { recursive: true });
      fs.writeFileSync(snapshot.filePath, snapshot.content, 'utf8');
      return;
    }
    if (fs.existsSync(snapshot.filePath)) {
      fs.rmSync(snapshot.filePath, { force: true });
    }
  }

  function cleanupCreatedPath(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  function createRegistrationStepSuccess(target, message, updated = true) {
    return {
      status: 'success',
      target,
      updated,
      message,
    };
  }

  function _createRegistrationStepSkipped(target, message) {
    return {
      status: 'skipped',
      target,
      updated: false,
      message,
    };
  }

  function runRegistrationStep(stepName, target, remediation, work) {
    try {
      const result = work();
      if (result && result.status) {
        return result;
      }
      return createRegistrationStepSuccess(target, `${stepName} completed.`);
    } catch (error) {
      return {
        status: 'failed',
        target,
        updated: false,
        message: error && error.message ? error.message : String(error),
        remediation,
      };
    }
  }

  function rollbackCreatedArtifacts(createdPaths = []) {
    for (const targetPath of [...createdPaths].reverse()) {
      cleanupCreatedPath(targetPath);
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
    return null;
  }

  function createWorkflow(name) {
    const workflowsDir = path.join(CLAUDE_DIR, 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const workflowPath = path.join(workflowsDir, `${name}-skill-workflow.md`);
    fs.writeFileSync(workflowPath, templates.generateWorkflowExample(name));
    return workflowPath;
  }

  function runRegistrationSteps({ name, description, tools }) {
    const steps = {
      claudeMd: runRegistrationStep(
        'CLAUDE.md registration',
        REGISTRATION_TARGETS.claudeMd,
        'Restore the framework-context anchor line in .claude/CLAUDE.md, or register the new skill manually in the skills list before rerunning the creator.',
        () => updateClaudeMdSkills(name)
      ),
      skillCatalog: runRegistrationStep(
        'skill catalog registration',
        REGISTRATION_TARGETS.skillCatalog,
        'Restore the `## Specialized Patterns` table structure in the skill catalog, or insert the new catalog row manually before rerunning the creator.',
        () => updateSkillCatalog(name, description, tools)
      ),
      routingKeywords: runRegistrationStep(
        'routing keyword registration',
        REGISTRATION_TARGETS.routingKeywords,
        'Restore the keyword routing table export structure so a new keyword entry can be inserted, or add the skill keywords manually before rerunning the creator.',
        () => updateRoutingTableKeywords(name, description)
      ),
      routingAgents: runRegistrationStep(
        'routing agent registration',
        REGISTRATION_TARGETS.routingAgents,
        'Restore/update .claude/lib/routing/routing-table-intent-agents.cjs so the INTENT_TO_AGENT export block exists, or register the skill agent mapping manually before rerunning the creator.',
        () => updateRoutingTableAgents(name)
      ),
      skillIndex: runRegistrationStep(
        'skill index regeneration',
        REGISTRATION_TARGETS.skillIndex,
        'Ensure .claude/tools/cli/generate-skill-index.cjs exists and exits cleanly, or regenerate .claude/config/skill-index.json manually before rerunning the creator.',
        () => regenerateSkillIndex()
      ),
    };

    const failedSteps = Object.entries(steps)
      .filter(([, step]) => step.status === 'failed')
      .map(([stepName]) => stepName);

    return {
      ok: failedSteps.length === 0,
      failedSteps,
      steps,
    };
  }

  function createSkill(config) {
    const { name, description, tools, refs, hooks, schemas } = config;
    if (!name) {
      throw createActionableError({
        artifactType: 'skill',
        stage: 'input-validation',
        reason: 'Skill name is required (--name).',
        remediation: 'Provide --name <skill-name> when running the creator.',
      });
    }
    if (!description) {
      throw createActionableError({
        artifactType: 'skill',
        stage: 'input-validation',
        reason: 'Skill description is required (--description).',
        remediation:
          'Provide --description "<summary>" with at least 20 characters when running the creator.',
      });
    }

    preValidateSkill(config);

    // Pre-write manifest validation: verify parent directories and critical framework files exist
    const manifestChecks = [
      { path: SKILLS_DIR, label: 'skills directory' },
      { path: path.join(CLAUDE_DIR, 'CLAUDE.md'), label: 'CLAUDE.md' },
    ];
    for (const check of manifestChecks) {
      if (!fs.existsSync(check.path)) {
        throw createActionableError({
          artifactType: 'skill',
          stage: 'preflight',
          reason: `Pre-write manifest check failed — ${check.label} not found at ${check.path}`,
          remediation:
            'Restore the missing framework file or directory before rerunning the creator.',
          artifactPath: check.path,
        });
      }
    }

    const enterpriseEnabled = config.enterprise === true;
    const flags = {
      refs: !!(refs || enterpriseEnabled),
      hooks: !!(hooks || enterpriseEnabled),
      schemas: !!(schemas || enterpriseEnabled),
      templates: !!(config.templates || enterpriseEnabled),
      rules: !!(config.rules || enterpriseEnabled),
      commands: !!(config.commands || enterpriseEnabled),
    };

    const skillDir = path.join(SKILLS_DIR, name);
    const skillFilePath = path.join(skillDir, 'SKILL.md');
    const createdPaths = [];

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      createdPaths.push(skillDir);

      fs.writeFileSync(skillFilePath, templates.generateSkillContent(config));

      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(
        path.join(scriptsDir, 'main.cjs'),
        templates.generateScriptContent(name, description)
      );

      writeEnterpriseDirs(skillDir, name, description, flags);
      formatDirectory(skillDir, PROJECT_ROOT);

      if (enterpriseEnabled && !config.noWorkflow) {
        createdPaths.push(createWorkflow(name));
      }

      const toolDir = maybeCreateCompanionTool(config, enterpriseEnabled, skillDir);
      if (toolDir) {
        createdPaths.push(toolDir);
        console.log(`Companion tool created at ${toolDir}`);
      }

      if (!config.noVerify) {
        const validation = validateSkillContent(skillFilePath);
        if (!validation.valid) {
          rollbackCreatedArtifacts(createdPaths);
          throw createActionableError({
            artifactType: 'skill',
            stage: 'post-create-validation',
            reason: validation.warnings.join(' | ') || 'Generated skill content failed validation.',
            remediation:
              'Update the generated SKILL.md so it includes all required sections and minimum content, then rerun the creator.',
            artifactPath: skillFilePath,
            result: {
              ok: false,
              artifact: { type: 'skill', name, path: skillFilePath },
              validation,
            },
          });
        }
      }

      const registrationSnapshots = Object.fromEntries(
        Object.entries(REGISTRATION_TARGETS).map(([key, targetPath]) => [
          key,
          snapshotPath(targetPath),
        ])
      );
      const registration = runRegistrationSteps({ name, description, tools });

      const result = {
        ok: registration.ok,
        artifact: {
          type: 'skill',
          name,
          path: skillFilePath,
          directory: skillDir,
        },
        enterpriseEnabled,
        registration,
      };

      if (!registration.ok) {
        Object.values(registrationSnapshots).forEach(restoreSnapshot);
        rollbackCreatedArtifacts(createdPaths);

        const failedStep = registration.failedSteps[0];
        const failedDetails = registration.steps[failedStep];
        throw createActionableError({
          artifactType: 'skill',
          stage: 'registration',
          step: failedStep,
          reason: failedDetails.message,
          remediation:
            failedDetails.remediation ||
            'Resolve the reported registration issue, then rerun the creator.',
          artifactPath: skillFilePath,
          result,
        });
      }

      return result;
    } catch (error) {
      if (!error.result) {
        rollbackCreatedArtifacts(createdPaths);
      }
      if (error && error.message) {
        throw error;
      }
      throw createActionableError({
        artifactType: 'skill',
        stage: 'write',
        reason: String(error),
        remediation: 'Check filesystem permissions and target paths, then rerun the creator.',
        artifactPath: skillFilePath,
      });
    }
  }

  function updateRoutingTableKeywords(name, description) {
    const filePath = REGISTRATION_TARGETS.routingKeywords;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Routing keyword table not found at ${filePath}`);
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`'${name}':`)) {
      return createRegistrationStepSuccess(filePath, 'Routing keywords already registered.', false);
    }

    const keywords = Array.from(
      new Set([name, ...name.split('-'), ...(description.toLowerCase().match(/\b\w{4,}\b/g) || [])])
    ).slice(0, 10);

    const entry = `  '${name}': ${JSON.stringify(keywords, null, 2).replace(/\]/g, '],')},`;
    const insertionPoint = content.lastIndexOf('};');
    if (insertionPoint === -1) {
      throw new Error(`Unable to locate INTENT_KEYWORDS insertion point in ${filePath}`);
    }
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
    return createRegistrationStepSuccess(
      filePath,
      'Registered routing keywords for the new skill.'
    );
  }

  function updateRoutingTableAgents(name) {
    const filePath = REGISTRATION_TARGETS.routingAgents;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Routing agent table not found at ${filePath}`);
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`'${name}':`)) {
      return createRegistrationStepSuccess(
        filePath,
        'Routing agent mapping already registered.',
        false
      );
    }

    const entry = `  '${name}': '${name}',`;
    const exportPattern = /};\s*module\.exports = { INTENT_TO_AGENT };/;
    if (!exportPattern.test(content)) {
      throw new Error(`Unable to locate INTENT_TO_AGENT insertion point in ${filePath}`);
    }
    content = content.replace(
      exportPattern,
      `${entry}\n};\n\nmodule.exports = { INTENT_TO_AGENT };`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    return createRegistrationStepSuccess(
      filePath,
      'Registered routing agent mapping for the new skill.'
    );
  }

  function usesCatalogDrivenSkillDiscovery(content) {
    return /@SKILL_CATALOG_TABLE\.md/.test(content) && /Discovery:\s*read catalog/i.test(content);
  }

  function updateClaudeMdSkills(name) {
    const claudeMdPath = REGISTRATION_TARGETS.claudeMd;
    if (!fs.existsSync(claudeMdPath)) {
      throw new Error(`CLAUDE.md not found at ${claudeMdPath}`);
    }
    let content = fs.readFileSync(claudeMdPath, 'utf8');
    if (content.includes(`\`${name}\``)) {
      return createRegistrationStepSuccess(
        claudeMdPath,
        'CLAUDE.md already references the skill.',
        false
      );
    }

    if (usesCatalogDrivenSkillDiscovery(content)) {
      return createRegistrationStepSuccess(
        claudeMdPath,
        'CLAUDE.md already delegates skill discovery to @SKILL_CATALOG_TABLE.md.',
        false
      );
    }

    const insertionPoint = content.indexOf('- `framework-context`');
    if (insertionPoint === -1) {
      throw new Error(`Unable to locate skills insertion anchor in ${claudeMdPath}`);
    }
    content = content.slice(0, insertionPoint) + `- \`${name}\`\n` + content.slice(insertionPoint);
    fs.writeFileSync(claudeMdPath, content, 'utf8');
    return createRegistrationStepSuccess(claudeMdPath, 'Registered the new skill in CLAUDE.md.');
  }

  function updateSkillCatalog(name, description, tools) {
    const catalogPath = REGISTRATION_TARGETS.skillCatalog;
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Skill catalog not found at ${catalogPath}`);
    }
    let content = fs.readFileSync(catalogPath, 'utf8');
    if (content.includes(`\`${name}\``)) {
      return createRegistrationStepSuccess(
        catalogPath,
        'Skill catalog already includes the new skill.',
        false
      );
    }

    if (/Generated from skill-index\.json/i.test(content)) {
      return createRegistrationStepSuccess(
        catalogPath,
        'Skill catalog is generated from skill-index.json; regeneration is handled separately.',
        false
      );
    }

    const entry = `| \`${name}\` | ${description} | ${tools || 'Read'} |`;
    const section = '## Specialized Patterns';
    const idx = content.indexOf(section);
    if (idx === -1) {
      throw new Error(`Unable to locate skill catalog section "${section}" in ${catalogPath}`);
    }
    const nextSection = content.indexOf('\n---', idx);
    const tableEnd = content.lastIndexOf('|', nextSection !== -1 ? nextSection : undefined);
    if (tableEnd === -1) {
      throw new Error(`Unable to locate catalog table insertion point in ${catalogPath}`);
    }
    content = content.slice(0, tableEnd + 1) + `\n${entry}` + content.slice(tableEnd + 1);
    fs.writeFileSync(catalogPath, content, 'utf8');
    return createRegistrationStepSuccess(
      catalogPath,
      'Inserted the new skill into the skill catalog.'
    );
  }

  function regenerateSkillIndex() {
    const scriptPath = SKILL_INDEX_SCRIPT_PATH;
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Skill index generator not found at ${scriptPath}`);
    }
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [scriptPath], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      const stdout = (result.stdout || '').trim();
      throw new Error(
        `Skill index generation failed with exit code ${result.status}: ${stderr || stdout || 'no output'}`
      );
    }
    return createRegistrationStepSuccess(
      REGISTRATION_TARGETS.skillIndex,
      'Regenerated .claude/config/skill-index.json.'
    );
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
          path.join(CLAUDE_DIR, 'schemas', 'skill-output.schema.json')
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
