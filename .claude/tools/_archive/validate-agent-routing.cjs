#!/usr/bin/env node
/**
 * Agent Routing Validation Tool
 *
 * Validates the agent routing table in CLAUDE.md Section 3 against
 * actual agent files in .claude/agents/.
 *
 * Reports:
 * - OK: Agent in table and file exists
 * - MISSING: Agent in table but file doesn't exist
 * - NOT IN TABLE: Agent file exists but not in routing table
 * - MISMATCH: Path in table doesn't match actual file location
 *
 * Usage:
 *   node validate-agent-routing.js           # Run validation
 *   node validate-agent-routing.js --verbose # Show all OK entries
 *
 * Exit codes:
 *   0 - All agents validate successfully
 *   1 - Discrepancies found
 */

const fs = require('fs');
const path = require('path');

// Find project root by looking for the parent of .claude directory
function findProjectRoot(startDir) {
  let dir = startDir || __dirname;
  while (dir !== path.parse(dir).root) {
    // Check if parent directory has .claude and contains CLAUDE.md
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) {
      return dir;
    }
    // Also check if we're inside .claude and can go up
    if (path.basename(dir) === '.claude' || dir.includes('.claude')) {
      const parent = path.dirname(dir);
      if (fs.existsSync(path.join(parent, '.claude', 'CLAUDE.md'))) {
        return parent;
      }
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Parse the routing table from CLAUDE.md content.
 *
 * Extracts entries from Section 3 "AGENT ROUTING TABLE" markdown table only.
 * Stops when it hits the next section (## 3.5 or ## 4) or Creator Skills table.
 *
 * @param {string} content - Full content of CLAUDE.md
 * @returns {Array<{requestType: string, agent: string, file: string}>}
 */
function parseRoutingTable(content) {
  const results = [];

  // Find Section 3 agent routing table start
  const section3StartMatch = content.match(/## 3\.? AGENT ROUTING TABLE/i);
  if (!section3StartMatch) {
    return results;
  }

  const startIndex = section3StartMatch.index;

  // Find where Section 3 ends (## 3.5 or ## 4 or "### Creator Skills")
  // Don't cut off at "**Domain Agents**" since router entry comes right before it
  const section3EndPatterns = [
    /## 3\.5/,
    /## 4\./,
    /### Creator Skills/,
    /\*\*Routing Logic Source of Truth\*\*/, // Text after main table and router entry
  ];

  let endIndex = content.length;
  for (const pattern of section3EndPatterns) {
    const match = content.slice(startIndex + 30).match(pattern);
    if (match && startIndex + 30 + match.index < endIndex) {
      endIndex = startIndex + 30 + match.index;
    }
  }

  // Extract only the Section 3 content
  const section3Content = content.slice(startIndex, endIndex);

  // Extract table rows - find markdown table pattern
  // | Request Type | Agent | File |
  // Note: Capture everything between pipes, strip backticks/formatting later
  const tableRegex = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|\n]+)\s*\|/g;

  let match;
  while ((match = tableRegex.exec(section3Content)) !== null) {
    const requestType = match[1].trim();
    const agent = match[2].trim().replace(/`/g, '');
    // Clean up file path - remove trailing annotations like "(Meta)"
    let file = match[3].trim().replace(/`/g, '');
    file = file.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Skip header rows and separator rows
    if (
      requestType === 'Request Type' ||
      requestType.includes('---') ||
      agent === 'Agent' ||
      file === 'File' ||
      requestType.includes('---')
    ) {
      continue;
    }

    // Only include entries with valid agent file paths
    if (!file.startsWith('.claude/agents/')) {
      continue;
    }

    // Skip if file path contains placeholders or variables
    if (file.includes('<') || file.includes('>') || file.includes('${')) {
      continue;
    }

    results.push({ requestType, agent, file });
  }

  return results;
}

/**
 * Recursively scan the agents directory and return all .md file paths.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} - Array of relative paths like '.claude/agents/core/developer.md'
 */
function scanAgentFiles(projectRoot) {
  const agentsDir = path.join(projectRoot, '.claude', 'agents');
  const results = [];

  if (!fs.existsSync(agentsDir)) {
    return results;
  }

  function scan(dir, relativeBase) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.posix.join(relativeBase, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath, relativePath);
      } else if (entry.name.endsWith('.md')) {
        results.push(relativePath);
      }
    }
  }

  scan(agentsDir, '.claude/agents');
  return results;
}

/**
 * Validate routing table entries against actual agent files.
 *
 * @param {Array<{requestType: string, agent: string, file: string}>} tableEntries
 * @param {string[]} agentFiles - Array of relative paths
 * @param {string} projectRoot - Project root directory
 * @returns {{ok: Array, missing: Array, notInTable: Array, mismatch: Array}}
 */
function validateRouting(tableEntries, agentFiles, projectRoot) {
  const results = {
    ok: [],
    missing: [],
    notInTable: [],
    mismatch: [],
  };

  // Normalize paths for comparison (handle Windows backslashes)
  const normalizedFiles = new Set(agentFiles.map(f => f.replace(/\\/g, '/')));

  // Track which files are accounted for
  const accountedFiles = new Set();

  // Check each table entry
  for (const entry of tableEntries) {
    const normalizedPath = entry.file.replace(/\\/g, '/');
    const fullPath = path.join(projectRoot, normalizedPath);

    if (fs.existsSync(fullPath)) {
      // File exists - mark as OK
      results.ok.push({
        agent: entry.agent,
        file: entry.file,
        requestType: entry.requestType,
      });
      accountedFiles.add(normalizedPath);
    } else {
      // File doesn't exist - mark as MISSING
      results.missing.push({
        agent: entry.agent,
        file: entry.file,
        requestType: entry.requestType,
      });
    }
  }

  // Find files not in the routing table
  for (const file of normalizedFiles) {
    if (!accountedFiles.has(file)) {
      results.notInTable.push({ file });
    }
  }

  return results;
}

/**
 * Format validation results as console output.
 *
 * @param {{ok: Array, missing: Array, notInTable: Array, mismatch: Array}} results
 * @param {boolean} verbose - Show all OK entries
 * @returns {string}
 */
function formatOutput(results, verbose = false) {
  const lines = [];

  lines.push('=== Agent Routing Validation ===');
  lines.push('');
  lines.push('Checking CLAUDE.md Section 3 against .claude/agents/...');
  lines.push('');

  // Show OK entries (if verbose or few)
  if (verbose || results.ok.length <= 5) {
    for (const entry of results.ok) {
      lines.push(`\u2713 ${entry.agent}: ${entry.file} [OK]`);
    }
  } else {
    lines.push(`\u2713 ${results.ok.length} agents validated [OK]`);
  }

  // Show missing entries
  for (const entry of results.missing) {
    lines.push(`\u2717 ${entry.agent}: ${entry.file} [MISSING]`);
  }

  // Show not-in-table entries
  for (const entry of results.notInTable) {
    lines.push(`? ${path.basename(entry.file, '.md')}: ${entry.file} [NOT IN TABLE]`);
  }

  // Summary
  lines.push('');
  lines.push('Summary:');
  lines.push(`- OK: ${results.ok.length}`);
  lines.push(`- Missing: ${results.missing.length}`);
  lines.push(`- Not in table: ${results.notInTable.length}`);
  lines.push(`- Mismatch: ${results.mismatch.length}`);
  lines.push('');

  const hasIssues =
    results.missing.length > 0 || results.notInTable.length > 0 || results.mismatch.length > 0;
  if (hasIssues) {
    lines.push('Overall: FAIL (discrepancies found)');
  } else {
    lines.push('Overall: PASS');
  }

  return lines.join('\n');
}

/**
 * Main execution function.
 */
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  const projectRoot = findProjectRoot(__dirname);
  const claudeMdPath = path.join(projectRoot, '.claude', 'CLAUDE.md');

  // Read CLAUDE.md
  if (!fs.existsSync(claudeMdPath)) {
    console.error('Error: CLAUDE.md not found at', claudeMdPath);
    process.exit(1);
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Parse routing table
  const tableEntries = parseRoutingTable(content);

  if (tableEntries.length === 0) {
    console.error('Error: No routing table found in CLAUDE.md Section 3');
    process.exit(1);
  }

  // Scan agent files
  const agentFiles = scanAgentFiles(projectRoot);

  // Validate
  const results = validateRouting(tableEntries, agentFiles, projectRoot);

  // Output
  console.log(formatOutput(results, verbose));

  // Exit code
  const hasIssues =
    results.missing.length > 0 || results.notInTable.length > 0 || results.mismatch.length > 0;
  process.exit(hasIssues ? 1 : 0);
}

// Export for testing
module.exports = {
  parseRoutingTable,
  scanAgentFiles,
  validateRouting,
  formatOutput,
  findProjectRoot,
};

// Run if executed directly
if (require.main === module) {
  main();
}
