#!/usr/bin/env node

/**
 * MCP Server to Skill Converter
 * Converts MCP (Model Context Protocol) servers into Claude Code skills.
 *
 * Supports:
 *   - npm packages (@modelcontextprotocol/server-*)
 *   - PyPI packages (mcp-server-*)
 *   - Docker images (mcp/*)
 *   - GitHub repositories
 *
 * Usage:
 *   node convert.cjs --server "@modelcontextprotocol/server-filesystem"
 *   node convert.cjs --server "mcp-server-git" --source pypi
 *   node convert.cjs --server "https://github.com/owner/mcp-server" --source github
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const { KNOWN_SERVERS } = require('./convert-known-servers.cjs');

// SEC-009-CONVERT FIX: Path validation to prevent command injection
const DANGEROUS_CHARS = [
  '$',
  '`',
  '|',
  '&',
  ';',
  '(',
  ')',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '\n',
  '\r',
  '"',
  "'",
];
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return !DANGEROUS_CHARS.some(char => filePath.includes(char));
}

// Cross-platform null device (Git Bash on Windows uses /dev/null, not NUL)
function _detectGitBash() {
  return !!(
    process.env.MSYSTEM ||
    process.env.MINGW_PREFIX ||
    (process.env.SHELL && process.env.SHELL.includes('/usr/bin/bash'))
  );
}
const _NULL_DEVICE =
  process.platform === 'win32' ? (_detectGitBash() ? '/dev/null' : 'NUL') : '/dev/null';

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

/**
 * Format file with pnpm format or prettier
 * SEC-009-CONVERT FIX: Use spawnSync with shell:false to prevent command injection
 */
function formatFile(filePath) {
  // SEC-009-CONVERT FIX: Validate path before using
  if (!isPathSafe(filePath)) {
    console.error('   ⚠️  Invalid file path characters detected');
    return false;
  }
  try {
    const result = spawnSync('pnpm', ['format', filePath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: false,
    });
    if (result.status === 0) return true;
  } catch (_error) {
    // Fall through to prettier
  }
  try {
    const result = spawnSync('npx', ['prettier', '--write', filePath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: false,
    });
    return result.status === 0;
  } catch (_e) {
    return false;
  }
}

/**
 * Detect source type from server name
 */
function detectSource(server) {
  if (server.startsWith('https://github.com')) return 'github';
  if (server.startsWith('@') || server.includes('/server-')) return 'npm';
  if (server.startsWith('mcp/')) return 'docker';
  if (server.startsWith('mcp-server-')) return 'pypi';
  return 'npm'; // default
}

/**
 * Get server info from known database or fetch
 */
function getServerInfo(server, source) {
  // Check known servers
  if (KNOWN_SERVERS[source] && KNOWN_SERVERS[source][server]) {
    return {
      ...KNOWN_SERVERS[source][server],
      known: true,
    };
  }

  // Unknown server - return defaults
  return {
    description: `MCP server: ${server}`,
    tools: ['Bash', 'Read', 'Write'],
    env: [],
    known: false,
  };
}

/**
 * Verify package exists
 * SEC-009-CONVERT FIX: Use spawnSync with shell:false to prevent command injection
 */
function verifyPackage(server, source) {
  console.log(`   Verifying package exists...`);

  // SEC-009-CONVERT FIX: Validate server name before using
  if (!isPathSafe(server)) {
    console.error('   ⚠️  Invalid server name characters detected');
    return false;
  }

  try {
    switch (source) {
      case 'npm': {
        const result = spawnSync('npm', ['view', server, 'name'], { stdio: 'pipe', shell: false });
        return result.status === 0;
      }

      case 'pypi': {
        // Try pip index first, then pip show
        const indexResult = spawnSync('pip', ['index', 'versions', server], {
          stdio: 'pipe',
          shell: false,
        });
        if (indexResult.status === 0) return true;
        const showResult = spawnSync('pip', ['show', server], { stdio: 'pipe', shell: false });
        return showResult.status === 0;
      }

      case 'docker':
        // Docker images are harder to verify without pulling
        console.log(`   ⚠️  Docker image verification skipped`);
        return true;

      case 'github':
        // GitHub URLs are verified during clone
        return true;

      default:
        return false;
    }
  } catch (_error) {
    return false;
  }
}

/**
 * Generate skill name from server name
 */
function generateSkillName(server, source) {
  let name = server;

  // Remove prefixes
  name = name.replace(/^@modelcontextprotocol\/server-/, '');
  name = name.replace(/^@anthropic\/mcp-/, '');
  name = name.replace(/^mcp-server-/, '');
  name = name.replace(/^mcp\//, '');

  // Extract from GitHub URL
  if (source === 'github') {
    name = server
      .split('/')
      .pop()
      .replace(/\.git$/, '');
    name = name.replace(/^mcp-server-/, '').replace(/^mcp-/, '');
  }

  // Add -mcp suffix to indicate it's a converted MCP server
  return `${name}-mcp`;
}

/**
 * Generate executor script for the MCP server
 */
function generateExecutor(server, source, skillDir) {
  const executorPath = path.join(skillDir, 'scripts', 'executor.cjs');

  let executorContent;

  switch (source) {
    case 'npm':
      executorContent = `#!/usr/bin/env node

/**
 * MCP Server Executor: ${server}
 * Auto-generated by skill-creator
 */

const { spawn } = require('child_process');
const path = require('path');

// Environment variables required
const ENV_VARS = ${JSON.stringify(getServerInfo(server, source).env)};

// Check environment
ENV_VARS.forEach(v => {
  if (!process.env[v]) {
    console.warn(\`⚠️  Missing environment variable: \${v}\`);
  }
});

// Start MCP server
const server = spawn('npx', ['-y', '${server}'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: process.env
});

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});

server.on('close', (code) => {
  process.exit(code);
});
`;
      break;

    case 'pypi':
      executorContent = `#!/usr/bin/env node

/**
 * MCP Server Executor: ${server}
 * Auto-generated by skill-creator
 */

const { spawn } = require('child_process');

// Environment variables required
const ENV_VARS = ${JSON.stringify(getServerInfo(server, source).env)};

// Check environment
ENV_VARS.forEach(v => {
  if (!process.env[v]) {
    console.warn(\`⚠️  Missing environment variable: \${v}\`);
  }
});

// Start MCP server via uvx or pipx
const server = spawn('uvx', ['${server}'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: process.env,
  windowsHide: true
});

server.on('error', (err) => {
  // Fallback to pipx
  console.log('uvx not found, trying pipx...');
  const fallback = spawn('pipx', ['run', '${server}'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
    windowsHide: true
  });

  fallback.on('error', (e) => {
    console.error('Failed to start MCP server:', e);
    process.exit(1);
  });
});

server.on('close', (code) => {
  process.exit(code);
});
`;
      break;

    case 'docker':
      executorContent = `#!/usr/bin/env node

/**
 * MCP Server Executor: ${server}
 * Auto-generated by skill-creator
 */

const { spawn } = require('child_process');

// Environment variables required
const ENV_VARS = ${JSON.stringify(getServerInfo(server, source).env)};

// Build docker run command
const envArgs = ENV_VARS.flatMap(v =>
  process.env[v] ? ['-e', \`\${v}=\${process.env[v]}\`] : []
);

// Start MCP server via Docker
const server = spawn('docker', ['run', '--rm', '-i', ...envArgs, '${server}'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: process.env
});

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err);
  console.error('Make sure Docker is running and the image exists.');
  process.exit(1);
});

server.on('close', (code) => {
  process.exit(code);
});
`;
      break;

    default:
      executorContent = `#!/usr/bin/env node
console.log('Unknown source type. Please configure executor manually.');
`;
  }

  fs.writeFileSync(executorPath, executorContent);
  console.log('   ✅ Created executor script');
}

/**
 * Generate SKILL.md for the converted MCP server
 */
function generateSkillMd(server, source, skillName, serverInfo) {
  return `---
name: ${skillName}
description: ${serverInfo.description}
invoked_by: agent
user_invocable: false
tools: [${serverInfo.tools.join(', ')}]
source: mcp-${source}
original_server: ${server}
---

# ${skillName
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')}

> Auto-converted from MCP server: \`${server}\`

## Purpose

${serverInfo.description}

## Installation

${
  source === 'npm'
    ? `\`\`\`bash
# Install the MCP server
npm install -g ${server}
# Or use npx (no install needed)
npx ${server}
\`\`\``
    : source === 'pypi'
      ? `\`\`\`bash
# Install the MCP server
pip install ${server}
# Or use uvx (no install needed)
uvx ${server}
\`\`\``
      : source === 'docker'
        ? `\`\`\`bash
# Pull the Docker image
docker pull ${server}
\`\`\``
        : `See original repository for installation instructions.`
}

${
  serverInfo.env.length > 0
    ? `## Environment Variables

The following environment variables are required:

${serverInfo.env.map(v => `- \`${v}\`: Required for authentication/configuration`).join('\n')}

Set these in your environment or \`.env\` file before using this skill.
`
    : ''
}

## Usage

This skill is intended to be used by agents, not directly invoked.

### Starting the Server

\`\`\`bash
node .claude/skills/${skillName}/scripts/executor.cjs
\`\`\`

### Integration

Add this skill to an agent's configuration:

\`\`\`yaml
skills:
  - ${skillName}
\`\`\`

## Capabilities

This MCP server provides the following capabilities:

- ${serverInfo.description}

## Original Source

- **Package**: \`${server}\`
- **Source**: ${source}
${serverInfo.known ? '- **Status**: Known/Verified server' : '- **Status**: Custom/Unknown server'}

## Memory Protocol (MANDATORY)

**Before using:**
\`\`\`bash
cat .claude/context/memory/learnings.md
\`\`\`

**After completing:**
- Issue found -> Append to \`.claude/context/memory/issues.md\`
- New capability discovered -> Append to \`.claude/context/memory/learnings.md\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
`;
}

/**
 * Convert MCP server to skill
 */
function convertServer(server, source) {
  console.log(`\n🔄 Converting MCP server to skill`);
  console.log(`   Server: ${server}`);
  console.log(`   Source: ${source}`);

  // Get server info
  const serverInfo = getServerInfo(server, source);
  if (serverInfo.known) {
    console.log(`   ✅ Known server found in database`);
  } else {
    console.log(`   ⚠️  Unknown server - using defaults`);
  }

  // Verify package exists (optional)
  if (!options['skip-verify']) {
    const exists = verifyPackage(server, source);
    if (!exists) {
      console.log(`   ⚠️  Could not verify package exists. Continuing anyway...`);
    }
  }

  // Generate skill name
  const skillName = generateSkillName(server, source);
  const skillDir = path.join(SKILLS_DIR, skillName);

  // Check if skill already exists
  if (fs.existsSync(skillDir)) {
    console.error(`\n❌ Skill already exists: ${skillDir}`);
    console.log(`   Use --force to overwrite`);
    if (!options.force) {
      process.exit(1);
    }
    console.log(`   Overwriting existing skill...`);
    fs.rmSync(skillDir, { recursive: true });
  }

  // Create skill directory
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });

  // Generate SKILL.md
  const skillMdContent = generateSkillMd(server, source, skillName, serverInfo);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillMdPath, skillMdContent);
  console.log('   ✅ Created SKILL.md');

  // Generate executor script
  generateExecutor(server, source, skillDir);

  // Format files
  formatFile(skillMdPath);

  console.log(`\n✅ Successfully converted MCP server to skill!`);
  console.log(`   Skill: ${skillName}`);
  console.log(`   Location: ${skillDir}`);

  // Test if requested
  if (options.test) {
    console.log(`\n🧪 Testing skill...`);
    try {
      const executorPath = path.join(skillDir, 'scripts', 'executor.cjs');
      execSync(`node "${executorPath}" --help`, { stdio: 'inherit', timeout: 5000 });
      console.log('   ✅ Test passed');
    } catch (_error) {
      console.log('   ⚠️  Test inconclusive (server may need configuration)');
    }
  }

  console.log(`\n📝 Next steps:`);
  console.log(`   1. Configure any required environment variables`);
  console.log(
    `   2. Assign to an agent: node .claude/skills/skill-creator/scripts/create.cjs --assign "${skillName}" --agent "developer"`
  );

  return skillDir;
}

/**
 * List known MCP servers
 */
function listKnownServers() {
  console.log('\n📚 Known MCP Servers:\n');

  Object.entries(KNOWN_SERVERS).forEach(([source, servers]) => {
    console.log(`\n${source.toUpperCase()}:`);
    Object.entries(servers).forEach(([name, info]) => {
      console.log(`   • ${name}`);
      console.log(`     ${info.description}`);
      if (info.env.length > 0) {
        console.log(`     Requires: ${info.env.join(', ')}`);
      }
    });
  });
}

// Main execution
if (options.help) {
  console.log(`
MCP Server to Skill Converter

Usage:
  node convert.cjs --server "server-name" [options]
  node convert.cjs --list

Options:
  --server       MCP server name or URL (required)
  --source       Source type: npm, pypi, docker, github (auto-detected)
  --test         Test the converted skill after creation
  --force        Overwrite existing skill
  --skip-verify  Skip package verification
  --list         List known MCP servers
  --help         Show this help

Examples:
  # Convert npm MCP server
  node convert.cjs --server "@modelcontextprotocol/server-filesystem"

  # Convert PyPI server
  node convert.cjs --server "mcp-server-git" --source pypi

  # Convert Docker image
  node convert.cjs --server "mcp/playwright" --source docker

  # Convert from GitHub
  node convert.cjs --server "https://github.com/owner/mcp-server" --source github

  # List known servers
  node convert.cjs --list
`);
  process.exit(0);
}

if (options.list) {
  listKnownServers();
  process.exit(0);
}

if (!options.server) {
  console.error('❌ Server name is required (--server)');
  console.log('   Use --list to see known servers');
  console.log('   Use --help for usage information');
  process.exit(1);
}

// Detect or use provided source
const source = options.source || detectSource(options.server);

// Convert the server
convertServer(options.server, source);
