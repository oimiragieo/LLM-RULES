#!/usr/bin/env node
/**
 * Config Validation Script
 *
 * Validates that all referenced files in configuration exist and are valid.
 *
 * Usage:
 *   node scripts/validate-config.mjs [--verbose]
 *
 * Exit codes:
 *   0: All validations passed
 *   1: One or more validations failed
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveConfigPath } from '../../.claude/lib/utils/context-path-resolver.mjs';

// Try to import js-yaml, fail loudly if not available
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  console.error('='.repeat(60));
  console.error('ERROR: js-yaml is required for config validation');
  console.error('='.repeat(60));
  console.error('');
  console.error('The validate-config script requires js-yaml to parse YAML files.');
  console.error('Install it with one of the following commands:');
  console.error('');
  console.error('  pnpm install js-yaml');
  console.error('  npm install js-yaml');
  console.error('  yarn add js-yaml');
  console.error('');
  console.error('Without js-yaml, YAML validation cannot proceed.');
  console.error('='.repeat(60));
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow custom root directory via --root parameter (for testing)
const rootDirArgIndex = process.argv.indexOf('--root');
const rootDir =
  rootDirArgIndex !== -1 && process.argv[rootDirArgIndex + 1]
    ? resolve(process.argv[rootDirArgIndex + 1])
    : resolve(__dirname, '../..');

const verbose = process.argv.includes('--verbose');
const errors = [];
const warnings = [];

// Helper to check if file exists
function checkFile(path, description) {
  const fullPath = resolve(rootDir, path);
  if (!existsSync(fullPath)) {
    errors.push(`Missing ${description}: ${path}`);
    return false;
  }
  if (verbose) {
    console.log(`* Found ${description}: ${path}`);
  }
  return true;
}

// Helper to check if directory exists
function checkDirectory(path, description) {
  const fullPath = resolve(rootDir, path);
  if (!existsSync(fullPath)) {
    errors.push(`Missing ${description}: ${path}`);
    return false;
  }
  try {
    const stat = statSync(fullPath);
    if (!stat.isDirectory()) {
      errors.push(`${description} is not a directory: ${path}`);
      return false;
    }
  } catch (error) {
    errors.push(`Cannot access ${description}: ${path} - ${error.message}`);
    return false;
  }
  if (verbose) {
    console.log(`* Found ${description}: ${path}`);
  }
  return true;
}

// Validate YAML file
function validateYAML(path, description) {
  const fullPath = resolve(rootDir, path);
  if (!existsSync(fullPath)) {
    errors.push(`Missing ${description}: ${path}`);
    return false;
  }

  if (!yaml) {
    // Just check file exists if yaml parser not available
    if (verbose) {
      console.log(`* Found ${description}: ${path} (YAML validation skipped)`);
    }
    return true;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    yaml.load(content);
    if (verbose) {
      console.log(`* Valid YAML ${description}: ${path}`);
    }
    return true;
  } catch (error) {
    errors.push(`Invalid YAML in ${description}: ${path} - ${error.message}`);
    return false;
  }
}

// Validate JSON file
function _validateJSON(path, description) {
  const fullPath = resolve(rootDir, path);
  if (!existsSync(fullPath)) {
    errors.push(`Missing ${description}: ${path}`);
    return false;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    JSON.parse(content);
    if (verbose) {
      console.log(`* Valid JSON ${description}: ${path}`);
    }
    return true;
  } catch (error) {
    errors.push(`Invalid JSON in ${description}: ${path} - ${error.message}`);
    return false;
  }
}

// Main validation function
function validateConfig() {
  console.log('Validating Agent Studio configuration...\n');

  // 1. Check gate script
  console.log('Checking gate script...');
  checkFile('.claude/tools/gates/gate.mjs', 'gate script');

  // 2. Load and validate config.yaml
  console.log('\nValidating config.yaml...');
  const configPath = resolve(rootDir, '.claude/config.yaml');
  if (!existsSync(configPath)) {
    errors.push('Missing config.yaml: .claude/config.yaml');
    return;
  }

  let config;
  try {
    const configContent = readFileSync(configPath, 'utf-8');
    if (yaml) {
      config = yaml.load(configContent);
    } else {
      // Basic parsing without yaml library - just check file exists
      warnings.push(
        'YAML parsing skipped (js-yaml not installed). Install with: npm install js-yaml'
      );
      config = {}; // Empty config, will skip agent/template checks
    }
  } catch (error) {
    if (yaml) {
      errors.push(`Invalid YAML in config.yaml: ${error.message}`);
      return;
    } else {
      warnings.push('Cannot parse config.yaml without js-yaml');
      config = {};
    }
  }

  // 3. Check agent files referenced in config
  console.log('\nChecking agent files...');
  if (config.agents && typeof config.agents === 'object') {
    for (const [agentName, agentConfig] of Object.entries(config.agents)) {
      if (agentConfig && typeof agentConfig === 'object' && agentConfig.path) {
        if (!checkFile(agentConfig.path, `agent file for ${agentName}`)) {
          warnings.push(`Agent ${agentName} referenced in config but file missing`);
        }
      }
    }
  }

  // 4. Check template files
  console.log('\nChecking template files...');
  if (config.templates && config.templates.base_dir) {
    checkDirectory(config.templates.base_dir, 'templates directory');

    if (config.templates.project_brief) {
      checkFile(
        `${config.templates.base_dir}/${config.templates.project_brief}`,
        'project brief template'
      );
    }
    if (config.templates.prd) {
      checkFile(`${config.templates.base_dir}/${config.templates.prd}`, 'PRD template');
    }
    if (config.templates.architecture) {
      checkFile(
        `${config.templates.base_dir}/${config.templates.architecture}`,
        'architecture template'
      );
    }
    if (config.templates.implementation_plan) {
      checkFile(
        `${config.templates.base_dir}/${config.templates.implementation_plan}`,
        'implementation plan template'
      );
    }
    if (config.templates.test_plan) {
      checkFile(`${config.templates.base_dir}/${config.templates.test_plan}`, 'test plan template');
    }
    if (config.templates.ui_spec) {
      checkFile(`${config.templates.base_dir}/${config.templates.ui_spec}`, 'UI spec template');
    }
  }

  // 5. Check schema directory and validate all schema files exist
  console.log('\nChecking schema files...');
  const schemasDir = '.claude/schemas';
  checkDirectory(schemasDir, 'schemas directory');

  // Validate all active schema files in schemas directory exist and are valid JSON
  // Note: 12 schemas archived in 2026-02-07 (see .claude/schemas/_archive/README.md)
  const schemaFiles = [
    'artifact_manifest.schema.json',
    'product_requirements.schema.json',
    'project_brief.schema.json',
    'system_architecture.schema.json',
    'test_plan.schema.json',
    'ux_spec.schema.json',
  ];

  for (const schemaFile of schemaFiles) {
    const schemaPath = `${schemasDir}/${schemaFile}`;
    if (existsSync(resolve(rootDir, schemaPath))) {
      try {
        const schemaContent = readFileSync(resolve(rootDir, schemaPath), 'utf-8');
        JSON.parse(schemaContent); // Validate JSON
        console.log(`  ✓ Schema file valid: ${schemaFile}`);
      } catch (error) {
        errors.push(`Invalid JSON in schema file: ${schemaPath} - ${error.message}`);
      }
    } else {
      warnings.push(`Schema file not found (optional): ${schemaPath}`);
    }
  }

  // 6. Validate workflow files and check referenced schemas
  console.log('\nValidating workflow files...');
  const workflowFiles = [
    '.claude/workflows/enterprise-track.yaml',
    '.claude/workflows/greenfield-fullstack.yaml',
    '.claude/workflows/brownfield-fullstack.yaml',
    '.claude/workflows/quick-flow.yaml',
    '.claude/workflows/code-quality-flow.yaml',
    '.claude/workflows/performance-flow.yaml',
    '.claude/workflows/ai-system-flow.yaml',
    '.claude/workflows/mobile-flow.yaml',
    '.claude/workflows/incident-flow.yaml',
    '.claude/workflows/ui-perfection-loop.yaml',
    '.claude/workflows/bmad-greenfield-standard.yaml',
  ];

  const referencedSchemas = new Set();

  for (const workflowFile of workflowFiles) {
    if (!existsSync(resolve(rootDir, workflowFile))) {
      warnings.push(`Workflow file not found: ${workflowFile}`);
      continue;
    }

    validateYAML(workflowFile, `workflow file ${workflowFile}`);

    // Extract schema references from workflow
    if (yaml) {
      try {
        const workflowContent = readFileSync(resolve(rootDir, workflowFile), 'utf-8');
        const workflow = yaml.load(workflowContent);

        if (workflow.steps && Array.isArray(workflow.steps)) {
          for (const step of workflow.steps) {
            if (step.validation && step.validation.schema) {
              referencedSchemas.add(step.validation.schema);
            }
          }
        }
      } catch (_error) {
        // Already reported as YAML error
      }
    } else {
      // Without yaml parser, try basic regex to find schema references
      try {
        const workflowContent = readFileSync(resolve(rootDir, workflowFile), 'utf-8');
        const schemaMatches = workflowContent.match(/schema:\s*([^\s]+)/g);
        if (schemaMatches) {
          schemaMatches.forEach(match => {
            const schemaPath = match.replace(/schema:\s*/, '').trim();
            referencedSchemas.add(schemaPath);
          });
        }
      } catch (_error) {
        // Skip if can't read
      }
    }
  }

  // 7. Check referenced schema files
  console.log('\nChecking referenced schema files...');
  for (const schemaPath of referencedSchemas) {
    if (!checkFile(schemaPath, `schema file ${schemaPath}`)) {
      errors.push(`Schema file referenced in workflow but missing: ${schemaPath}`);
    }
  }

  // 8. Check agents referenced in workflows
  console.log('\nChecking agents in workflows...');
  const referencedAgents = new Set();

  for (const workflowFile of workflowFiles) {
    if (!existsSync(resolve(rootDir, workflowFile))) {
      continue;
    }

    if (yaml) {
      try {
        const workflowContent = readFileSync(resolve(rootDir, workflowFile), 'utf-8');
        const workflow = yaml.load(workflowContent);

        // Check step-based workflows
        if (workflow.steps && Array.isArray(workflow.steps)) {
          for (const step of workflow.steps) {
            if (step.agent) {
              referencedAgents.add({ agent: step.agent, workflow: workflowFile });
            }
          }
        }

        // Check phase-based workflows (BMad)
        if (workflow.phases && Array.isArray(workflow.phases)) {
          for (const phase of workflow.phases) {
            if (phase.steps && Array.isArray(phase.steps)) {
              for (const step of phase.steps) {
                if (step.agent) {
                  referencedAgents.add({ agent: step.agent, workflow: workflowFile });
                }
              }
            }
            // Check if_yes and if_no steps
            if (phase.decision) {
              if (phase.decision.if_yes && Array.isArray(phase.decision.if_yes)) {
                for (const step of phase.decision.if_yes) {
                  if (step.agent) {
                    referencedAgents.add({ agent: step.agent, workflow: workflowFile });
                  }
                }
              }
              if (phase.decision.if_no && Array.isArray(phase.decision.if_no)) {
                for (const step of phase.decision.if_no) {
                  if (step.agent) {
                    referencedAgents.add({ agent: step.agent, workflow: workflowFile });
                  }
                }
              }
            }
            // Check epic_loop and story_loop
            if (
              phase.epic_loop &&
              phase.epic_loop.story_loop &&
              Array.isArray(phase.epic_loop.story_loop)
            ) {
              for (const step of phase.epic_loop.story_loop) {
                if (step.agent) {
                  referencedAgents.add({ agent: step.agent, workflow: workflowFile });
                }
              }
            }
          }
        }
      } catch (_error) {
        // Already reported as YAML error
      }
    }
  }

  // Validate all referenced agents exist
  for (const { agent, workflow } of referencedAgents) {
    // Check if agent is defined in config.yaml
    const configAgents = config?.agents || {};
    if (configAgents[agent] && configAgents[agent].path) {
      const agentPath = configAgents[agent].path;
      if (!checkFile(agentPath, `agent ${agent} referenced in ${workflow}`)) {
        errors.push(`Missing agent ${agent} referenced in ${workflow}: ${agentPath}`);
      }
    } else {
      // Fallback to direct file check
      const agentFile = `.claude/agents/${agent}.md`;
      if (!checkFile(agentFile, `agent ${agent} referenced in ${workflow}`)) {
        errors.push(`Agent ${agent} referenced in ${workflow} but file missing`);
      }
    }
  }

  // 9. Validate skill structure
  console.log('\nValidating skill structure...');
  const skillsDir = '.claude/skills';
  checkDirectory(skillsDir, 'skills directory');

  // Find all SKILL.md files
  const skillFiles = [];
  try {
    const skillDirs = readdirSync(resolve(rootDir, skillsDir), { withFileTypes: true });
    for (const dirent of skillDirs) {
      if (dirent.isDirectory() && dirent.name !== 'sdk') {
        const skillFile = resolve(rootDir, skillsDir, dirent.name, 'SKILL.md');
        if (existsSync(skillFile)) {
          skillFiles.push({ path: skillFile, name: dirent.name });
        }
      }
    }
  } catch (error) {
    errors.push(`Error reading skills directory: ${error.message}`);
  }

  // Validate each skill file
  for (const { path, name } of skillFiles) {
    try {
      const content = readFileSync(path, 'utf-8');

      // Check for YAML frontmatter (handle both LF and CRLF)
      const normalizedContent = content.replace(/\r\n/g, '\n');
      if (!normalizedContent.startsWith('---\n')) {
        errors.push(`Skill ${name}: Missing YAML frontmatter (must start with ---)`);
        continue;
      }

      // Extract frontmatter
      const frontmatterEnd = normalizedContent.indexOf('\n---\n', 4);
      if (frontmatterEnd === -1) {
        errors.push(`Skill ${name}: Invalid YAML frontmatter (missing closing ---)`);
        continue;
      }

      const frontmatter = normalizedContent.substring(4, frontmatterEnd);

      // Parse YAML frontmatter
      if (yaml) {
        try {
          const parsed = yaml.load(frontmatter);

          // Check required fields (MUST have these)
          const requiredFields = ['name', 'description'];
          for (const field of requiredFields) {
            if (!(field in parsed)) {
              errors.push(`Skill ${name}: Missing required field: ${field}`);
            }
          }

          // Check recommended fields (SHOULD have these - warnings only)
          const recommendedFields = ['tools', 'version'];
          for (const field of recommendedFields) {
            if (!(field in parsed)) {
              warnings.push(`Skill ${name}: Missing recommended field: ${field}`);
            }
          }

          // Validate skill name matches directory name
          if (parsed.name && parsed.name !== name) {
            warnings.push(
              `Skill ${name}: Frontmatter name "${parsed.name}" doesn't match directory name`
            );
          }

          // Validate context:fork field (Phase 2.1.2)
          if (parsed['context:fork'] !== undefined) {
            if (typeof parsed['context:fork'] !== 'boolean') {
              errors.push(
                `Skill ${name}: context:fork must be boolean, got ${typeof parsed['context:fork']}`
              );
            }
          }

          // Validate model field (Phase 2.1.2)
          if (parsed.model !== undefined) {
            const validModels = ['haiku', 'sonnet', 'opus'];
            if (!validModels.includes(parsed.model)) {
              errors.push(
                `Skill ${name}: model must be one of: ${validModels.join(', ')}, got '${parsed.model}'`
              );
            }
          }

          // Check template references if present
          if (parsed.templates && Array.isArray(parsed.templates)) {
            // Templates are just type names, not file paths, so no validation needed
          }

          console.log(`  ✓ Skill validated: ${name}`);
        } catch (yamlError) {
          errors.push(`Skill ${name}: Invalid YAML frontmatter - ${yamlError.message}`);
        }
      } else {
        // Without yaml parser, do basic checks
        const requiredFields = ['name:', 'description:'];
        for (const field of requiredFields) {
          if (!frontmatter.includes(field)) {
            errors.push(`Skill ${name}: Missing required field: ${field.replace(':', '')}`);
          }
        }

        const recommendedFields = ['tools:', 'version:'];
        for (const field of recommendedFields) {
          if (!frontmatter.includes(field)) {
            warnings.push(`Skill ${name}: Missing recommended field: ${field.replace(':', '')}`);
          }
        }
        console.log(`  ⚠️  Skill ${name}: Basic validation (YAML parser not available)`);
      }
    } catch (error) {
      errors.push(`Error reading skill file ${name}: ${error.message}`);
    }
  }

  // 9.5. Validate codex-skills structure
  console.log('\nValidating codex-skills structure...');
  const codexSkillsDir = 'codex-skills';

  if (existsSync(resolve(rootDir, codexSkillsDir))) {
    try {
      const codexSkillDirs = readdirSync(resolve(rootDir, codexSkillsDir), { withFileTypes: true });
      for (const dirent of codexSkillDirs) {
        if (dirent.isDirectory()) {
          const skillFile = resolve(rootDir, codexSkillsDir, dirent.name, 'SKILL.md');
          if (existsSync(skillFile)) {
            const content = readFileSync(skillFile, 'utf-8');
            const normalizedContent = content.replace(/\r\n/g, '\n');

            if (!normalizedContent.startsWith('---\n')) {
              errors.push(
                `Codex Skill ${dirent.name}: Missing YAML frontmatter (must start with ---)`
              );
              continue;
            }

            const frontmatterEnd = normalizedContent.indexOf('\n---\n', 4);
            if (frontmatterEnd === -1) {
              errors.push(
                `Codex Skill ${dirent.name}: Invalid YAML frontmatter (missing closing ---)`
              );
              continue;
            }

            const frontmatter = normalizedContent.substring(4, frontmatterEnd);

            if (yaml) {
              try {
                const parsed = yaml.load(frontmatter);

                // Check required fields (same as Agent Studio skills)
                const requiredFields = ['name', 'description'];
                for (const field of requiredFields) {
                  if (!(field in parsed)) {
                    errors.push(`Codex Skill ${dirent.name}: Missing required field: ${field}`);
                  }
                }

                // Validate skill name matches directory name
                if (parsed.name && parsed.name !== dirent.name) {
                  warnings.push(
                    `Codex Skill ${dirent.name}: Frontmatter name "${parsed.name}" doesn't match directory name`
                  );
                }

                // Validate model field (Phase 2.1.2)
                if (parsed.model !== undefined) {
                  const validModels = ['haiku', 'sonnet', 'opus'];
                  if (!validModels.includes(parsed.model)) {
                    errors.push(
                      `Codex Skill ${dirent.name}: model must be one of: ${validModels.join(', ')}, got '${parsed.model}'`
                    );
                  }
                }

                // Validate context:fork field (Phase 2.1.2)
                if (parsed['context:fork'] !== undefined) {
                  if (typeof parsed['context:fork'] !== 'boolean') {
                    errors.push(
                      `Codex Skill ${dirent.name}: context:fork must be boolean, got ${typeof parsed['context:fork']}`
                    );
                  }
                }

                console.log(`  ✓ Codex Skill validated: ${dirent.name}`);
              } catch (yamlError) {
                errors.push(
                  `Codex Skill ${dirent.name}: Invalid YAML frontmatter - ${yamlError.message}`
                );
              }
            } else {
              // Without yaml parser, do basic checks
              const requiredFields = ['name:', 'description:'];
              for (const field of requiredFields) {
                if (!frontmatter.includes(field)) {
                  errors.push(
                    `Codex Skill ${dirent.name}: Missing required field: ${field.replace(':', '')}`
                  );
                }
              }
              console.log(
                `  ⚠️  Codex Skill ${dirent.name}: Basic validation (YAML parser not available)`
              );
            }
          }
        }
      }
    } catch (error) {
      errors.push(`Error reading codex-skills directory: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  codex-skills directory not found (optional)');
  }

  // 10. Check hook files
  console.log('\nChecking hook files...');
  const hookDir = '.claude/hooks';
  checkDirectory(hookDir, 'hooks directory');

  // Check common hook files (shell scripts, not YAML)
  const commonHooks = [
    'security-pre-tool.sh', // PreToolUse hook
    'audit-post-tool.sh', // PostToolUse hook
    'user-prompt-submit.sh', // UserPromptSubmit hook
    // 'notification.sh' - Optional, not supported by Python SDK (Notification event)
    'stop.sh', // Stop hook
    'orchestrator.mjs', // Orchestrator hook (optional)
  ];

  // Python SDK hook limitations
  const pythonUnsupportedHooks = ['SessionStart', 'SessionEnd', 'Notification'];
  const hookEventMapping = {
    'security-pre-tool.sh': 'PreToolUse',
    'audit-post-tool.sh': 'PostToolUse',
    'user-prompt-submit.sh': 'UserPromptSubmit',
    // 'notification.sh': 'Notification', // Not supported by Python SDK, optional hook
    'stop.sh': 'Stop',
    'orchestrator.mjs': 'SubagentStart', // or other events
  };

  for (const hookFile of commonHooks) {
    const hookPath = `${hookDir}/${hookFile}`;
    if (existsSync(resolve(rootDir, hookPath))) {
      // Shell scripts and JS files don't need YAML validation
      console.log(`  ✓ Hook file found: ${hookFile}`);

      // Check for Python SDK compatibility
      const eventName = hookEventMapping[hookFile];
      if (eventName && pythonUnsupportedHooks.includes(eventName)) {
        warnings.push(
          `Hook ${hookFile} uses event "${eventName}" which is not supported by Python SDK. TypeScript SDK supports all hook events.`
        );
      }
    } else {
      warnings.push(`Hook file not found (optional): ${hookPath}`);
    }
  }

  // Note about hook output format
  console.log('  ℹ️  Hooks must return JSON matching SDK HookJSONOutput structure');
  console.log(
    '  ℹ️  Python SDK limitation: SessionStart, SessionEnd, Notification hooks not supported'
  );

  // 11. Validate template references
  console.log('\nValidating template references...');
  const templatesDir = '.claude/templates';
  checkDirectory(templatesDir, 'templates directory');

  // Find template references in agent files
  const templateReferences = new Set();
  try {
    const agentFiles = readdirSync(resolve(rootDir, '.claude/agents'), { withFileTypes: true });
    for (const dirent of agentFiles) {
      if (dirent.isFile() && dirent.name.endsWith('.md')) {
        const agentPath = resolve(rootDir, '.claude/agents', dirent.name);
        try {
          const content = readFileSync(agentPath, 'utf-8');
          // Look for template references like .claude/templates/xxx.md
          const templateMatches = content.match(/\.claude\/templates\/[a-z0-9-]+\.md/g);
          if (templateMatches) {
            templateMatches.forEach(templateRef => {
              templateReferences.add(templateRef);
            });
          }
        } catch (_error) {
          // Skip if can't read
        }
      }
    }
  } catch (error) {
    warnings.push(`Error scanning agent files for template references: ${error.message}`);
  }

  // Find template references in skill files
  for (const { path: skillPath, _name } of skillFiles) {
    try {
      const content = readFileSync(skillPath, 'utf-8');
      const templateMatches = content.match(/\.claude\/templates\/[a-z0-9-]+\.md/g);
      if (templateMatches) {
        templateMatches.forEach(templateRef => {
          templateReferences.add(templateRef);
        });
      }
    } catch (_error) {
      // Skip if can't read
    }
  }

  // Validate all referenced templates exist
  for (const templateRef of templateReferences) {
    const templatePath = resolve(rootDir, templateRef);
    if (!existsSync(templatePath)) {
      errors.push(`Template file referenced but missing: ${templateRef}`);
    } else if (verbose) {
      console.log(`  ✓ Template reference validated: ${templateRef}`);
    }
  }

  if (templateReferences.size === 0 && verbose) {
    console.log('  ℹ️  No template references found in agent or skill files');
  }

  // 11.5. Validate commands directory
  console.log('\nValidating command files...');
  const commandsDir = '.claude/commands';
  if (checkDirectory(commandsDir, 'commands directory')) {
    try {
      const commandFiles = readdirSync(resolve(rootDir, commandsDir), { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
        .map(dirent => dirent.name);

      if (commandFiles.length === 0) {
        warnings.push('No command files found in .claude/commands');
      } else {
        for (const fileName of commandFiles) {
          const commandPath = resolve(rootDir, commandsDir, fileName);
          const content = readFileSync(commandPath, 'utf-8').trim();
          if (content.length === 0) {
            errors.push(`Command file is empty: ${commandsDir}/${fileName}`);
          }
        }
        console.log(`  ✓ Command files validated: ${commandFiles.length}`);
      }
    } catch (error) {
      errors.push(`Error reading commands directory: ${error.message}`);
    }
  }

  // 12. Validate MCP server configuration
  console.log('\nValidating MCP configuration...');
  const mcpConfigPath = '.claude/.mcp.json';
  let mcpToolSearchEnabled = false;
  if (existsSync(resolve(rootDir, mcpConfigPath))) {
    try {
      const mcpContent = readFileSync(resolve(rootDir, mcpConfigPath), 'utf-8');
      const mcpConfig = JSON.parse(mcpContent);
      mcpToolSearchEnabled = Boolean(mcpConfig?.toolSearch?.enabled);

      // Validate MCP config root structure (Claude Code format)
      if (typeof mcpConfig !== 'object' || mcpConfig === null) {
        errors.push('.mcp.json: Root must be an object');
      } else {
        // Validate top-level structure (betaFeatures, toolSearch, mcpServers, disabledMcpServers)
        const allowedTopLevelKeys = [
          'betaFeatures',
          'toolSearch',
          'mcpServers',
          'disabledMcpServers',
        ];
        const unknownKeys = Object.keys(mcpConfig).filter(
          key => !allowedTopLevelKeys.includes(key)
        );
        if (unknownKeys.length > 0) {
          warnings.push(`.mcp.json: Unknown top-level keys: ${unknownKeys.join(', ')}`);
        }

        // Validate betaFeatures if present
        if (mcpConfig.betaFeatures !== undefined) {
          if (!Array.isArray(mcpConfig.betaFeatures)) {
            errors.push('.mcp.json: betaFeatures must be an array');
          }
        }

        // Validate toolSearch if present
        if (mcpConfig.toolSearch !== undefined) {
          if (typeof mcpConfig.toolSearch !== 'object' || mcpConfig.toolSearch === null) {
            errors.push('.mcp.json: toolSearch must be an object');
          } else {
            if (
              mcpConfig.toolSearch.enabled !== undefined &&
              typeof mcpConfig.toolSearch.enabled !== 'boolean'
            ) {
              errors.push('.mcp.json: toolSearch.enabled must be a boolean');
            }
            if (
              mcpConfig.toolSearch.autoEnableThreshold !== undefined &&
              typeof mcpConfig.toolSearch.autoEnableThreshold !== 'number'
            ) {
              errors.push('.mcp.json: toolSearch.autoEnableThreshold must be a number');
            }
            if (
              mcpConfig.toolSearch.defaultDeferLoading !== undefined &&
              typeof mcpConfig.toolSearch.defaultDeferLoading !== 'boolean'
            ) {
              errors.push('.mcp.json: toolSearch.defaultDeferLoading must be a boolean');
            }
          }
        }

        // Validate mcpServers (the actual server configurations)
        if (mcpConfig.mcpServers !== undefined) {
          if (typeof mcpConfig.mcpServers !== 'object' || mcpConfig.mcpServers === null) {
            errors.push('.mcp.json: mcpServers must be an object');
          } else {
            // Each key in mcpServers is a server name, value is server config
            for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
              if (typeof serverConfig !== 'object' || serverConfig === null) {
                errors.push(`.mcp.json: Server ${serverName} config must be an object`);
                continue;
              }

              // Check server type (stdio, sse, http, or sdk)
              const validTypes = ['stdio', 'sse', 'http', 'sdk'];
              if (serverConfig.type && !validTypes.includes(serverConfig.type)) {
                warnings.push(
                  `.mcp.json: Server ${serverName} has invalid type: ${serverConfig.type}`
                );
              }

              // Validate required fields based on type
              if (serverConfig.type === 'stdio' || !serverConfig.type) {
                // stdio is default, needs command
                if (!serverConfig.command) {
                  warnings.push(
                    `.mcp.json: Server ${serverName} (stdio) missing required field: command`
                  );
                }
              } else if (serverConfig.type === 'sse' || serverConfig.type === 'http') {
                if (!serverConfig.url) {
                  errors.push(
                    `.mcp.json: Server ${serverName} (${serverConfig.type}) missing required field: url`
                  );
                }
              } else if (serverConfig.type === 'sdk') {
                if (!serverConfig.name) {
                  warnings.push(`.mcp.json: Server ${serverName} (sdk) missing name field`);
                }
              }
            }
          }
        }
      }

      console.log('  ✓ .mcp.json validated');
    } catch (error) {
      errors.push(`Invalid JSON in .mcp.json: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  .mcp.json not found (optional)');
  }

  // 12. Validate SDK settings files
  console.log('\nValidating SDK settings files...');

  // Validate settings.json (project settings)
  const settingsPath = '.claude/settings.json';
  if (existsSync(resolve(rootDir, settingsPath))) {
    try {
      const settingsContent = readFileSync(resolve(rootDir, settingsPath), 'utf-8');
      const settings = JSON.parse(settingsContent);

      if (mcpToolSearchEnabled) {
        const routerModel = String(
          settings?.models?.router ?? settings?.session?.default_model ?? ''
        ).trim();
        if (routerModel && routerModel.toLowerCase().includes('haiku')) {
          warnings.push(
            [
              '.mcp.json: toolSearch.enabled is true, but the router/default model is a Haiku variant.',
              'Claude Code disables tool search on models that do not support tool_reference blocks (observed in logs).',
              'Recommendation: set `.claude/settings.json` `models.router` to `claude-sonnet-4-5` (or Opus), or disable toolSearch.',
            ].join(' ')
          );
        }

        if (
          Array.isArray(settings.disallowedTools) &&
          settings.disallowedTools.includes('MCPSearchTool')
        ) {
          warnings.push(
            'settings.json: disallowedTools includes MCPSearchTool, which disables Tool Search even if enabled in .mcp.json.'
          );
        }
      }

      // Validate SDK-compatible structure (camelCase keys)
      const _validKeys = [
        'agents',
        'allowedTools',
        'disallowedTools',
        'mcpServers',
        'hooks',
        'permissionMode',
        'tool_permissions',
        'bash_commands',
        'session',
        'rules',
        'agent_config',
        'extended_thinking',
        '$schema',
        'version',
      ];

      // Check for common SDK settings (optional, but validate structure if present)
      if (settings.agents && typeof settings.agents !== 'object') {
        warnings.push('settings.json: agents should be an object');
      }
      if (settings.allowedTools && !Array.isArray(settings.allowedTools)) {
        warnings.push('settings.json: allowedTools should be an array');
      }
      if (settings.disallowedTools && !Array.isArray(settings.disallowedTools)) {
        warnings.push('settings.json: disallowedTools should be an array');
      }
      if (settings.mcpServers && typeof settings.mcpServers !== 'object') {
        warnings.push('settings.json: mcpServers should be an object');
      }
      if (
        settings.permissionMode &&
        !['default', 'acceptEdits', 'bypassPermissions', 'plan'].includes(settings.permissionMode)
      ) {
        warnings.push(`settings.json: invalid permissionMode: ${settings.permissionMode}`);
      }

      // Check for conflicting settings
      if (settings.allowedTools && settings.disallowedTools) {
        const overlap = settings.allowedTools.filter(tool =>
          settings.disallowedTools.includes(tool)
        );
        if (overlap.length > 0) {
          warnings.push(
            `settings.json: Tools in both allowedTools and disallowedTools: ${overlap.join(', ')}`
          );
        }
      }

      console.log('  ✓ settings.json validated');
    } catch (error) {
      errors.push(`Invalid JSON in settings.json: ${error.message}`);
    }
  } else {
    warnings.push('settings.json not found (optional, but recommended)');
  }

  // Validate settings.local.json (local settings, gitignored)
  const localSettingsPath = '.claude/settings.local.json';
  if (existsSync(resolve(rootDir, localSettingsPath))) {
    try {
      const localSettingsContent = readFileSync(resolve(rootDir, localSettingsPath), 'utf-8');
      const localSettings = JSON.parse(localSettingsContent);

      // Same validation as settings.json
      if (localSettings.allowedTools && !Array.isArray(localSettings.allowedTools)) {
        warnings.push('settings.local.json: allowedTools should be an array');
      }
      if (localSettings.disallowedTools && !Array.isArray(localSettings.disallowedTools)) {
        warnings.push('settings.local.json: disallowedTools should be an array');
      }

      console.log('  ✓ settings.local.json validated (local settings)');
    } catch (error) {
      errors.push(`Invalid JSON in settings.local.json: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  settings.local.json not found (optional, gitignored)');
  }

  // 13. Validate rule-index.json paths
  console.log('\nValidating rule-index.json paths...');
  // Use resolver to find rule-index.json (checks both canonical and legacy locations)
  const ruleIndexPath = resolveConfigPath('rule-index.json', { read: true });
  if (existsSync(ruleIndexPath)) {
    try {
      const ruleIndexContent = readFileSync(ruleIndexPath, 'utf-8');
      const ruleIndex = JSON.parse(ruleIndexContent);

      // Check for old archive paths
      const indexString = JSON.stringify(ruleIndex);
      if (indexString.includes('.claude/archive/')) {
        errors.push(
          'rule-index.json contains old .claude/archive/ paths. Run pnpm index-rules to regenerate.'
        );
      }

      // Validate that paths in index exist on disk
      if (ruleIndex.rules && Array.isArray(ruleIndex.rules)) {
        let missingPaths = 0;
        for (const rule of ruleIndex.rules.slice(0, 100)) {
          // Check first 100 to avoid performance issues
          if (rule.path) {
            const rulePath = resolve(rootDir, rule.path);
            if (!existsSync(rulePath)) {
              missingPaths++;
              if (missingPaths <= 5) {
                // Only report first 5 missing paths
                errors.push(`rule-index.json references missing file: ${rule.path}`);
              }
            }
          }
        }
        if (missingPaths > 5) {
          errors.push(`rule-index.json references ${missingPaths} missing files (showing first 5)`);
        }
        if (missingPaths === 0) {
          console.log('  ✓ All checked rule paths exist');
        }
      }

      // Check field name consistency
      if (ruleIndex.archive_rules !== undefined) {
        warnings.push(
          'rule-index.json uses old "archive_rules" field. Should be "library_rules". Run pnpm index-rules to regenerate.'
        );
      }

      console.log('  ✓ rule-index.json structure validated');
    } catch (error) {
      errors.push(`Invalid JSON in rule-index.json: ${error.message}`);
    }
  } else {
    warnings.push('rule-index.json not found (optional, but recommended for rule-selector skill)');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Validation Summary');
  console.log('='.repeat(60));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('+ All validations passed!');
    return true;
  }

  if (errors.length > 0) {
    console.log(`\n- Found ${errors.length} error(s):`);
    errors.forEach(error => console.log(`  - ${error}`));
  }

  if (warnings.length > 0) {
    console.log(`\n+  Found ${warnings.length} warning(s):`);
    warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  return errors.length === 0;
}

// Run validation
try {
  const isValid = validateConfig();
  process.exit(isValid ? 0 : 1);
} catch (error) {
  console.error('Fatal error during validation:', error.message);
  console.error(error.stack);
  process.exit(2);
}
