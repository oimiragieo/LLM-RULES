#!/usr/bin/env node
/**
 * Framework Doctor
 *
 * Single command to validate the health of the .claude framework:
 * 1. Check required directories exist
 * 2. Validate agents have proper structure
 * 3. Validate skills have proper structure
 * 4. Detect doc/path drift
 * 5. Check hook configurations
 * 6. Verify MCP server configs
 *
 * Usage:
 *   node doctor.mjs           Run all checks
 *   node doctor.mjs --fix     Attempt to fix issues
 *   node doctor.mjs --verbose Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

// Parse arguments
const args = process.argv.slice(2);
const FIX_MODE = args.includes('--fix');
const VERBOSE = args.includes('--verbose');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color, msg) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// Required directories
const REQUIRED_DIRS = [
  '.claude/agents/core',
  '.claude/agents/specialized',
  '.claude/agents/domain',
  '.claude/agents/orchestrators',
  '.claude/skills',
  '.claude/tools',
  '.claude/hooks/routing',
  '.claude/hooks/safety',
  '.claude/context/memory',
  '.claude/context/reports',
  '.claude/context/runtime',
  '.claude/context/plans',
  '.claude/context/tmp',
  '.claude/context/artifacts',
  '.claude/context/sessions',
  '.claude/schemas',
  '.claude/workflows',
  '.claude/docs',
];

// Required files
const REQUIRED_FILES = ['.claude/CLAUDE.md', '.claude/settings.json', '.claude/config.yaml'];

// Track results
const results = {
  passed: 0,
  warnings: 0,
  errors: 0,
  fixed: 0,
};

function hasUnpinnedMcpPackageArg(args = []) {
  if (!Array.isArray(args)) return false;
  return args.some(arg => /^@modelcontextprotocol\/[^@\s]+$/.test(String(arg || '').trim()));
}

/**
 * Check if directory exists, optionally create it
 */
function checkDir(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    if (VERBOSE) log('green', `  ✓ ${relPath}`);
    results.passed++;
    return true;
  }

  if (FIX_MODE) {
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, '.gitkeep'), `# ${path.basename(relPath)} directory\n`);
    log('yellow', `  ✓ ${relPath} (created)`);
    results.fixed++;
    return true;
  }

  log('red', `  ✗ ${relPath} (missing)`);
  results.errors++;
  return false;
}

/**
 * Check if file exists
 */
function checkFile(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    if (VERBOSE) log('green', `  ✓ ${relPath}`);
    results.passed++;
    return true;
  }

  log('red', `  ✗ ${relPath} (missing)`);
  results.errors++;
  return false;
}

/**
 * Parse YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

/**
 * Validate agents
 */
function validateAgents() {
  console.log('\n📋 Validating Agents...');

  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  if (!fs.existsSync(agentsDir)) {
    log('red', '  ✗ Agents directory not found');
    results.errors++;
    return;
  }

  let agentCount = 0;
  let validCount = 0;

  function scanAgents(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanAgents(fullPath);
      } else if (entry.name.endsWith('.md')) {
        agentCount++;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const fm = parseFrontmatter(content);
          if (fm && fm.name) {
            validCount++;
            if (VERBOSE) log('green', `  ✓ ${entry.name}`);
          } else {
            log('yellow', `  ⚠ ${entry.name} (missing frontmatter)`);
            results.warnings++;
          }
        } catch (_e) {
          log('red', `  ✗ ${entry.name} (read error)`);
          results.errors++;
        }
      }
    }
  }

  scanAgents(agentsDir);
  log('dim', `  Found ${agentCount} agents, ${validCount} valid`);
  results.passed += validCount;
}

/**
 * Validate skills
 */
function validateSkills() {
  console.log('\n🔧 Validating Skills...');

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) {
    log('red', '  ✗ Skills directory not found');
    results.errors++;
    return;
  }

  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  let validCount = 0;
  let scaffoldCount = 0;

  for (const skill of skills) {
    const skillPath = path.join(skillsDir, skill, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      if (VERBOSE) log('yellow', `  ⚠ ${skill} (no SKILL.md)`);
      results.warnings++;
      continue;
    }

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const fm = parseFrontmatter(content);
      if (fm && fm.name) {
        validCount++;

        // Check if main.cjs is scaffold (use constant so grep for "TODO" does not flag this file)
        const SCAFFOLD_MARKER = 'TODO' + ': Implement skill logic here';
        const mainPath = path.join(skillsDir, skill, 'scripts', 'main.cjs');
        if (fs.existsSync(mainPath)) {
          const mainContent = fs.readFileSync(mainPath, 'utf-8');
          if (mainContent.includes(SCAFFOLD_MARKER)) {
            scaffoldCount++;
          }
        }
      }
    } catch (_e) {
      log('red', `  ✗ ${skill} (error reading)`);
      results.errors++;
    }
  }

  log('dim', `  Found ${skills.length} skills, ${validCount} valid, ${scaffoldCount} scaffolds`);
  results.passed += validCount;
  if (scaffoldCount > 0) {
    log(
      'yellow',
      `  ⚠ ${scaffoldCount} skills are implemented as scaffolds (main.cjs contains scaffold marker).`
    );
  }
}

/**
 * Check hooks configuration
 */
function validateHooks() {
  console.log('\n🪝 Validating Hooks...');

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    log('red', '  ✗ settings.json not found');
    results.errors++;
    return;
  }

  try {
    const settings = safeParseJSON(fs.readFileSync(settingsPath, 'utf-8'));
    const hooks = settings.hooks || {};

    for (const [event, handlers] of Object.entries(hooks)) {
      for (const handler of handlers) {
        for (const hook of handler.hooks || []) {
          if (hook.command) {
            // Extract script path from command
            const match = hook.command.match(/node\s+([^\s]+)/);
            if (match) {
              const scriptPath = path.join(PROJECT_ROOT, match[1]);
              if (fs.existsSync(scriptPath)) {
                if (VERBOSE) log('green', `  ✓ ${event}: ${match[1]}`);
                results.passed++;
              } else {
                log('red', `  ✗ ${event}: ${match[1]} (script not found)`);
                results.errors++;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    log('red', `  ✗ Error parsing settings.json: ${e.message}`);
    results.errors++;
  }
}

/**
 * Check MCP configuration
 */
function validateMcp() {
  console.log('\n🔌 Validating MCP Configuration...');

  const mcpPath = path.join(CLAUDE_DIR, '.mcp.json');
  if (!fs.existsSync(mcpPath)) {
    log('yellow', '  ⚠ .mcp.json not found (optional)');
    return;
  }

  try {
    const mcp = safeParseJSON(fs.readFileSync(mcpPath, 'utf-8'));
    const servers = mcp.mcpServers || {};

    // Check for version pins
    let unpinned = 0;
    for (const [name, config] of Object.entries(servers)) {
      if (hasUnpinnedMcpPackageArg(config.args)) {
        unpinned++;
        log('yellow', `  ⚠ ${name}: no version pin`);
      } else {
        if (VERBOSE) log('green', `  ✓ ${name}`);
        results.passed++;
      }
    }

    if (unpinned > 0) {
      log('dim', `  Consider pinning MCP server versions for reproducibility`);
      results.warnings += unpinned;
    }
  } catch (e) {
    log('red', `  ✗ Error parsing .mcp.json: ${e.message}`);
    results.errors++;
  }
}

function isDirectRun() {
  const mainArg = process.argv[1];
  if (!mainArg) return false;
  return import.meta.url === pathToFileURL(path.resolve(mainArg)).href;
}

/**
 * Check CLI/env dependencies for skills that wrap external tools.
 * If a CLI-wrapper skill is present, doctor runs the corresponding command and warns if missing.
 */
function checkEnvCli() {
  console.log('\n🔧 Checking CLI/Env Dependencies (skill wrappers)...');

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) return;

  const cliChecks = [
    { skill: 'aws-cloud-ops', cmd: 'aws', args: ['--version'] },
    { skill: 'gcloud-cli', cmd: 'gcloud', args: ['--version'] },
    { skill: 'docker-compose', cmd: 'docker', args: ['compose', 'version'] },
    { skill: 'kubernetes-flux', cmd: 'flux', args: ['--version'] },
    { skill: 'terraform-infra', cmd: 'terraform', args: ['--version'] },
    { skill: 'github-ops', cmd: 'gh', args: ['--version'] },
    { skill: 'git-expert', cmd: 'git', args: ['--version'] },
  ];

  for (const { skill, cmd, args } of cliChecks) {
    const skillPath = path.join(skillsDir, skill);
    if (!fs.existsSync(skillPath)) continue;

    const out = spawnSync(cmd, args, { encoding: 'utf8', shell: false, windowsHide: true });
    if (out.status !== 0 && out.status !== null) {
      log(
        'yellow',
        `  ⚠ ${skill}: \`${cmd}\` not found or failed (install per skill SKILL.md → Installation)`
      );
      results.warnings++;
    } else if (VERBOSE) {
      log('green', `  ✓ ${skill}: ${cmd} available`);
    }
  }

  const sequentialThinkingSkill = path.join(skillsDir, 'sequential-thinking');
  const executorPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'optimization',
    'sequential-thinking',
    'executor.py'
  );
  if (fs.existsSync(sequentialThinkingSkill) && !fs.existsSync(executorPath)) {
    log(
      'yellow',
      '  ⚠ sequential-thinking: executor.py not found; full functionality requires .claude/tools/optimization/sequential-thinking/executor.py'
    );
    results.warnings++;
  } else if (fs.existsSync(sequentialThinkingSkill) && fs.existsSync(executorPath) && VERBOSE) {
    log('green', '  ✓ sequential-thinking: executor.py present');
  }
}

/**
 * Check for doc/path drift
 */
function validateDocPaths() {
  console.log('\n📖 Checking Doc/Path References...');

  const docsToCheck = ['.claude/docs/ARCHITECTURE.md', '.claude/CLAUDE.md'];

  const pathPattern = /\.claude\/[a-zA-Z0-9_\-/.]+/g;
  let driftCount = 0;

  for (const docPath of docsToCheck) {
    const fullPath = path.join(PROJECT_ROOT, docPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    const matches = content.match(pathPattern) || [];

    for (const match of matches) {
      // Skip code blocks and common patterns
      if (match.includes('*.') || match.includes('**')) continue;

      const refPath = path.join(PROJECT_ROOT, match);
      if (!fs.existsSync(refPath) && !fs.existsSync(refPath + '/')) {
        if (VERBOSE) log('yellow', `  ⚠ ${docPath} references missing: ${match}`);
        driftCount++;
      }
    }
  }

  if (driftCount > 0) {
    log('yellow', `  Found ${driftCount} potentially drifted path references`);
    results.warnings += driftCount;
  } else {
    log('green', '  ✓ No obvious path drift detected');
    results.passed++;
  }
}

/**
 * Main
 */
async function main() {
  console.log('\n🩺 Claude Framework Doctor');
  console.log('═'.repeat(50));

  if (FIX_MODE) {
    log('cyan', '\nRunning in FIX mode - will attempt to repair issues\n');
  }

  // Check directories
  console.log('\n📁 Checking Required Directories...');
  for (const dir of REQUIRED_DIRS) {
    checkDir(dir);
  }

  // Check files
  console.log('\n📄 Checking Required Files...');
  for (const file of REQUIRED_FILES) {
    checkFile(file);
  }

  // Validate components
  validateAgents();
  validateSkills();
  validateHooks();
  validateMcp();
  checkEnvCli();
  validateDocPaths();

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('\n📊 Summary');
  console.log('─'.repeat(30));
  log('green', `  Passed:   ${results.passed}`);
  log('yellow', `  Warnings: ${results.warnings}`);
  log('red', `  Errors:   ${results.errors}`);
  if (FIX_MODE) {
    log('cyan', `  Fixed:    ${results.fixed}`);
  }

  if (results.errors === 0) {
    log('green', '\n✅ Framework is healthy!\n');
    process.exit(0);
  } else {
    log('red', `\n❌ Found ${results.errors} issues. Run with --fix to attempt repairs.\n`);
    process.exit(1);
  }
}

if (isDirectRun()) {
  main().catch(console.error);
}

export { hasUnpinnedMcpPackageArg, isDirectRun };
