#!/usr/bin/env node
/**
 * Comprehensive Reference Validation Script
 *
 * Validates all file references across the entire Agent Studio system:
 * - Agent files referenced in config.yaml
 * - Schema files referenced in workflows
 * - Template files referenced in agents/workflows
 * - Workflow files referenced in config.yaml
 * - All cross-references
 *
 * Usage:
 *   node scripts/validation/validate-all-references.mjs [--verbose] [--fix]
 *
 * Exit codes:
 *   0: All validations passed
 *   1: One or more validations failed
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Import js-yaml
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  console.error('❌ Error: js-yaml package is required for validation.');
  console.error('   Please install it: pnpm add -D js-yaml');
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const _fixMode = args.includes('--fix');

const errors = [];
const warnings = [];
const _fixes = [];

// Global config
let config = null;

/**
 * Load config.yaml
 */
function loadConfig() {
  if (config) return config;

  const configPath = resolve(rootDir, '.claude/config.yaml');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    config = yaml.load(content);
    return config;
  } catch (_error) {
    return null;
  }
}

/**
 * Check if file exists
 */
function checkFile(path, description, required = true) {
  const fullPath = resolve(rootDir, path);
  const exists = existsSync(fullPath);

  if (!exists) {
    if (required) {
      errors.push(`Missing required file: ${path} (${description})`);
    } else {
      warnings.push(`Missing optional file: ${path} (${description})`);
    }
    return false;
  }

  if (verbose) {
    console.log(`  ✓ ${description}: ${path}`);
  }
  return true;
}

/**
 * Recursively list markdown files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function listMarkdownFilesRecursive(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archive') continue;
      files.push(...listMarkdownFilesRecursive(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract template references from markdown content
 */
function extractTemplateReferences(content, filePath) {
  const templateRefs = [];
  // Match patterns like: .claude/templates/plan-template.md
  const regex = /\.claude\/templates\/([a-z-]+\.md)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    templateRefs.push({
      template: match[1],
      fullPath: `.claude/templates/${match[1]}`,
      referencedIn: filePath,
    });
  }

  return templateRefs;
}

/**
 * Extract schema references from YAML content
 */
function extractSchemaReferences(content, filePath) {
  const schemaRefs = [];
  // Match patterns like: schema: .claude/schemas/plan.schema.json
  const regex = /schema:\s*\.claude\/schemas\/([a-z-]+\.schema\.json)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    schemaRefs.push({
      schema: match[1],
      fullPath: `.claude/schemas/${match[1]}`,
      referencedIn: filePath,
    });
  }

  return schemaRefs;
}

/**
 * Parse YAML frontmatter block from markdown content.
 *
 * @param {string} content
 * @returns {string}
 */
function parseFrontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match ? match[1] : '';
}

/**
 * Extract list values from a simple frontmatter list block (e.g. skills/context_files).
 *
 * @param {string} frontmatter
 * @param {string} key
 * @returns {string[]}
 */
function extractFrontmatterList(frontmatter, key) {
  if (!frontmatter) return [];
  const values = [];
  const lines = frontmatter.split(/\r?\n/);
  let inBlock = false;

  for (const rawLine of lines) {
    const line = rawLine || '';
    if (new RegExp(`^${key}:\\s*$`).test(line)) {
      inBlock = true;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*:\s*/.test(line)) {
      inBlock = false;
    }
    if (!inBlock) continue;

    const listMatch = line.match(/^\s*-\s*(.+?)\s*$/);
    if (!listMatch) continue;
    const value = listMatch[1].replace(/^['"]|['"]$/g, '');
    values.push(value);
  }

  return values;
}

/**
 * Validate config.yaml
 */
function validateConfigYAML() {
  console.log('\n📋 Validating config.yaml...');

  const configPath = resolve(rootDir, '.claude/config.yaml');
  if (!checkFile('.claude/config.yaml', 'Config file', true)) {
    return;
  }

  let config;
  try {
    const content = readFileSync(configPath, 'utf-8');
    config = yaml.load(content);
  } catch (error) {
    errors.push(`Failed to parse config.yaml: ${error.message}`);
    return;
  }

  // Validate agent routing
  if (config.agent_routing) {
    Object.keys(config.agent_routing).forEach(agentName => {
      if (agentName === 'sdk') return; // Skip SDK directory
      const configuredPath = config?.agents?.[agentName]?.path;
      if (configuredPath) {
        if (!existsSync(resolve(rootDir, configuredPath))) {
          errors.push(
            `Agent referenced in config.yaml but file missing: ${configuredPath} (agent: ${agentName})`
          );
        } else if (verbose) {
          console.log(`  ✓ Agent ${agentName} exists at configured path`);
        }
        return;
      }

      const fallbackPath = resolve(rootDir, `.claude/agents/${agentName}.md`);
      if (!existsSync(fallbackPath)) {
        errors.push(
          `Agent referenced in config.yaml but file missing: ${agentName}.md (no config.agents path)`
        );
      } else if (verbose) {
        console.log(`  ✓ Agent ${agentName} exists (fallback path)`);
      }
    });
  }

  // Validate workflow files
  if (config.workflow_selection) {
    Object.entries(config.workflow_selection).forEach(([name, workflow]) => {
      if (workflow.workflow_file) {
        const workflowPath = resolve(rootDir, workflow.workflow_file);
        if (!existsSync(workflowPath)) {
          errors.push(`Workflow file missing: ${workflow.workflow_file} (referenced by ${name})`);
        } else if (verbose) {
          console.log(`  ✓ Workflow file exists: ${workflow.workflow_file}`);
        }
      }
    });
  }

  // Validate template configuration
  if (config.templates) {
    Object.entries(config.templates).forEach(([key, templateFile]) => {
      if (key === 'base_dir') return;
      const templatePath = resolve(
        rootDir,
        config.templates.base_dir || '.claude/templates',
        templateFile
      );
      if (!existsSync(templatePath)) {
        errors.push(
          `Template missing: ${templateFile} (referenced in config.yaml templates.${key})`
        );
      } else if (verbose) {
        console.log('  ✓ Template reference validated');
      }
    });
  }
}

/**
 * Validate all workflows
 */
function validateWorkflows() {
  console.log('\n📋 Validating workflows...');

  const workflowsDir = resolve(rootDir, '.claude/workflows');
  if (!existsSync(workflowsDir)) {
    errors.push('Workflows directory missing: .claude/workflows');
    return;
  }

  const workflowFiles = readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .filter(f => f !== 'WORKFLOW-GUIDE.md');

  const allSchemas = new Set();
  const allAgents = new Set();

  workflowFiles.forEach(file => {
    const filePath = resolve(workflowsDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const workflow = yaml.load(content);

      // Extract schema references
      const schemaRefs = extractSchemaReferences(content, file);
      schemaRefs.forEach(ref => {
        allSchemas.add(ref.fullPath);
        if (!checkFile(ref.fullPath, `Schema ${ref.schema}`, true)) {
          errors.push(`Schema missing: ${ref.schema} (referenced in ${file})`);
        }
      });

      // Extract agent references
      const isTemplate = workflow.template === true;
      if (workflow.steps && Array.isArray(workflow.steps)) {
        workflow.steps.forEach(step => {
          if (step.agent) {
            // Skip template placeholders in template workflows
            if (isTemplate && step.agent.includes('{{') && step.agent.includes('}}')) {
              if (verbose) {
                console.log(`  ⚠ Skipping template placeholder: ${step.agent} (in ${file})`);
              }
              return;
            }
            allAgents.add(step.agent);
            // Check agent using config paths
            const agentConfig = config?.agents?.[step.agent];
            if (agentConfig && agentConfig.path) {
              const agentPath = agentConfig.path;
              if (!checkFile(agentPath, `Agent ${step.agent}`, true)) {
                errors.push(
                  `Agent missing: ${step.agent}.md (referenced in ${file}, step ${step.step})`
                );
              }
            } else {
              // Fallback to direct file check
              const agentFile = resolve(rootDir, `.claude/agents/${step.agent}.md`);
              if (!existsSync(agentFile)) {
                errors.push(
                  `Agent missing: ${step.agent}.md (referenced in ${file}, step ${step.step})`
                );
              }
            }
          }
        });
      }

      // Check for phase-based workflows (BMad format)
      if (workflow.phases && Array.isArray(workflow.phases)) {
        workflow.phases.forEach(phase => {
          if (phase.steps && Array.isArray(phase.steps)) {
            phase.steps.forEach(step => {
              if (step.agent) {
                // Skip template placeholders in template workflows
                if (isTemplate && step.agent.includes('{{') && step.agent.includes('}}')) {
                  if (verbose) {
                    console.log(`  ⚠ Skipping template placeholder: ${step.agent} (in ${file})`);
                  }
                  return;
                }
                allAgents.add(step.agent);
                // Check agent using config paths
                const agentConfig = config?.agents?.[step.agent];
                if (agentConfig && agentConfig.path) {
                  const agentPath = agentConfig.path;
                  if (!checkFile(agentPath, `Agent ${step.agent}`, true)) {
                    errors.push(
                      `Agent missing: ${step.agent}.md (referenced in ${file}, step ${step.step ?? 'unknown'})`
                    );
                  }
                } else {
                  // Fallback to direct file check
                  const agentFile = resolve(rootDir, `.claude/agents/${step.agent}.md`);
                  if (!existsSync(agentFile)) {
                    errors.push(
                      `Agent missing: ${step.agent}.md (referenced in ${file}, step ${step.step ?? 'unknown'})`
                    );
                  }
                }
              }
            });
          }
        });
      }
    } catch (error) {
      errors.push(`Failed to parse workflow ${file}: ${error.message}`);
    }
  });

  if (verbose) {
    console.log(`  Found ${allSchemas.size} unique schema references`);
    console.log(`  Found ${allAgents.size} unique agent references`);
  }
}

/**
 * Validate all agents
 */
function validateAgents() {
  console.log('\n📋 Validating agents...');

  const agentsDir = resolve(rootDir, '.claude/agents');
  if (!existsSync(agentsDir)) {
    errors.push('Agents directory missing: .claude/agents');
    return;
  }

  const agentFiles = listMarkdownFilesRecursive(agentsDir);

  const allTemplates = new Set();

  agentFiles.forEach(filePath => {
    const file = filePath.replace(`${agentsDir}\\`, '').replace(`${agentsDir}/`, '');
    try {
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseFrontmatterBlock(content);

      // Extract template references
      const templateRefs = extractTemplateReferences(content, file);
      templateRefs.forEach(ref => {
        allTemplates.add(ref.fullPath);
        if (!checkFile(ref.fullPath, `Template ${ref.template}`, true)) {
          errors.push(`Template missing: ${ref.template} (referenced in agent ${file})`);
        }
      });

      // Validate skills referenced in frontmatter
      const skills = extractFrontmatterList(frontmatter, 'skills');
      skills.forEach(skill => {
        const activeSkillPath = `.claude/skills/${skill}`;
        const archivedSkillPath = `.claude/skills/_archive/dead/${skill}`;
        if (existsSync(resolve(rootDir, activeSkillPath))) return;
        if (existsSync(resolve(rootDir, archivedSkillPath))) {
          errors.push(
            `Archived skill referenced by agent: ${skill} (agent ${file}) - restore or update frontmatter`
          );
          return;
        }
        errors.push(`Missing skill referenced by agent: ${skill} (agent ${file})`);
      });

      // Validate context_files referenced in frontmatter when they point into .claude
      const contextFiles = extractFrontmatterList(frontmatter, 'context_files');
      contextFiles.forEach(contextFile => {
        const normalized = contextFile.replace(/^@/, '');
        if (!normalized.startsWith('.claude/')) return;
        if (!existsSync(resolve(rootDir, normalized))) {
          errors.push(`Missing context file referenced by agent: ${normalized} (agent ${file})`);
        }
      });
    } catch (error) {
      warnings.push(`Failed to read agent ${file}: ${error.message}`);
    }
  });

  if (verbose) {
    console.log(`  Found ${allTemplates.size} unique template references`);
  }
}

/**
 * Validate all templates exist
 */
function validateTemplates() {
  console.log('\n📋 Validating templates...');

  const templatesDir = resolve(rootDir, '.claude/templates');
  if (!existsSync(templatesDir)) {
    errors.push('Templates directory missing: .claude/templates');
    return;
  }

  const templateFiles = readdirSync(templatesDir).filter(f => f.endsWith('.md'));

  // Check critical templates
  const criticalTemplates = [
    'plan-template.md',
    'claude-md-template.md',
    'project-brief.md',
    'prd.md',
    'architecture.md',
    'ui-spec.md',
    'test-plan.md',
  ];

  criticalTemplates.forEach(template => {
    checkFile(`.claude/templates/${template}`, `Critical template: ${template}`, true);
  });

  if (verbose) {
    console.log(`  Found ${templateFiles.length} template files`);
  }
}

/**
 * Validate all schemas exist
 */
function validateSchemas() {
  console.log('\n📋 Validating schemas...');

  const schemasDir = resolve(rootDir, '.claude/schemas');
  if (!existsSync(schemasDir)) {
    errors.push('Schemas directory missing: .claude/schemas');
    return;
  }

  const schemaFiles = readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'));

  // Check critical schemas
  const criticalSchemas = [
    'plan.schema.json',
    'project_brief.schema.json',
    'product_requirements.schema.json',
    'system_architecture.schema.json',
    'database_architecture.schema.json',
    'ux_spec.schema.json',
    'test_plan.schema.json',
    'artifact_manifest.schema.json',
  ];

  criticalSchemas.forEach(schema => {
    checkFile(`.claude/schemas/${schema}`, `Critical schema: ${schema}`, true);
  });

  if (verbose) {
    console.log(`  Found ${schemaFiles.length} schema files`);
  }
}

/**
 * Validate workflow runner dependencies
 */
function validateWorkflowRunner() {
  console.log('\n📋 Validating workflow runner...');

  const _runnerPath = resolve(rootDir, '.claude/lib/workflow/workflow-runner.js');
  if (!checkFile('.claude/lib/workflow/workflow-runner.js', 'Workflow runner', true)) {
    return;
  }

  // Check for required dependencies
  const dependencies = [
    '.claude/lib/workflow/decision-handler.mjs',
    '.claude/lib/workflow/loop-handler.mjs',
  ];

  dependencies.forEach(dep => {
    checkFile(dep, `Workflow dependency: ${dep}`, true);
  });
}

/**
 * Main validation function
 */
function main() {
  console.log('🔍 Comprehensive Reference Validation\n');
  console.log('='.repeat(60));

  // Load config first
  loadConfig();

  validateConfigYAML();
  validateWorkflows();
  validateAgents();
  validateTemplates();
  validateSchemas();
  validateWorkflowRunner();

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📊 Validation Results\n');

  if (errors.length > 0) {
    console.error('❌ Errors Found:');
    errors.forEach(error => {
      console.error(`  • ${error}`);
    });
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Warnings:');
    warnings.forEach(warning => {
      console.warn(`  • ${warning}`);
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All validations passed!');
    console.log('\n✓ All agent files exist');
    console.log('✓ All schema files exist');
    console.log('✓ All template files exist');
    console.log('✓ All workflow files exist');
    console.log('✓ All references are valid');
    process.exit(0);
  } else {
    console.log(`\n📊 Summary: ${errors.length} error(s), ${warnings.length} warning(s)`);
    if (errors.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

main();
