// .claude/lib/memory/relationship-inferrer.cjs
// Infers relationships from code structure: package.json deps, import statements, shared entities.

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Infer depends_on relationships from package.json dependencies.
 *
 * Reads `projectDir/package.json` and checks if any declared dependency names
 * match a project registered in the provided CrossRepoRegistry. When a match
 * is found an inferred `depends_on` relationship is returned.
 *
 * @param {string} projectDir - Absolute path to the project directory.
 * @param {import('./cross-repo-registry.cjs').CrossRepoRegistry} [registry] -
 *   CrossRepoRegistry instance to look up registered project names. When
 *   omitted a default-path registry is created automatically.
 * @returns {Array<{source: string, target: string, type: string, evidence: string}>}
 */
function inferFromDependencies(projectDir, registry) {
  if (!projectDir) return [];

  // Fall back to a default registry when none is provided.
  if (!registry) {
    const { CrossRepoRegistry } = require('./cross-repo-registry.cjs');
    registry = new CrossRepoRegistry();
  }

  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  let pkg;
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch (_err) {
    return [];
  }

  // Collect all declared dependency names across the three standard fields.
  const allDepNames = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);

  // Get the set of registered project names.
  let registeredProjects;
  try {
    registeredProjects = registry.listProjects();
  } catch (_err) {
    return [];
  }

  const registeredNameSet = new Set((registeredProjects || []).map(p => p.name));
  const source = path.basename(projectDir);

  const relationships = [];
  for (const depName of allDepNames) {
    if (registeredNameSet.has(depName)) {
      relationships.push({
        source,
        target: depName,
        type: 'depends_on',
        evidence: 'package.json',
      });
    }
  }

  return relationships;
}

/**
 * Extract import relationships from a JS/CJS source file.
 *
 * Scans the file for `require('...')` calls and returns one relationship
 * object per unique module path found. The `target` field contains the raw
 * module specifier (not resolved to a filesystem path).
 *
 * @param {string} filePath - Absolute path to the JS/CJS source file.
 * @returns {Array<{source: string, target: string, type: string}>}
 */
function inferFromImports(filePath) {
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return [];
  }

  // Match all require() calls with single, double, or backtick-quoted strings.
  const requireRegex = /require\(\s*(['"`])([^'"`]+)\1\s*\)/g;
  const relationships = [];
  const seen = new Set();

  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const modulePath = match[2];
    if (seen.has(modulePath)) continue;
    seen.add(modulePath);

    relationships.push({
      source: filePath,
      target: modulePath,
      type: 'imports',
    });
  }

  return relationships;
}

/**
 * Infer cross-repo entity relationships by comparing entity exports.
 *
 * Iterates all registered projects' knowledge exports and pairs entities that
 * share a name (`shared_name`) or share a type but not a name (`shared_type`).
 * Each unique pair across two different projects is returned once.
 *
 * @param {import('./cross-repo-registry.cjs').CrossRepoRegistry} registry -
 *   CrossRepoRegistry instance used to load project knowledge exports.
 * @returns {Array<{entityA: object, projectA: string, entityB: object, projectB: string, type: string}>}
 */
function inferCrossRepoLinks(registry) {
  if (!registry) return [];

  let projects;
  try {
    projects = registry.listProjects();
  } catch (_err) {
    return [];
  }

  if (!projects || projects.length < 2) return [];

  // Load knowledge exports for each registered project.
  const projectData = [];
  for (const project of projects) {
    let knowledge;
    try {
      knowledge = registry.getProjectKnowledge(project.name);
    } catch (_err) {
      continue;
    }
    if (knowledge && Array.isArray(knowledge.entities) && knowledge.entities.length > 0) {
      projectData.push({ projectName: project.name, entities: knowledge.entities });
    }
  }

  if (projectData.length < 2) return [];

  const results = [];
  const seen = new Set();

  // Compare every pair of distinct projects.
  for (let i = 0; i < projectData.length; i++) {
    const projA = projectData[i];
    for (let j = i + 1; j < projectData.length; j++) {
      const projB = projectData[j];

      for (const entityA of projA.entities) {
        const nameA = (entityA.name || '').toLowerCase();
        const typeA = entityA.type || '';

        for (const entityB of projB.entities) {
          const nameB = (entityB.name || '').toLowerCase();
          const typeB = entityB.type || '';

          const sharedName = nameA !== '' && nameA === nameB;
          const sharedType = typeA !== '' && typeA === typeB;

          if (!sharedName && !sharedType) continue;

          // Deduplicate entity-pair within project-pair comparison.
          const pairKey = `${projA.projectName}:${entityA.id || entityA.name}:${projB.projectName}:${entityB.id || entityB.name}`;
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);

          results.push({
            entityA,
            projectA: projA.projectName,
            entityB,
            projectB: projB.projectName,
            // shared_name takes precedence when both name and type match.
            type: sharedName ? 'shared_name' : 'shared_type',
          });
        }
      }
    }
  }

  return results;
}

module.exports = {
  inferFromDependencies,
  inferFromImports,
  inferCrossRepoLinks,
};
