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
import { validateWorkflowAndAgentReferences } from './validate-config-workflows.mjs';
import { validateSkillStructure } from './validate-config-skills.mjs';
import { validateProjectArtifacts } from './validate-config-artifacts.mjs';
import { validateMcpAndSettings, validateRuleIndexPaths } from './validate-config-settings.mjs';

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
const rootDirArgIndex = process.argv.indexOf('--root');
const rootDir =
  rootDirArgIndex !== -1 && process.argv[rootDirArgIndex + 1]
    ? resolve(process.argv[rootDirArgIndex + 1])
    : resolve(__dirname, '../..');

const verbose = process.argv.includes('--verbose');
const errors = [];
const warnings = [];

const context = {
  rootDir,
  verbose,
  yaml,
  errors,
  warnings,
  read: readFileSync,
  exists: existsSync,
  stat: statSync,
  readdir: readdirSync,
  resolve,
  checkFile,
  checkDirectory,
  collectFilesRecursive,
  validateYAML,
};

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

function collectFilesRecursive(dirPath, predicate) {
  const fullDir = resolve(rootDir, dirPath);
  if (!existsSync(fullDir)) {
    return [];
  }

  const results = [];
  const walk = current => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_archive' || entry.name === '_backup') {
          continue;
        }

        walk(fullPath);
        continue;
      }

      if (predicate(fullPath)) {
        const rel = fullPath.replace(resolve(rootDir, '.') + '\\', '').replace(/\\/g, '/');
        results.push(rel);
      }
    }
  };

  walk(fullDir);
  return results;
}

function validateYAML(path, description) {
  const fullPath = resolve(rootDir, path);
  if (!existsSync(fullPath)) {
    errors.push(`Missing ${description}: ${path}`);
    return false;
  }

  if (!yaml) {
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

function validateConfig() {
  console.log('Validating Agent Studio configuration...\n');

  console.log('Checking gate script...');
  checkFile('.claude/tools/gates/gate.mjs', 'gate script');

  console.log('\nValidating config.yaml...');
  const config = loadConfigYaml();
  if (config === null) {
    return;
  }

  console.log('\nChecking agent files...');
  validateConfigAgents(config);

  console.log('\nChecking template files...');
  validateConfigTemplates(config);

  console.log('\nChecking schema files...');
  validateSchemaFiles();

  validateWorkflowAndAgentReferences(context, config);
  const skillFiles = validateSkillStructure(context);
  validateProjectArtifacts(context, skillFiles);
  validateMcpAndSettings(context);
  validateRuleIndexPaths(context, resolveConfigPath);

  return printSummary();
}

function loadConfigYaml() {
  const configPath = resolve(rootDir, '.claude/config.yaml');
  if (!existsSync(configPath)) {
    errors.push('Missing config.yaml: .claude/config.yaml');
    return null;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    if (yaml) {
      return yaml.load(configContent);
    }

    warnings.push(
      'YAML parsing skipped (js-yaml not installed). Install with: npm install js-yaml'
    );
    return {};
  } catch (error) {
    if (yaml) {
      errors.push(`Invalid YAML in config.yaml: ${error.message}`);
      return null;
    }

    warnings.push('Cannot parse config.yaml without js-yaml');
    return {};
  }
}

function validateConfigAgents(config) {
  if (!config.agents || typeof config.agents !== 'object') {
    return;
  }

  for (const [agentName, agentConfig] of Object.entries(config.agents)) {
    if (agentConfig && typeof agentConfig === 'object' && agentConfig.path) {
      if (!checkFile(agentConfig.path, `agent file for ${agentName}`)) {
        warnings.push(`Agent ${agentName} referenced in config but file missing`);
      }
    }
  }
}

function validateConfigTemplates(config) {
  if (!config.templates || !config.templates.base_dir) {
    return;
  }

  checkDirectory(config.templates.base_dir, 'templates directory');
  const templateChecks = [
    { key: 'project_brief', label: 'project brief template' },
    { key: 'prd', label: 'PRD template' },
    { key: 'architecture', label: 'architecture template' },
    { key: 'implementation_plan', label: 'implementation plan template' },
    { key: 'test_plan', label: 'test plan template' },
    { key: 'ui_spec', label: 'UI spec template' },
  ];

  for (const { key, label } of templateChecks) {
    if (config.templates[key]) {
      checkFile(`${config.templates.base_dir}/${config.templates[key]}`, label);
    }
  }
}

function validateSchemaFiles() {
  const schemasDir = '.claude/schemas';
  checkDirectory(schemasDir, 'schemas directory');

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
        JSON.parse(schemaContent);
        console.log(`  ✓ Schema file valid: ${schemaFile}`);
      } catch (error) {
        errors.push(`Invalid JSON in schema file: ${schemaPath} - ${error.message}`);
      }
    } else {
      warnings.push(`Schema file not found (optional): ${schemaPath}`);
    }
  }
}

function printSummary() {
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

try {
  const isValid = validateConfig();
  process.exit(isValid ? 0 : 1);
} catch (error) {
  console.error('Fatal error during validation:', error.message);
  console.error(error.stack);
  process.exit(2);
}
