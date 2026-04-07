#!/usr/bin/env node
/**
 * CLI Tool: git-notes-verify.cjs
 *
 * Verify and report on git notes audit trail.
 *
 * @usage
 *   node git-notes-verify.cjs <commit_range>
 *   node git-notes-verify.cjs main..HEAD
 *   node git-notes-verify.cjs HEAD~5..HEAD
 *   node git-notes-verify.cjs --report=audit-2026-01-29.md
 *   node git-notes-verify.cjs --all
 *
 * @functions
 * - List all commits with git notes in range
 * - Verify note signatures
 * - Generate audit trail report
 * - Check for missing notes
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const _path = require('path');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

// Import hook for verification logic (archived — load conditionally)
let gitNotesAudit;
try {
  gitNotesAudit = require('../../hooks/audit/git-notes-audit.cjs');
} catch (_e) {
  gitNotesAudit = null; // Hook module never created (hooks/audit/ does not exist); verification unavailable
}

function runGitCommand(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(stderr || `git command failed with exit code ${result.status}`);
  }

  return String(result.stdout || '');
}

/**
 * Get commits in range
 *
 * @param {string} range - Git commit range (e.g., "main..HEAD", "HEAD~5..HEAD")
 * @returns {Array<object>} Commits with hash and message
 */
function getCommits(range) {
  try {
    const args = ['log', '--pretty=format:%H%x09%s'];
    if (range && String(range).trim() !== '') {
      args.push(String(range).trim());
    }
    const output = runGitCommand(args);

    if (!output.trim()) {
      return [];
    }

    return output
      .trim()
      .split('\n')
      .map(line => {
        const [hash, ...messageParts] = line.split('\t');
        return { hash: hash.trim(), message: messageParts.join('\t') };
      });
  } catch (error) {
    console.error(`Error getting commits: ${error.message}`);
    return [];
  }
}

/**
 * Get git note for commit
 *
 * @param {string} commitHash - Git commit hash
 * @returns {string|null} Note content or null if no note
 */
function getNotes(commitHash) {
  try {
    return runGitCommand(['notes', 'show', String(commitHash).trim()]);
  } catch (_error) {
    return null; // No note for this commit
  }
}

/**
 * Verify all commits in range
 *
 * @param {string} range - Git commit range
 * @returns {Array<object>} Verification results
 */
function verify(range) {
  const commits = getCommits(range);
  const results = [];

  for (const commit of commits) {
    const notes = getNotes(commit.hash);

    if (!notes) {
      results.push({
        hash: commit.hash.substring(0, 7),
        message: commit.message,
        notes: null,
        verified: false,
        status: 'MISSING',
        timestamp: null,
      });
      continue;
    }

    const verification = gitNotesAudit
      ? gitNotesAudit.verifyNote(notes, commit.hash)
      : {
          verified: false,
          timestamp: null,
          taskId: null,
          agentName: null,
          error: 'git-notes-audit hook archived',
        };

    results.push({
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      notes: notes,
      verified: verification.verified,
      status: verification.verified ? 'VERIFIED' : 'TAMPERED',
      timestamp: verification.timestamp || null,
      taskId: verification.taskId || null,
      agentName: verification.agentName || null,
      error: verification.error || null,
    });
  }

  return results;
}

/**
 * Generate markdown report
 *
 * @param {Array<object>} results - Verification results
 * @param {string} range - Git commit range
 * @returns {string} Markdown report
 */
function generateReport(results, range) {
  const total = results.length;
  const withNotes = results.filter(r => r.notes !== null).length;
  const verified = results.filter(r => r.verified).length;
  const missing = results.filter(r => r.status === 'MISSING').length;
  const tampered = results.filter(r => r.status === 'TAMPERED').length;

  let report = `# Git Notes Audit Trail Report

**Generated**: ${new Date().toISOString()}
**Commit Range**: ${range || 'All commits'}

## Summary

- **Total Commits**: ${total}
- **With Notes**: ${withNotes} (${((withNotes / total) * 100).toFixed(1)}%)
- **Verified**: ${verified} ✓
- **Missing**: ${missing} ${missing > 0 ? '⚠' : ''}
- **Tampered**: ${tampered} ${tampered > 0 ? '🚨' : ''}

`;

  if (missing > 0) {
    report += `## ⚠ Missing Audit Notes (${missing})\n\n`;
    report += `| Commit | Message |\n`;
    report += `|--------|----------|\n`;
    results
      .filter(r => r.status === 'MISSING')
      .forEach(r => {
        report += `| ${r.hash} | ${r.message} |\n`;
      });
    report += `\n`;
  }

  if (tampered > 0) {
    report += `## 🚨 Tampered Notes (${tampered})\n\n`;
    report += `| Commit | Message | Error |\n`;
    report += `|--------|---------|-------|\n`;
    results
      .filter(r => r.status === 'TAMPERED')
      .forEach(r => {
        report += `| ${r.hash} | ${r.message} | ${r.error} |\n`;
      });
    report += `\n`;
  }

  report += `## Verified Commits (${verified})\n\n`;
  report += `| Commit | Task ID | Agent | Timestamp | Message |\n`;
  report += `|--------|---------|-------|-----------|----------|\n`;
  results
    .filter(r => r.verified)
    .forEach(r => {
      report += `| ${r.hash} | ${r.taskId} | ${r.agentName} | ${r.timestamp} | ${r.message} |\n`;
    });

  return report;
}

/**
 * Print summary to console
 *
 * @param {Array<object>} results - Verification results
 */
function printSummary(results) {
  const total = results.length;
  const verified = results.filter(r => r.verified).length;
  const missing = results.filter(r => r.status === 'MISSING').length;
  const tampered = results.filter(r => r.status === 'TAMPERED').length;

  console.log('\n=== Git Notes Audit Trail ===\n');
  console.log(`Total Commits: ${total}`);
  console.log(`Verified: ${verified} ✓`);
  console.log(`Missing: ${missing} ${missing > 0 ? '⚠' : ''}`);
  console.log(`Tampered: ${tampered} ${tampered > 0 ? '🚨' : ''}`);
  console.log('');

  if (missing > 0) {
    console.log('⚠ Commits missing audit notes:');
    results
      .filter(r => r.status === 'MISSING')
      .forEach(r => {
        console.log(`  ${r.hash} - ${r.message}`);
      });
    console.log('');
  }

  if (tampered > 0) {
    console.log('🚨 Commits with tampered notes:');
    results
      .filter(r => r.status === 'TAMPERED')
      .forEach(r => {
        console.log(`  ${r.hash} - ${r.message}`);
        console.log(`    Error: ${r.error}`);
      });
    console.log('');
  }

  console.log('Verified commits:');
  results
    .filter(r => r.verified)
    .forEach(r => {
      console.log(`  ${r.hash} [${r.taskId}] ${r.agentName} - ${r.message}`);
    });
  console.log('');
}

/**
 * Main CLI entry point
 */
function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Git Notes Verification Tool

Usage:
  node git-notes-verify.cjs <commit_range>
  node git-notes-verify.cjs main..HEAD
  node git-notes-verify.cjs HEAD~5..HEAD
  node git-notes-verify.cjs --all
  node git-notes-verify.cjs --report=audit-report.md

Options:
  --all             Verify all commits in repository
  --report=FILE     Generate markdown report and save to file
  --help, -h        Show this help message

Examples:
  # Verify last 10 commits
  node git-notes-verify.cjs HEAD~10..HEAD

  # Verify commits between main and current branch
  node git-notes-verify.cjs main..HEAD

  # Generate audit report
  node git-notes-verify.cjs main..HEAD --report=audit-2026-01-29.md

  # Verify all commits
  node git-notes-verify.cjs --all
    `);
    process.exit(0);
  }

  // Parse arguments
  let range = '';
  let reportFile = null;

  for (const arg of args) {
    if (arg.startsWith('--report=')) {
      reportFile = arg.split('=')[1];
    } else if (arg === '--all') {
      range = ''; // Empty range means all commits
    } else if (!arg.startsWith('--')) {
      range = arg;
    }
  }

  // Default to last 10 commits if no range specified
  if (!range && !args.includes('--all')) {
    range = 'HEAD~10..HEAD';
  }

  // Verify commits
  const results = verify(range);

  if (results.length === 0) {
    console.log('No commits found in range:', range || 'all commits');
    process.exit(0);
  }

  // Generate report if requested
  if (reportFile) {
    const report = generateReport(results, range);
    fs.writeFileSync(reportFile, report, 'utf-8');
    console.log(`\nReport generated: ${reportFile}`);
  }

  // Print summary
  printSummary(results);

  // Exit with error code if any issues found
  const issues = results.filter(r => !r.verified).length;
  process.exit(issues > 0 ? 1 : 0);
}

// Run CLI
const wrappedMain = wrapCLITool(main, 'git-notes-verify');

if (require.main === module) {
  wrappedMain();
}

// Export for testing
module.exports = { verify, generateReport, getCommits, getNotes, runGitCommand };
