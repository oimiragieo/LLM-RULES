#!/usr/bin/env node
/**
 * Enterprise Bundle Validator
 * ===========================
 *
 * Validates that a skill has a complete enterprise bundle:
 * scripts, hooks, schemas, rules, commands, templates, references.
 *
 * Used by skill-updater and headless pipelines to detect missing
 * components and trigger scaffolding.
 *
 * @module enterprise-bundle-validator
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * The 9 enterprise bundle components that make a skill fully operational.
 * Each has a name template (<skill-name> is replaced at runtime),
 * a type, and whether it's required for a passing score.
 */
const ENTERPRISE_COMPONENTS = [
  { name: 'scripts/main.cjs', type: 'script', required: true },
  { name: 'hooks/pre-execute.cjs', type: 'hook', required: false },
  { name: 'hooks/post-execute.cjs', type: 'hook', required: false },
  { name: 'schemas/input.schema.json', type: 'schema', required: false },
  { name: 'schemas/output.schema.json', type: 'schema', required: false },
  { name: 'rules/<skill-name>.md', type: 'rule', required: false },
  { name: 'commands/<skill-name>.md', type: 'command', required: false },
  { name: 'templates/implementation-template.md', type: 'template', required: false },
  { name: 'references/research-requirements.md', type: 'reference', required: false },
];

/**
 * Resolve the component path, replacing <skill-name> with the actual name.
 *
 * @param {string} componentName - Component name template
 * @param {string} skillName - The skill name (may include path separators)
 * @returns {string} Resolved component name
 */
function resolveComponentName(componentName, skillName) {
  // Use the leaf name for <skill-name> substitution (e.g., "scientific-skills/biopython" -> "biopython")
  const leafName = path.basename(skillName);
  return componentName.replace('<skill-name>', leafName);
}

/**
 * Validate that a skill has a complete enterprise bundle.
 *
 * @param {string} skillName - Skill name (can include nested path like "scientific-skills/biopython")
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{
 *   complete: boolean,
 *   missing: string[],
 *   existing: string[],
 *   score: string,
 *   scoreNum: number,
 *   scoreMax: number,
 *   skillDir: string,
 *   error?: string
 * }}
 */
function validateEnterpriseBundle(skillName, projectRoot) {
  const skillDir = path.join(projectRoot, '.claude', 'skills', skillName);

  // Check skill directory exists
  if (!fs.existsSync(skillDir)) {
    return {
      complete: false,
      missing: ENTERPRISE_COMPONENTS.map(c => resolveComponentName(c.name, skillName)),
      existing: [],
      score: '0/9',
      scoreNum: 0,
      scoreMax: ENTERPRISE_COMPONENTS.length,
      skillDir,
      error: `Skill directory not found: ${skillDir}`,
    };
  }

  const missing = [];
  const existing = [];

  for (const component of ENTERPRISE_COMPONENTS) {
    const resolvedName = resolveComponentName(component.name, skillName);
    const componentPath = path.join(skillDir, resolvedName);

    if (fs.existsSync(componentPath)) {
      existing.push(resolvedName);
    } else {
      missing.push(resolvedName);
    }
  }

  const scoreNum = existing.length;
  const scoreMax = ENTERPRISE_COMPONENTS.length;

  return {
    complete: missing.length === 0,
    missing,
    existing,
    score: `${scoreNum}/${scoreMax}`,
    scoreNum,
    scoreMax,
    skillDir,
  };
}

module.exports = {
  validateEnterpriseBundle,
  ENTERPRISE_COMPONENTS,
};
