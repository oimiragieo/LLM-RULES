/**
 * @file .claude/lib/validation/ci-gate-layers.cjs
 * @description CI validation gate - 4-layer artifact validation
 *
 * Validates artifact integrity across the framework:
 * - Layer 1: File existence (referenced files exist on disk)
 * - Layer 2: Forward references (agents → skills, hooks → modules)
 * - Layer 3: Backward references (orphan detection)
 * - Layer 4: Semantic validation (frontmatter, structure)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

/**
 * Extract .cjs file paths from settings.json hook entries.
 * Handles nested format: { matcher, hooks: [{ type, command }] }
 */
function extractHookPaths(settings) {
  const paths = [];
  if (!settings.hooks) return paths;
  for (const [, hookList] of Object.entries(settings.hooks)) {
    if (!Array.isArray(hookList)) continue;
    for (const hookGroup of hookList) {
      const innerHooks = Array.isArray(hookGroup.hooks) ? hookGroup.hooks : [hookGroup];
      for (const hook of innerHooks) {
        if (typeof hook.path === 'string' && hook.path.endsWith('.cjs')) {
          paths.push(hook.path);
          continue;
        }
        const hookCmd = hook.command || '';
        const matches = hookCmd.match(
          /(?:[A-Za-z]:[\\/][^\s'"]+\.cjs|\.claude[\\/][^\s'"]+\.cjs|\.?[\\/][^\s'"]+\.cjs)/g
        );
        if (matches) paths.push(...matches);
      }
    }
  }
  return paths;
}

function resolveHookPath(projectRoot, hookPath) {
  return path.isAbsolute(hookPath) ? hookPath : path.join(projectRoot, hookPath);
}

function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return frontmatterMatch ? frontmatterMatch[1] : '';
}

function normalizeFrontmatterValue(value) {
  return value
    .trim()
    .replace(/,$/, '')
    .replace(/^['"]|['"]$/g, '');
}

function readFrontmatterScalar(frontmatter, key) {
  const keyPattern = new RegExp(`^${key}:\\s*(.*)$`);
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(keyPattern);
    if (match) return normalizeFrontmatterValue(match[1]);
  }
  return '';
}

function readFrontmatterList(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const keyPattern = new RegExp(`^${key}:\\s*(.*)$`);

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(keyPattern);
    if (!match) continue;

    const inlineValue = match[1].trim();
    if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
      return inlineValue.slice(1, -1).split(',').map(normalizeFrontmatterValue).filter(Boolean);
    }

    if (inlineValue && inlineValue !== '[]') {
      return [normalizeFrontmatterValue(inlineValue)].filter(Boolean);
    }

    const values = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const itemMatch = lines[j].match(/^\s*-\s+(.+)$/);
      if (itemMatch) {
        values.push(normalizeFrontmatterValue(itemMatch[1]));
        continue;
      }
      if (lines[j].trim() !== '') break;
    }
    return values;
  }

  return [];
}

function readFrontmatterBoolean(frontmatter, key) {
  return readFrontmatterScalar(frontmatter, key).toLowerCase() === 'true';
}

function walkFiles(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Layer 1: Validate file existence
 * Checks that all files referenced in registries exist on disk
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} options - Validation options
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateExistence(projectRoot, options = {}) {
  const errors = [];
  const registryPath =
    options.registryPath || path.join(projectRoot, '.claude/context/agent-registry.json');

  // Check if registry exists
  if (!fs.existsSync(registryPath)) {
    return { valid: true, errors: [] }; // No registry to validate
  }

  try {
    const registryData = safeParseJSON(fs.readFileSync(registryPath, 'utf8'));

    // Validate agent paths
    if (registryData.agents && typeof registryData.agents === 'object') {
      const agentList = Array.isArray(registryData.agents)
        ? registryData.agents
        : Object.values(registryData.agents);
      for (const agent of agentList) {
        const agentPath = agent.filePath || agent.path;
        if (agentPath && !fs.existsSync(agentPath)) {
          errors.push({
            layer: 'existence',
            file: agentPath,
            reason: 'missing',
            message: `Agent file not found: ${agentPath}`,
          });
        }
      }
    }
  } catch (error) {
    errors.push({
      layer: 'existence',
      file: registryPath,
      reason: 'parse-error',
      message: `Failed to parse registry: ${error.message}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Layer 2: Validate forward references
 * Checks that referenced artifacts (skills, hooks) exist
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} options - Validation options
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateForwardRefs(projectRoot, options = {}) {
  const errors = [];
  const agents = options.agents || [];
  const skillsDir = options.skillsDir || path.join(projectRoot, '.claude/skills');
  const settingsPath = options.settingsPath || path.join(projectRoot, '.claude/settings.json');

  // Validate agent skill references
  for (const agentPath of agents) {
    if (!fs.existsSync(agentPath)) continue;

    try {
      const content = fs.readFileSync(agentPath, 'utf8');
      const frontmatter = extractFrontmatter(content);

      if (frontmatter) {
        for (const skill of readFrontmatterList(frontmatter, 'skills')) {
          const skillPath = path.join(skillsDir, skill, 'SKILL.md');
          if (!fs.existsSync(skillPath)) {
            errors.push({
              layer: 'forward-ref',
              source: agentPath,
              target: skill,
              message: `Agent references non-existent skill: ${skill}`,
            });
          }
        }
      }
    } catch (_error) {
      // Skip parse errors for now
    }
  }

  // Validate hook references in settings.json
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = safeParseJSON(fs.readFileSync(settingsPath, 'utf8'));

      if (settings.hooks) {
        for (const hookRelPath of extractHookPaths(settings)) {
          const hookAbsPath = resolveHookPath(projectRoot, hookRelPath);
          if (!fs.existsSync(hookAbsPath)) {
            errors.push({
              layer: 'forward-ref',
              source: settingsPath,
              target: hookRelPath,
              message: `Hook references non-existent module: ${hookRelPath}`,
            });
          }
        }
      }
    } catch (_error) {
      // Skip parse errors
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Layer 3: Validate backward references
 * Detects orphaned artifacts (exist but not referenced)
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} options - Validation options
 * @returns {Promise<{warnings: Array}>}
 */
async function validateBackwardRefs(projectRoot, options = {}) {
  const warnings = [];
  const agents = options.agents || [];
  const skillsDir = options.skillsDir || path.join(projectRoot, '.claude/skills');

  // Collect all skill references from agents
  const referencedSkills = new Set();

  for (const agentPath of agents) {
    if (!fs.existsSync(agentPath)) continue;

    try {
      const content = fs.readFileSync(agentPath, 'utf8');
      const frontmatter = extractFrontmatter(content);

      if (frontmatter) {
        readFrontmatterList(frontmatter, 'skills').forEach(skill => referencedSkills.add(skill));
      }
    } catch (_error) {
      // Skip parse errors
    }
  }

  // Check for orphaned skills
  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('_'))
      .map(dirent => dirent.name);

    for (const skillName of skillDirs) {
      if (referencedSkills.has(skillName)) continue;

      const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
      let skillFrontmatter = '';
      if (fs.existsSync(skillPath)) {
        try {
          skillFrontmatter = extractFrontmatter(fs.readFileSync(skillPath, 'utf8'));
        } catch (_error) {
          // Semantic validation reports unreadable skill files.
        }
      }

      const metadataAgents = readFrontmatterList(skillFrontmatter, 'agents');
      const isUserInvocable = readFrontmatterBoolean(skillFrontmatter, 'user_invocable');
      const invokedBy = readFrontmatterScalar(skillFrontmatter, 'invoked_by').toLowerCase();
      const hasKnownConsumer =
        metadataAgents.length > 0 ||
        isUserInvocable ||
        invokedBy === 'user' ||
        invokedBy === 'both' ||
        invokedBy === 'skill';

      if (!hasKnownConsumer) {
        warnings.push({
          layer: 'backward-ref',
          artifact: skillName,
          reason: 'orphaned',
          message: `Skill not referenced by any agent: ${skillName}`,
        });
      }
    }
  }

  // Registered hooks have a settings.json consumer. If hooksDir is explicitly
  // supplied, report hook files that are present on disk but not registered.
  const settingsPath = options.settingsPath || path.join(projectRoot, '.claude/settings.json');
  const registeredHookPaths = new Set();
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = safeParseJSON(fs.readFileSync(settingsPath, 'utf8'));

      if (settings.hooks) {
        for (const hookRelPath of extractHookPaths(settings)) {
          registeredHookPaths.add(path.resolve(resolveHookPath(projectRoot, hookRelPath)));
        }
      }
    } catch (_error) {
      // Skip parse errors
    }
  }

  if (options.hooksDir && fs.existsSync(options.hooksDir)) {
    const hookFiles = walkFiles(options.hooksDir, filePath => filePath.endsWith('.cjs'));
    for (const hookPath of hookFiles) {
      const resolvedHookPath = path.resolve(hookPath);
      if (!registeredHookPaths.has(resolvedHookPath)) {
        warnings.push({
          layer: 'backward-ref',
          artifact: hookPath,
          hookType: 'unregistered',
          reason: 'unregistered',
          message: `Hook file is not registered in settings: ${path.basename(hookPath)}`,
        });
      }
    }
  }

  return { warnings };
}

/**
 * Layer 4: Validate semantic correctness
 * Checks frontmatter, structure, and conventions
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} options - Validation options
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateSemantic(projectRoot, options = {}) {
  const errors = [];
  const agents = options.agents || [];
  const skillsDir = options.skillsDir || path.join(projectRoot, '.claude/skills');

  // Validate agent frontmatter
  for (const agentPath of agents) {
    if (!fs.existsSync(agentPath)) continue;

    try {
      const content = fs.readFileSync(agentPath, 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        errors.push({
          layer: 'semantic',
          file: agentPath,
          reason: 'missing-frontmatter',
          message: `Agent missing frontmatter: ${agentPath}`,
        });
        continue;
      }

      const frontmatter = frontmatterMatch[1];

      // Check for required 'name:' field
      if (!frontmatter.match(/name:\s*.+/)) {
        errors.push({
          layer: 'semantic',
          file: agentPath,
          reason: 'missing frontmatter field: name',
          message: `Agent missing required frontmatter field 'name': ${agentPath}`,
        });
      }
    } catch (error) {
      errors.push({
        layer: 'semantic',
        file: agentPath,
        reason: 'parse-error',
        message: `Failed to parse agent: ${error.message}`,
      });
    }
  }

  // Validate skill structure
  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== '_archive')
      .map(dirent => dirent.name);

    for (const skillName of skillDirs) {
      const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        errors.push({
          layer: 'semantic',
          file: path.join(skillsDir, skillName),
          reason: 'missing SKILL.md',
          message: `Skill directory missing SKILL.md: ${skillName}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Run all validation layers
 * Orchestrator function that runs all 4 layers and combines results
 *
 * @param {string} projectRoot - Project root directory
 * @param {object} options - Validation options
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array}>}
 */
async function runAllLayers(projectRoot, options = {}) {
  const allErrors = [];
  const allWarnings = [];

  // Layer 1: Existence
  const existenceResult = await validateExistence(projectRoot, options);
  allErrors.push(...existenceResult.errors);

  // Layer 2: Forward refs
  const forwardResult = await validateForwardRefs(projectRoot, options);
  allErrors.push(...forwardResult.errors);

  // Layer 3: Backward refs
  const backwardResult = await validateBackwardRefs(projectRoot, options);
  allWarnings.push(...backwardResult.warnings);

  // Layer 4: Semantic
  const semanticResult = await validateSemantic(projectRoot, options);
  allErrors.push(...semanticResult.errors);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

module.exports = {
  validateExistence,
  validateForwardRefs,
  validateBackwardRefs,
  validateSemantic,
  runAllLayers,
};
