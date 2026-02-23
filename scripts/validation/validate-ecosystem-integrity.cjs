const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CLAUDE_DIR = path.join(ROOT, '.claude');
const errors = [];
const warnings = [];

// Helper: Safely walk directories
function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file.startsWith('.') || file === '_archive') continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, fileList);
    } else {
      // Skip files with .archived extension
      if (!file.endsWith('.archived')) fileList.push(filePath);
    }
  }
  return fileList;
}

// 1. Check for encoding (UTF-16)
function checkEncoding(filePath) {
  const buffer = fs.readFileSync(filePath, { length: 2 });
  if (buffer.length >= 2) {
    if ((buffer[0] === 0xfe && buffer[1] === 0xff) || (buffer[0] === 0xff && buffer[1] === 0xfe)) {
      errors.push(`[ENCODING] File is UTF-16 encoded: ${path.relative(ROOT, filePath)}`);
    }
  }
}

// Test files that use require() inside template literals / fs.writeFileSync for dynamic child scripts.
// The paths in these strings are resolved by a spawned child process (different CWD), not by Node require().
const DYNAMIC_SCRIPT_GENERATORS = new Set([
  'tests/integration/event-telemetry-sink.test.cjs',
  'tests/lib/memory/memory-soak-chaos.test.cjs',
]);

// 2. Validate require() paths and depth
function checkRequires(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // Skip files that generate dynamic child scripts — their require() calls are inside template strings
  if (DYNAMIC_SCRIPT_GENERATORS.has(relPath)) return;
  const isTestFile = relPath.startsWith('tests/');
  const content = fs.readFileSync(filePath, 'utf8');
  const requireRegex = /(?:require|import)\s*\(?['"]([./a-zA-Z0-9_-]+)['"]\)?/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const reqPath = match[1];
    if (reqPath.startsWith('.')) {
      // For test files, only check requires that reference the .claude/ framework —
      // skip mock paths like ./foo.cjs, ./missing.cjs, ./malicious used as test fixtures
      if (isTestFile && !reqPath.includes('.claude/')) continue;
      // Resolve against file's own directory
      const absoluteResolved = path.resolve(path.dirname(filePath), reqPath);
      // Try resolving with common extensions if an exact match isn't found
      const extensions = ['', '.js', '.cjs', '.mjs', '.json'];
      let found = false;
      for (const ext of extensions) {
        if (fs.existsSync(absoluteResolved + ext)) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push(
          `[PHANTOM_REQUIRE] Broken require mapping in ${path.relative(ROOT, filePath)}: ${reqPath}`
        );
      }
    }
  }
}

// 3. Detect Archived Hook references — only in .claude/ production code.
// scripts/ are operational tools (heal-docs, validators) that legitimately reference _archive/ paths.
// tests/ reference archive paths as test fixtures.
function checkArchiveRefs(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // Only check .claude/ production code — skip scripts/, tests/, and this validator itself
  if (!relPath.startsWith('.claude/')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('.claude/archive/') || content.includes('_archive/')) {
    errors.push(`[ARCHIVED_REF] File references archived path: ${relPath}`);
  }
}

// 4. Validate Agent frontmatter (phantom skills, bloat)
function validateAgents() {
  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  if (!fs.existsSync(agentsDir)) return;
  const agents = walk(agentsDir).filter(f => f.endsWith('.md'));

  const agentCount = agents.length;

  for (const agentFile of agents) {
    const content = fs.readFileSync(agentFile, 'utf8');
    const relFile = path.relative(ROOT, agentFile);

    // Check skills list bloat & phantoms
    const skillsMatch = content.match(/skills:\s*\n((?:\s+-\s+[a-zA-Z0-9_-]+\n)+)/);
    if (skillsMatch) {
      const skillsLines = skillsMatch[1].split('\n').filter(l => l.trimStart().startsWith('-'));
      if (skillsLines.length > 50) {
        warnings.push(
          `[AGENT_BLOAT] ${relFile} has highly bloated skills list (${skillsLines.length} skills)`
        );
      }
      for (const line of skillsLines) {
        const skillName = line.replace('-', '').trim();
        const skillPath = path.join(CLAUDE_DIR, 'skills', skillName);
        if (!fs.existsSync(skillPath)) {
          errors.push(`[PHANTOM_SKILL] Agent ${relFile} references missing skill: ${skillName}`);
        }
      }
    }
  }

  // Check Agent Catalog count
  const catalogPath = path.join(CLAUDE_DIR, 'context', 'agent-registry.json');
  if (fs.existsSync(catalogPath)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const catalogCount = catalog.agents
        ? Object.keys(catalog.agents).length
        : Object.keys(catalog).length;
      if (catalogCount !== agentCount) {
        warnings.push(
          `[STALE_CATALOG] agent-registry.json has ${catalogCount} entries, but found ${agentCount} agent files.`
        );
      }
    } catch (_e) {
      /* ignore parse errors */
    }
  }
}

// 5. Look for Empty Directories in tools/skills
function checkEmptyDirs(baseDir) {
  if (!fs.existsSync(baseDir)) return;
  const items = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      const dirPath = path.join(baseDir, item.name);
      const children = walk(dirPath);
      if (children.length === 0) {
        warnings.push(`[EMPTY_DIR] Empty directory found: ${path.relative(ROOT, dirPath)}`);
      }
    }
  }
}

console.log('Running Ecosystem Integrity Audit...');
const allScriptFiles = walk(ROOT).filter(
  f => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs')
);

for (const f of allScriptFiles) {
  if (f.includes('node_modules')) continue;
  checkEncoding(f);
  checkRequires(f);
  checkArchiveRefs(f);
}

const allMdFiles = walk(ROOT).filter(f => f.endsWith('.md'));
for (const f of allMdFiles) {
  if (f.includes('node_modules')) continue;
  checkEncoding(f);
  checkArchiveRefs(f);
}

const allTxtFiles = walk(ROOT).filter(f => f.endsWith('.txt'));
for (const f of allTxtFiles) {
  if (f.includes('node_modules')) continue;
  checkEncoding(f);
}

validateAgents();
checkEmptyDirs(path.join(CLAUDE_DIR, 'tools'));
checkEmptyDirs(path.join(CLAUDE_DIR, 'skills'));

console.log(`\n--- Audit Complete ---`);
console.log(`Errors found: ${errors.length}`);
errors.forEach(e => console.error('  ' + e));
console.log(`Warnings found: ${warnings.length}`);
warnings.forEach(w => console.warn('  ' + w));

if (errors.length > 0) {
  process.exit(1);
}
