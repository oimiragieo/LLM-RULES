#!/usr/bin/env node
/* eslint-disable max-lines */
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { parseMarkdownTable } = require('../../lib/utils/markdown-table-parser.cjs');
const { parseSemver } = require('../../lib/artifacts/semver-diff.cjs');
/**
 * validate-integration.cjs
 *
 * CLI tool for validating artifact integration completeness.
 * Part of the Post-Creation Validation Workflow.
 *
 * Usage:
 *   node validate-integration.cjs <artifact-path>
 *   node validate-integration.cjs --recent
 *   node validate-integration.cjs --all
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = One or more checks failed
 *   2 = Invalid arguments or artifact not found
 *
 * @see .claude/workflows/core/post-creation-validation.md
 */

const fs = require('fs');
const path = require('path');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Paths relative to project root
const CLAUDE_MD = path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md');
const SKILL_CATALOG = path.join(PROJECT_ROOT, '.claude', 'docs', 'skill-catalog.md');
const SKILL_CATALOG_LEGACY = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'catalogs',
  'skill-catalog.md'
);
const ROUTING_DIR = path.join(PROJECT_ROOT, '.claude', 'lib', 'routing');
const EVOLUTION_STATE = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const LEARNINGS_MD = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
const DECISIONS_MD = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'decisions.md');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

/**
 * Determine artifact type from path.
 */
function getArtifactType(artifactPath) {
  const normalizedPath = artifactPath.replace(/\\/g, '/');

  if (normalizedPath.includes('/agents/')) return 'agent';
  if (normalizedPath.includes('/skills/')) return 'skill';
  if (normalizedPath.includes('/workflows/')) return 'workflow';
  if (normalizedPath.includes('/hooks/')) return 'hook';
  if (normalizedPath.includes('/schemas/')) return 'schema';
  if (normalizedPath.includes('/templates/')) return 'template';

  return 'unknown';
}

/**
 * Extract artifact name from path.
 */
function getArtifactName(artifactPath) {
  const normalizedPath = artifactPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const filename = parts[parts.length - 1];
  const parent = parts[parts.length - 2] || '';

  if (filename.toLowerCase() === 'skill.md' && parent) {
    return parent;
  }

  // Remove extension
  return filename.replace(/\.(md|cjs|mjs|json)$/, '');
}

/**
 * Read file safely.
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return null;
  }
}

/**
 * Strip fenced code blocks and heading lines from a Markdown string.
 * Used to prevent false positives when searching for names in documents
 * like CLAUDE.md where names may appear in code examples or section headers.
 *
 * @param {string} content
 * @returns {string}
 */
function stripFencesAndHeadings(content) {
  if (typeof content !== 'string') return '';
  const lines = content.split('\n');
  const result = [];
  let inFence = false;

  for (const line of lines) {
    if (/^[ \t]*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s/.test(line.trim())) continue;
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Core logic: check if any Markdown table in catalog contains artifactName.
 * Uses parseMarkdownTable — no unconditional str.includes fallback.
 * Falls back to str.includes ONLY on a parse throw (malformed content).
 *
 * Exported for integration-level testing with controlled content.
 *
 * @param {string} catalog - catalog Markdown content
 * @param {string} artifactName
 * @returns {boolean}
 */
function _catalogHasEntry(catalog, artifactName) {
  try {
    const rows = parseMarkdownTable(catalog);
    return rows.some(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(artifactName.toLowerCase()))
    );
  } catch (_parseErr) {
    return catalog.toLowerCase().includes(artifactName.toLowerCase());
  }
}

/**
 * Core logic: check if CLAUDE.md (outside code fences and headings) contains artifactName.
 *
 * Exported for integration-level testing with controlled content.
 *
 * @param {string} claudeMd - CLAUDE.md content
 * @param {string} artifactName
 * @returns {boolean}
 */
function _claudeMdHasEntry(claudeMd, artifactName) {
  const stripped = stripFencesAndHeadings(claudeMd);
  return stripped.toLowerCase().includes(artifactName.toLowerCase());
}

/**
 * Check 1: CLAUDE.md Routing Entry (AST)
 */
async function checkClaudeMdRouting(artifactPath, artifactType, artifactName) {
  if (!['agent', 'workflow'].includes(artifactType)) {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  try {
    const { validateAgentInMarkdownTables } = await import('./validate-agent-ast.mjs');
    const result = await validateAgentInMarkdownTables(artifactName, CLAUDE_MD);

    // Fallback exactly to traditional scan if AST scan fails but traditional passes (transitional safety)
    if (!result.passed) {
      const claudeMd = readFileSafe(CLAUDE_MD);
      if (_claudeMdHasEntry(claudeMd || '', artifactName)) {
        // Still passed using traditional mechanism
        return {
          applicable: true,
          passed: true,
          message: `Found "${artifactName}" in CLAUDE.md (traditional)`,
        };
      }
    }

    return {
      applicable: true,
      passed: result.passed,
      message: result.message || `AST check for "${artifactName}"`,
    };
  } catch (_err) {
    const claudeMd = readFileSafe(CLAUDE_MD);
    const hasEntry = _claudeMdHasEntry(claudeMd || '', artifactName);
    if (hasEntry)
      return {
        applicable: true,
        passed: true,
        message: `Found "${artifactName}" in CLAUDE.md (fallback)`,
      };
    return {
      applicable: true,
      passed: false,
      message: `No routing entry found for "${artifactName}" in CLAUDE.md`,
    };
  }
}

/**
 * Check 2: Skill Catalog Entry
 */
function checkSkillCatalog(artifactPath, artifactType, artifactName) {
  if (artifactType !== 'skill') {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  const catalog = readFileSafe(SKILL_CATALOG) || readFileSafe(SKILL_CATALOG_LEGACY);
  if (!catalog) {
    return { applicable: true, passed: false, message: 'Could not read skill-catalog.md' };
  }

  const hasEntry = _catalogHasEntry(catalog, artifactName);

  if (hasEntry) {
    return { applicable: true, passed: true, message: `Found "${artifactName}" in skill catalog` };
  }

  return {
    applicable: true,
    passed: false,
    message: `No catalog entry found for "${artifactName}" in skill-catalog.md`,
  };
}

/**
 * Check 3: Router Enforcer Keywords (AST)
 */
async function checkRoutingTable(artifactPath, artifactType, artifactName) {
  if (artifactType !== 'agent') {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  try {
    const { validateAgentInJsRouting } = await import('./validate-agent-ast.mjs');
    const result = await validateAgentInJsRouting(artifactName);

    if (!result.passed) {
      // Transitional safety: fallback to traditional text scan
      const files = fs
        .readdirSync(ROUTING_DIR)
        .filter(f => f.endsWith('.cjs') || f.endsWith('.js'));
      let traditionalPassed = false;
      for (const file of files) {
        const content = readFileSafe(path.join(ROUTING_DIR, file));
        if (content && content.toLowerCase().includes(artifactName.toLowerCase())) {
          traditionalPassed = true;
          break;
        }
      }
      if (traditionalPassed) {
        return {
          applicable: true,
          passed: true,
          message: `Found "${artifactName}" via traditional string scan`,
        };
      }
    }

    return {
      applicable: true,
      passed: result.passed,
      message: result.message,
    };
  } catch (_err) {
    return { applicable: true, passed: false, message: `AST verification failed: ${_err.message}` };
  }
}

/**
 * Check 4: Agent Assignment
 */
function checkAgentAssignment(artifactPath, artifactType, artifactName) {
  if (!['skill', 'workflow'].includes(artifactType)) {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  // Search all agent files for reference to this artifact
  function searchDir(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          const found = searchDir(itemPath);
          if (found) return found;
        } else if (item.endsWith('.md')) {
          const content = readFileSafe(itemPath);
          if (content && content.toLowerCase().includes(artifactName.toLowerCase())) {
            return itemPath;
          }
        }
      }
    } catch (_err) {
      // Ignore errors
    }
    return null;
  }

  const foundIn = searchDir(AGENTS_DIR);

  if (foundIn) {
    const relativePath = path.relative(PROJECT_ROOT, foundIn);
    return { applicable: true, passed: true, message: `Assigned to agent: ${relativePath}` };
  }

  return {
    applicable: true,
    passed: false,
    message: `No agent references "${artifactName}"`,
  };
}

/**
 * Check 5: Memory File Updates
 */
function checkMemoryFiles(artifactPath, artifactType, artifactName) {
  const learnings = readFileSafe(LEARNINGS_MD) || '';
  const decisions = readFileSafe(DECISIONS_MD) || '';

  const inLearnings = learnings.toLowerCase().includes(artifactName.toLowerCase());
  const inDecisions = decisions.toLowerCase().includes(artifactName.toLowerCase());

  if (inLearnings || inDecisions) {
    const locations = [];
    if (inLearnings) locations.push('learnings.md');
    if (inDecisions) locations.push('decisions.md');
    return { applicable: true, passed: true, message: `Found in: ${locations.join(', ')}` };
  }

  return {
    applicable: true,
    passed: false,
    message: `No memory file mentions "${artifactName}"`,
  };
}

/**
 * Check 6: Schema Validation (simplified - checks structure)
 */
function checkSchemaValidation(artifactPath, artifactType, _artifactName) {
  const content = readFileSafe(artifactPath);
  if (!content) {
    return { applicable: true, passed: false, message: 'Could not read artifact file' };
  }

  // Basic structure checks based on type
  if (artifactType === 'agent' || artifactType === 'workflow') {
    // Check for YAML frontmatter
    if (!content.startsWith('---') && !content.includes('# ')) {
      return { applicable: true, passed: false, message: 'Missing frontmatter or header' };
    }
  }

  if (artifactType === 'skill') {
    // Check for skill structure
    if (!content.includes('## ') && !content.includes('# ')) {
      return { applicable: true, passed: false, message: 'Missing skill structure' };
    }
  }

  if (artifactType === 'hook') {
    // Check for function export
    if (!content.includes('module.exports') && !content.includes('export ')) {
      return { applicable: true, passed: false, message: 'Missing module export' };
    }
  }

  return { applicable: true, passed: true, message: 'Basic structure validated' };
}

/**
 * Check 7: Tests Passing (checks if test file exists)
 */
function checkTestsExist(artifactPath, artifactType, _artifactName) {
  // Only applicable for hooks and tools
  if (!['hook', 'tool'].includes(artifactType) && !artifactPath.includes('/tools/')) {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  // Look for test file
  const dir = path.dirname(artifactPath);
  const baseName = path.basename(artifactPath, path.extname(artifactPath));
  const testPatterns = [
    `${baseName}.test.cjs`,
    `${baseName}.test.mjs`,
    `${baseName}.test.js`,
    `${baseName}.spec.cjs`,
    `${baseName}.spec.mjs`,
    `${baseName}.spec.js`,
  ];

  for (const pattern of testPatterns) {
    const testPath = path.join(dir, pattern);
    if (fs.existsSync(testPath)) {
      return { applicable: true, passed: true, message: `Test file found: ${pattern}` };
    }
  }

  return {
    applicable: true,
    passed: false,
    message: 'No test file found',
  };
}

/**
 * Check 8: Documentation Complete
 */
/** Placeholder strings used for artifact completeness checks (intentional list, not unfinished work). */
const PLACEHOLDER_STRINGS = [
  'TODO',
  'TBD',
  'FIXME',
  '<fill',
  '[fill',
  '{{',
  '}}',
  '<placeholder',
  '[placeholder',
];

function checkDocumentationComplete(artifactPath, _artifactType, _artifactName) {
  const content = readFileSafe(artifactPath);
  if (!content) {
    return { applicable: true, passed: false, message: 'Could not read artifact file' };
  }

  const foundPlaceholders = [];
  for (const placeholder of PLACEHOLDER_STRINGS) {
    if (content.toLowerCase().includes(placeholder.toLowerCase())) {
      foundPlaceholders.push(placeholder);
    }
  }

  if (foundPlaceholders.length > 0) {
    return {
      applicable: true,
      passed: false,
      message: `Found placeholders: ${foundPlaceholders.join(', ')}`,
    };
  }

  return { applicable: true, passed: true, message: 'No placeholder text found' };
}

/**
 * Check 9: Evolution State Updated
 */
function checkEvolutionState(artifactPath, artifactType, artifactName) {
  const stateContent = readFileSafe(EVOLUTION_STATE);
  if (!stateContent) {
    return { applicable: true, passed: false, message: 'Could not read evolution-state.json' };
  }

  const hasEntry = stateContent.toLowerCase().includes(artifactName.toLowerCase());

  if (hasEntry) {
    return { applicable: true, passed: true, message: `Found in evolution-state.json` };
  }

  return {
    applicable: true,
    passed: false,
    message: `No evolution state entry for "${artifactName}"`,
  };
}

/**
 * Check 10: Router Discoverability (heuristic check)
 */
async function checkRouterDiscoverability(artifactPath, artifactType, artifactName) {
  if (!['agent', 'skill'].includes(artifactType)) {
    return { applicable: false, passed: true, message: 'Not applicable for this artifact type' };
  }

  // For agents: need CLAUDE.md + routing-table
  // For skills: need catalog + agent assignment

  if (artifactType === 'agent') {
    const claudeCheck = await checkClaudeMdRouting(artifactPath, artifactType, artifactName);
    const routerCheck = await checkRoutingTable(artifactPath, artifactType, artifactName);

    if (claudeCheck.passed && routerCheck.passed) {
      return { applicable: true, passed: true, message: 'Agent is discoverable by Router' };
    }

    return {
      applicable: true,
      passed: false,
      message: 'Agent may not be discoverable - check CLAUDE.md and routing-table',
    };
  }

  if (artifactType === 'skill') {
    const catalogCheck = checkSkillCatalog(artifactPath, artifactType, artifactName);
    const assignmentCheck = checkAgentAssignment(artifactPath, artifactType, artifactName);

    if (catalogCheck.passed && assignmentCheck.passed) {
      return { applicable: true, passed: true, message: 'Skill is discoverable by agents' };
    }

    return {
      applicable: true,
      passed: false,
      message: 'Skill may not be discoverable - check catalog and agent assignments',
    };
  }

  return { applicable: false, passed: true, message: 'Not applicable' };
}

/**
 * Check 11: Semver Version Field (validates version field is valid semver)
 */
function checkSemverVersion(artifactPath, _artifactType, _artifactName) {
  const content = readFileSafe(artifactPath);
  if (!content) {
    return { applicable: false, passed: true, message: 'Could not read file' };
  }

  // Extract version from YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { applicable: false, passed: true, message: 'No frontmatter — version check skipped' };
  }

  const versionMatch = frontmatterMatch[1].match(/^version:\s*(.+)$/m);
  if (!versionMatch) {
    return { applicable: false, passed: true, message: 'No version field in frontmatter' };
  }

  const versionStr = versionMatch[1].trim().replace(/^['"]|['"]$/g, '');
  const parsed = parseSemver(versionStr);
  if (!parsed.valid) {
    return {
      applicable: true,
      passed: false,
      message: `Invalid semver in version field: '${versionStr}' — expected MAJOR.MINOR.PATCH`,
    };
  }

  return {
    applicable: true,
    passed: true,
    message: `Version field valid: ${versionStr}`,
  };
}

/**
 * Run all checks for an artifact.
 */
async function validateArtifact(artifactPath) {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.join(process.cwd(), artifactPath);

  // Check if artifact exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Artifact not found: ${absolutePath}`);
    return { passed: false, exitCode: 2 };
  }

  const artifactType = getArtifactType(absolutePath);
  const artifactName = getArtifactName(absolutePath);

  console.log('\n===============================================');
  console.log(' POST-CREATION VALIDATION');
  console.log('===============================================');
  console.log(`Artifact: ${artifactPath}`);
  console.log(`Type: ${artifactType}`);
  console.log(`Name: ${artifactName}`);
  console.log('-----------------------------------------------\n');

  const checks = [
    { name: '1. CLAUDE.md Routing Entry', fn: checkClaudeMdRouting },
    { name: '2. Skill Catalog Entry', fn: checkSkillCatalog },
    { name: '3. Routing Table Keywords', fn: checkRoutingTable },
    { name: '4. Agent Assignment', fn: checkAgentAssignment },
    { name: '5. Memory File Updates', fn: checkMemoryFiles },
    { name: '6. Schema Validation', fn: checkSchemaValidation },
    { name: '7. Tests Exist', fn: checkTestsExist },
    { name: '8. Documentation Complete', fn: checkDocumentationComplete },
    { name: '9. Evolution State Updated', fn: checkEvolutionState },
    { name: '10. Router Discoverability', fn: checkRouterDiscoverability },
    { name: '11. Semver Version Field', fn: checkSemverVersion },
  ];

  let failedCount = 0;
  let passedCount = 0;
  let skippedCount = 0;

  for (const check of checks) {
    let result;
    if (
      check.fn.constructor.name === 'AsyncFunction' ||
      check.name === '1. CLAUDE.md Routing Entry' ||
      check.name === '3. Routing Table Keywords' ||
      check.name === '10. Router Discoverability'
    ) {
      result = await check.fn(absolutePath, artifactType, artifactName);
    } else {
      result = check.fn(absolutePath, artifactType, artifactName);
    }

    let status;
    if (!result.applicable) {
      status = 'SKIP';
      skippedCount++;
    } else if (result.passed) {
      status = 'PASS';
      passedCount++;
    } else {
      status = 'FAIL';
      failedCount++;
    }

    const statusStr = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    console.log(`${statusStr} ${check.name}`);
    console.log(`       ${result.message}\n`);
  }

  console.log('-----------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped`);
  console.log('===============================================\n');

  if (failedCount > 0) {
    console.log('VALIDATION FAILED - Fix the issues above before marking task complete.\n');
    return { passed: false, exitCode: 1 };
  }

  console.log('VALIDATION PASSED - Artifact is properly integrated.\n');
  return { passed: true, exitCode: 0 };
}

/**
 * Get recently created artifacts from evolution state.
 */
function getRecentArtifacts(hoursAgo = 24) {
  const stateContent = readFileSafe(EVOLUTION_STATE);
  if (!stateContent) return [];

  try {
    const state = safeParseJSON(stateContent);
    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;
    const recent = [];

    // Check currentEvolution
    if (state.currentEvolution?.artifacts) {
      for (const artifact of state.currentEvolution.artifacts) {
        if (artifact.path) {
          recent.push(path.join(PROJECT_ROOT, artifact.path));
        }
      }
    }

    // Check completed evolutions
    if (state.evolutions) {
      for (const evolution of state.evolutions) {
        const completedAt = new Date(evolution.completedAt).getTime();
        if (completedAt > cutoff && evolution.path) {
          recent.push(path.join(PROJECT_ROOT, evolution.path));
        }
      }
    }

    return recent;
  } catch (err) {
    console.error('Error parsing evolution state:', err.message);
    return [];
  }
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: validate-integration.cjs <artifact-path>
       validate-integration.cjs --recent
       validate-integration.cjs --all

Options:
  <artifact-path>  Path to the artifact to validate
  --recent         Validate recently created artifacts (last 24 hours)
  --all            Validate all artifacts in evolution state
  --help, -h       Show this help message

Exit codes:
  0 = All checks passed
  1 = One or more checks failed
  2 = Invalid arguments or artifact not found
`);
    process.exit(0);
  }

  if (args.includes('--recent')) {
    const recent = getRecentArtifacts(24);
    if (recent.length === 0) {
      console.log('No recently created artifacts found.\n');
      process.exit(0);
    }

    console.log(`Found ${recent.length} recently created artifact(s).\n`);

    let anyFailed = false;
    for (const artifactPath of recent) {
      if (fs.existsSync(artifactPath)) {
        const result = await validateArtifact(artifactPath);
        if (!result.passed) anyFailed = true;
      } else {
        console.log(`Skipping (not found): ${artifactPath}\n`);
      }
    }

    process.exit(anyFailed ? 1 : 0);
  }

  // Validate single artifact
  const result = await validateArtifact(args[0]);
  process.exit(result.exitCode);
}

// Run if called directly
const wrappedMain = wrapCLITool(main, 'validate-integration');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  validateArtifact,
  getRecentArtifacts,
  // Exported for integration-level testing (Bug 1 & Bug 2 regression guards)
  _catalogHasEntry,
  _claudeMdHasEntry,
  stripFencesAndHeadings,
};
