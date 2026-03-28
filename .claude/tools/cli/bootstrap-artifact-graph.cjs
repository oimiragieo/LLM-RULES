#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

/**
 * bootstrap-artifact-graph.cjs
 *
 * Scans filesystem for all artifacts and builds initial artifact relationship graph.
 * Detects 9 artifact types and 5 relationship types.
 *
 * Usage:
 *   node .claude/tools/cli/bootstrap-artifact-graph.cjs [options]
 *   --output PATH    Path to write graph (default: .claude/context/data/artifact-graph.json)
 *   --dry-run        Print stats without writing
 *   --verbose        Show each artifact and edge found
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Determine PROJECT_ROOT (walk up from this script's location)
const findProjectRoot = () => {
  let current = __dirname;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error('Could not find project root (no package.json found)');
};

const PROJECT_ROOT = findProjectRoot();
const { ArtifactGraph, DEFAULT_ARTIFACT_GRAPH_PATH } = require(
  path.join(PROJECT_ROOT, '.claude/lib/workflow/artifact-graph.cjs')
);

// Parse CLI args
const args = process.argv.slice(2);
const options = {
  output: DEFAULT_ARTIFACT_GRAPH_PATH,
  dryRun: false,
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    options.output = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  }
}

/**
 * Normalize path to forward slashes (Windows compat)
 */
function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

const VALIDATION_EDGE_TARGETS = new Set([
  'skill',
  'agent',
  'hook',
  'workflow',
  'template',
  'rule',
  'catalog',
  'registry',
]);

/**
 * Extract explicit artifact validation targets from schema metadata.
 *
 * Schemas may opt in with:
 * {
 *   "x-artifact-graph-targets": ["skill", "agent"]
 * }
 *
 * This keeps the validates edge set bounded and avoids broad title-based fan-out.
 *
 * @param {string} content
 * @returns {string[]}
 */
function extractSchemaValidationTargets(content) {
  const parsed = safeParseJSON(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const rawTargets = parsed['x-artifact-graph-targets'];
  if (!Array.isArray(rawTargets)) {
    return [];
  }

  return [...new Set(rawTargets.filter(target => VALIDATION_EDGE_TARGETS.has(target)))];
}

/**
 * Read directory recursively (synchronous)
 */
function readDirRecursive(dir, filePattern, excludeDirs = []) {
  if (!fs.existsSync(dir)) return [];

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (excludeDirs.includes(entry.name)) continue;

      // Recurse
      results.push(...readDirRecursive(fullPath, filePattern, excludeDirs));
    } else if (entry.isFile()) {
      // Check file pattern
      if (filePattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Derive node ID from file path and type
 */
function deriveNodeId(filePath, type) {
  const relativePath = normalizePath(path.relative(PROJECT_ROOT, filePath));

  switch (type) {
    case 'skill': {
      // .claude/skills/{dirname}/SKILL.md -> skill:{dirname}
      const match = relativePath.match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/);
      return match ? `skill:${match[1]}` : null;
    }
    case 'agent': {
      // .claude/agents/{category}/{filename}.md -> agent:{filename}
      const basename = path.basename(filePath, '.md');
      return `agent:${basename}`;
    }
    case 'hook': {
      // .claude/hooks/**/{filename}.cjs -> hook:{filename}
      const basename = path.basename(filePath, '.cjs');
      return `hook:${basename}`;
    }
    case 'workflow': {
      // .claude/workflows/**/{filename}.md -> workflow:{filename}
      const basename = path.basename(filePath, '.md');
      return `workflow:${basename}`;
    }
    case 'template': {
      // .claude/templates/**/{filename}.md -> template:{filename}
      const basename = path.basename(filePath, '.md');
      return `template:${basename}`;
    }
    case 'schema': {
      // .claude/schemas/{filename}.schema.json -> schema:{filename}
      const basename = path.basename(filePath, '.schema.json');
      return `schema:${basename}`;
    }
    case 'rule': {
      // .claude/rules/{filename}.md -> rule:{filename}
      const basename = path.basename(filePath, '.md');
      return `rule:${basename}`;
    }
    case 'catalog': {
      // .claude/context/artifacts/catalogs/{filename}.md -> catalog:{filename}
      const basename = path.basename(filePath, '.md');
      return `catalog:${basename}`;
    }
    case 'registry': {
      // .claude/context/*-registry.json -> registry:{filename}
      const basename = path.basename(filePath, '.json');
      return `registry:${basename}`;
    }
    default:
      return null;
  }
}

/**
 * Scan artifacts by type
 */
function scanArtifacts() {
  const artifacts = [];

  // 1. Skills: .claude/skills/*/SKILL.md (excluding _archive)
  const skillsDir = path.join(PROJECT_ROOT, '.claude/skills');
  const skillFiles = readDirRecursive(skillsDir, /^SKILL\.md$/, ['_archive', 'node_modules']);
  for (const filePath of skillFiles) {
    const nodeId = deriveNodeId(filePath, 'skill');
    if (nodeId) {
      artifacts.push({
        id: nodeId,
        type: 'skill',
        path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
        filePath,
      });
    }
  }

  // 2. Agents: .claude/agents/{core,domain,specialized,orchestrators}/*.md
  const agentCategories = ['core', 'domain', 'specialized', 'orchestrators'];
  for (const category of agentCategories) {
    const categoryDir = path.join(PROJECT_ROOT, '.claude/agents', category);
    if (fs.existsSync(categoryDir)) {
      const agentFiles = fs.readdirSync(categoryDir).filter(f => f.endsWith('.md'));
      for (const file of agentFiles) {
        const filePath = path.join(categoryDir, file);
        const nodeId = deriveNodeId(filePath, 'agent');
        if (nodeId) {
          artifacts.push({
            id: nodeId,
            type: 'agent',
            path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
            filePath,
          });
        }
      }
    }
  }

  // 3. Hooks: .claude/hooks/**/*.cjs (excluding _archive, node_modules, tests)
  const hooksDir = path.join(PROJECT_ROOT, '.claude/hooks');
  const hookFiles = readDirRecursive(hooksDir, /\.cjs$/, ['_archive', 'node_modules', 'tests']);
  for (const filePath of hookFiles) {
    // Skip test files
    if (filePath.includes('.test.')) continue;

    const nodeId = deriveNodeId(filePath, 'hook');
    if (nodeId) {
      artifacts.push({
        id: nodeId,
        type: 'hook',
        path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
        filePath,
      });
    }
  }

  // 4. Workflows: .claude/workflows/**/*.md (excluding _archive)
  const workflowsDir = path.join(PROJECT_ROOT, '.claude/workflows');
  const workflowFiles = readDirRecursive(workflowsDir, /\.md$/, ['_archive', 'node_modules']);
  for (const filePath of workflowFiles) {
    const nodeId = deriveNodeId(filePath, 'workflow');
    if (nodeId) {
      artifacts.push({
        id: nodeId,
        type: 'workflow',
        path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
        filePath,
      });
    }
  }

  // 5. Templates: .claude/templates/**/*.md (excluding _archive)
  const templatesDir = path.join(PROJECT_ROOT, '.claude/templates');
  if (fs.existsSync(templatesDir)) {
    const templateFiles = readDirRecursive(templatesDir, /\.md$/, ['_archive', 'node_modules']);
    for (const filePath of templateFiles) {
      const nodeId = deriveNodeId(filePath, 'template');
      if (nodeId) {
        artifacts.push({
          id: nodeId,
          type: 'template',
          path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
          filePath,
        });
      }
    }
  }

  // 6. Schemas: .claude/schemas/*.schema.json
  const schemasDir = path.join(PROJECT_ROOT, '.claude/schemas');
  if (fs.existsSync(schemasDir)) {
    const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'));
    for (const file of schemaFiles) {
      const filePath = path.join(schemasDir, file);
      const nodeId = deriveNodeId(filePath, 'schema');
      if (nodeId) {
        artifacts.push({
          id: nodeId,
          type: 'schema',
          path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
          filePath,
        });
      }
    }
  }

  // 7. Rules: .claude/rules/*.md
  const rulesDir = path.join(PROJECT_ROOT, '.claude/rules');
  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    for (const file of ruleFiles) {
      const filePath = path.join(rulesDir, file);
      const nodeId = deriveNodeId(filePath, 'rule');
      if (nodeId) {
        artifacts.push({
          id: nodeId,
          type: 'rule',
          path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
          filePath,
        });
      }
    }
  }

  // 8. Catalogs: .claude/context/artifacts/catalogs/*.md
  const catalogsDir = path.join(PROJECT_ROOT, '.claude/context/artifacts/catalogs');
  if (fs.existsSync(catalogsDir)) {
    const catalogFiles = fs.readdirSync(catalogsDir).filter(f => f.endsWith('.md'));
    for (const file of catalogFiles) {
      const filePath = path.join(catalogsDir, file);
      const nodeId = deriveNodeId(filePath, 'catalog');
      if (nodeId) {
        artifacts.push({
          id: nodeId,
          type: 'catalog',
          path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
          filePath,
        });
      }
    }
  }

  // 9. Registries: .claude/context/*-registry.json, .claude/context/artifacts/catalogs/*-registry.json
  const contextDir = path.join(PROJECT_ROOT, '.claude/context');
  const catalogsRegistryDir = path.join(PROJECT_ROOT, '.claude/context/artifacts/catalogs');

  const registryFiles = [];
  if (fs.existsSync(contextDir)) {
    registryFiles.push(
      ...fs
        .readdirSync(contextDir)
        .filter(f => f.endsWith('-registry.json'))
        .map(f => path.join(contextDir, f))
    );
  }
  if (fs.existsSync(catalogsRegistryDir)) {
    registryFiles.push(
      ...fs
        .readdirSync(catalogsRegistryDir)
        .filter(f => f.endsWith('-registry.json'))
        .map(f => path.join(catalogsRegistryDir, f))
    );
  }

  for (const filePath of registryFiles) {
    const nodeId = deriveNodeId(filePath, 'registry');
    if (nodeId) {
      artifacts.push({
        id: nodeId,
        type: 'registry',
        path: normalizePath(path.relative(PROJECT_ROOT, filePath)),
        filePath,
      });
    }
  }

  return artifacts;
}

/**
 * Detect edges by scanning artifact content
 */
function detectEdges(artifacts) {
  const edges = [];

  // Build artifact lookup by ID
  const artifactMap = new Map();
  for (const artifact of artifacts) {
    artifactMap.set(artifact.id, artifact);
  }

  for (const artifact of artifacts) {
    // Skip if file doesn't exist or can't be read
    if (!fs.existsSync(artifact.filePath)) continue;

    let content;
    try {
      content = fs.readFileSync(artifact.filePath, 'utf8');
    } catch (_err) {
      continue; // Skip unreadable files
    }

    // Edge Type 1: assigned-to (skill -> agent)
    // In agent files, look for skill names in frontmatter or Skill({ skill: 'name' })
    if (artifact.type === 'agent') {
      // Frontmatter skills list
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const skillsMatch = frontmatter.match(/skills:\s*\[(.*?)\]/s);
        if (skillsMatch) {
          const skillNames = skillsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
          for (const skillName of skillNames) {
            const skillId = `skill:${skillName}`;
            if (artifactMap.has(skillId)) {
              edges.push({ from: skillId, to: artifact.id, type: 'assigned-to', status: 'active' });
            }
          }
        }
      }

      // Skill invocation patterns: Skill({ skill: 'name' })
      const skillInvocations = content.matchAll(/Skill\(\{\s*skill:\s*['"]([^'"]+)['"]/g);
      for (const match of skillInvocations) {
        const skillName = match[1];
        const skillId = `skill:${skillName}`;
        if (artifactMap.has(skillId)) {
          edges.push({ from: skillId, to: artifact.id, type: 'assigned-to', status: 'active' });
        }
      }
    }

    // Edge Type 2: invokes (workflow -> skill/agent)
    if (artifact.type === 'workflow') {
      // Skill invocations
      const skillInvocations = content.matchAll(/Skill\(\{\s*skill:\s*['"]([^'"]+)['"]/g);
      for (const match of skillInvocations) {
        const skillName = match[1];
        const skillId = `skill:${skillName}`;
        if (artifactMap.has(skillId)) {
          edges.push({ from: artifact.id, to: skillId, type: 'invokes', status: 'active' });
        }
      }

      // Agent references (Task calls)
      const agentRefs = content.matchAll(/subagent_type:\s*['"]([^'"]+)['"]/g);
      for (const match of agentRefs) {
        const agentName = match[1];
        const agentId = `agent:${agentName}`;
        if (artifactMap.has(agentId)) {
          edges.push({ from: artifact.id, to: agentId, type: 'invokes', status: 'active' });
        }
      }
    }

    // Edge Type 3: references (catalog -> artifacts)
    if (artifact.type === 'catalog') {
      // Look for artifact references in markdown
      // Pattern: skill:name, agent:name, etc.
      const references = content.matchAll(
        /\b(skill|agent|hook|workflow|template|schema|rule):([a-z0-9-]+)\b/gi
      );
      for (const match of references) {
        const refId = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
        if (artifactMap.has(refId)) {
          edges.push({ from: artifact.id, to: refId, type: 'references', status: 'active' });
        }
      }
    }

    // Edge Type 4: enforced-by (hook guards artifact paths)
    if (artifact.type === 'hook') {
      // Look for path patterns in hook content
      const pathPatterns = [
        { pattern: /\.claude\/skills\//g, prefix: 'skill' },
        { pattern: /\.claude\/agents\//g, prefix: 'agent' },
        { pattern: /\.claude\/hooks\//g, prefix: 'hook' },
        { pattern: /\.claude\/workflows\//g, prefix: 'workflow' },
      ];

      for (const { pattern, prefix } of pathPatterns) {
        if (pattern.test(content)) {
          // Hook guards artifacts of this type (generically)
          // This is a weak detection - best effort
          for (const target of artifacts) {
            if (target.type === prefix) {
              edges.push({
                from: target.id,
                to: artifact.id,
                type: 'enforced-by',
                status: 'active',
              });
            }
          }
          break; // Only add once per hook
        }
      }
    }

    // Edge Type 5: validates (schema -> artifact types)
    if (artifact.type === 'schema') {
      const targetTypes = extractSchemaValidationTargets(content);
      for (const targetType of targetTypes) {
        for (const target of artifacts) {
          if (target.type === targetType) {
            edges.push({ from: artifact.id, to: target.id, type: 'validates', status: 'active' });
          }
        }
      }
    }
  }

  // Remove duplicates
  const uniqueEdges = [];
  const seen = new Set();
  for (const edge of edges) {
    const key = `${edge.from}:${edge.to}:${edge.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEdges.push(edge);
    }
  }

  return uniqueEdges;
}

/**
 * Main execution
 */
function main() {
  console.log('Bootstrapping artifact graph...');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Output: ${options.output}`);
  console.log('');

  // Step 1: Scan artifacts
  console.log('Scanning artifacts...');
  const artifacts = scanArtifacts();
  console.log(`Found ${artifacts.length} artifacts`);

  // Count by type
  const byType = {};
  for (const artifact of artifacts) {
    byType[artifact.type] = (byType[artifact.type] || 0) + 1;
  }

  console.log('\nNodes by type:');
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  if (options.verbose) {
    console.log('\nArtifacts:');
    for (const artifact of artifacts) {
      console.log(`  ${artifact.id} (${artifact.type}) - ${artifact.path}`);
    }
  }

  // Step 2: Detect edges
  console.log('\nDetecting edges...');
  const edges = detectEdges(artifacts);
  console.log(`Found ${edges.length} edges`);

  // Count by edge type
  const edgesByType = {};
  for (const edge of edges) {
    edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
  }

  console.log('\nEdges by type:');
  for (const [type, count] of Object.entries(edgesByType).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  if (options.verbose) {
    console.log('\nEdges:');
    for (const edge of edges) {
      console.log(`  ${edge.from} -[${edge.type}]-> ${edge.to}`);
    }
  }

  // Step 3: Build graph
  console.log('\nBuilding graph...');
  const graph = new ArtifactGraph(options.output);

  // Add nodes
  for (const artifact of artifacts) {
    graph.addNode(artifact.id, {
      type: artifact.type,
      path: artifact.path,
      integrationStatus: 'created',
    });
  }

  // Add edges
  for (const edge of edges) {
    graph.addEdge(edge.from, edge.to, edge.type, edge.status);
  }

  // Step 4: Calculate stats
  const stats = graph.getStats();
  console.log('\nGraph statistics:');
  console.log(`  Total nodes: ${stats.nodeCount}`);
  console.log(`  Total edges: ${stats.edgeCount}`);
  console.log(`  Integration health: ${(stats.integrationHealth * 100).toFixed(1)}%`);

  // Step 5: Write graph (unless dry-run)
  if (options.dryRun) {
    console.log('\nDry-run mode: graph not written');
  } else {
    const success = graph.save();
    if (success) {
      console.log(`\nGraph written to: ${options.output}`);
      console.log(`File size: ${(fs.statSync(options.output).size / 1024).toFixed(1)} KB`);
    } else {
      console.error('\nError: Failed to write graph');
      process.exit(1);
    }
  }

  console.log('\nBootstrap complete!');
}

// Run
try {
  const wrappedMain = wrapCLITool(main, 'bootstrap-artifact-graph');

  if (require.main === module) {
    wrappedMain();
  }
} catch (err) {
  console.error('Fatal error:', err.message);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
}
