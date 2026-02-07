#!/usr/bin/env node
/**
 * Agent Tools Validation CLI
 *
 * Validates all agent tool definitions against approved tools list.
 *
 * Usage:
 *   node validate-agent-tools.js [--fix] [--report]
 *
 * Options:
 *   --fix     Auto-fix common issues (upgrade generic refs)
 *   --report  Generate validation report to artifacts
 */

const fs = require('fs');
const path = require('path');
const _yaml = require('yaml');

// Import validator logic
const validator = require('../../hooks/validation/agent-tools-validator.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude/agents');
const REPORT_PATH = path.join(PROJECT_ROOT, '.claude/context/artifacts/tools-validation-report.md');

// CLI flags
const args = process.argv.slice(2);
const FIX_MODE = args.includes('--fix');
const REPORT_MODE = args.includes('--report');

/**
 * Find all agent files
 */
function findAgentFiles() {
  const agents = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
        agents.push(fullPath);
      }
    }
  }

  scanDir(AGENTS_DIR);
  return agents;
}

/**
 * Validate all agents
 */
function validateAllAgents() {
  const agentFiles = findAgentFiles();
  const results = [];

  console.log(`\n🔍 Validating ${agentFiles.length} agent files...\n`);

  for (const filePath of agentFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(PROJECT_ROOT, filePath);

    const result = validator._test.validateAgentTools(filePath, content);

    results.push({
      filePath: relPath,
      agentName: result.metadata?.agentName || path.basename(filePath, '.md'),
      category: result.metadata?.category || 'unknown',
      toolCount: result.metadata?.toolCount || 0,
      mcpToolCount: result.metadata?.mcpToolCount || 0,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    });

    // Print status
    const status = result.valid ? '✅' : '❌';
    const name = path.basename(filePath, '.md');
    console.log(`${status} ${name.padEnd(30)} (${result.metadata?.toolCount || 0} tools)`);

    if (!result.valid) {
      result.errors.forEach(err => {
        console.log(`   ❌ ${err}`);
      });
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach(warn => {
        console.log(`   ⚠️  ${warn}`);
      });
    }
  }

  return results;
}

/**
 * Generate validation report
 */
function generateReport(results) {
  const timestamp = new Date().toISOString();
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.length - validCount;
  const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);

  const report = [
    '# Agent Tools Validation Report',
    '',
    `**Generated:** ${timestamp}`,
    `**Total Agents:** ${results.length}`,
    `**Valid:** ${validCount} ✅`,
    `**Invalid:** ${invalidCount} ❌`,
    `**Warnings:** ${warningCount} ⚠️`,
    '',
    '---',
    '',
    '## Summary by Category',
    '',
    '| Category | Agents | Valid | Invalid | Warnings |',
    '|----------|--------|-------|---------|----------|',
  ];

  // Group by category
  const byCategory = {};
  for (const result of results) {
    const cat = result.category || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, valid: 0, invalid: 0, warnings: 0 };
    }
    byCategory[cat].total++;
    if (result.valid) byCategory[cat].valid++;
    else byCategory[cat].invalid++;
    byCategory[cat].warnings += result.warnings.length;
  }

  for (const [category, stats] of Object.entries(byCategory)) {
    report.push(
      `| ${category} | ${stats.total} | ${stats.valid} | ${stats.invalid} | ${stats.warnings} |`
    );
  }

  report.push('', '---', '', '## Validation Results', '');

  // Invalid agents
  const invalid = results.filter(r => !r.valid);
  if (invalid.length > 0) {
    report.push('### ❌ Invalid Agents', '');

    for (const result of invalid) {
      report.push(`#### ${result.agentName} (${result.category})`);
      report.push('');
      report.push(`**File:** \`${result.filePath}\``);
      report.push(`**Tools:** ${result.toolCount} (${result.mcpToolCount} MCP)`);
      report.push('');
      report.push('**Errors:**');
      result.errors.forEach(err => {
        report.push(`- ❌ ${err}`);
      });

      if (result.warnings.length > 0) {
        report.push('');
        report.push('**Warnings:**');
        result.warnings.forEach(warn => {
          report.push(`- ⚠️  ${warn}`);
        });
      }

      report.push('');
    }
  }

  // Agents with warnings
  const withWarnings = results.filter(r => r.valid && r.warnings.length > 0);
  if (withWarnings.length > 0) {
    report.push('### ⚠️  Agents with Warnings', '');

    for (const result of withWarnings) {
      report.push(`#### ${result.agentName} (${result.category})`);
      report.push('');
      report.push(`**File:** \`${result.filePath}\``);
      report.push(`**Tools:** ${result.toolCount} (${result.mcpToolCount} MCP)`);
      report.push('');
      report.push('**Warnings:**');
      result.warnings.forEach(warn => {
        report.push(`- ⚠️  ${warn}`);
      });
      report.push('');
    }
  }

  // Valid agents
  const valid = results.filter(r => r.valid && r.warnings.length === 0);
  if (valid.length > 0) {
    report.push('### ✅ Valid Agents', '');
    report.push('| Agent | Category | Tools | MCP Tools |');
    report.push('|-------|----------|-------|-----------|');

    for (const result of valid) {
      report.push(
        `| ${result.agentName} | ${result.category} | ${result.toolCount} | ${result.mcpToolCount} |`
      );
    }

    report.push('');
  }

  report.push('---', '', '## Recommendations', '');

  if (invalidCount > 0) {
    report.push('### Critical Issues', '');
    report.push('1. Fix invalid tool references in agent frontmatter');
    report.push('2. Ensure category-specific requirements are met');
    report.push('3. Check agent-specific rules (orchestrators, reviewers, etc.)');
    report.push('');
  }

  if (warningCount > 0) {
    report.push('### Warnings', '');
    report.push('1. MCP tools require server configuration in `.claude/settings.json`');
    report.push('2. Consider using `Skill()` fallback for sequential-thinking');
    report.push('3. Review MCP tool usage vs availability');
    report.push('');
  }

  report.push('---', '', '## Next Steps', '');
  report.push(
    '1. Run `node .claude/tools/cli/validate-agent-tools.js --fix` to auto-fix common issues'
  );
  report.push('2. Set `AGENT_TOOLS_VALIDATOR=block` to enforce validation in hooks');
  report.push('3. Add validation to CI/CD pipeline');
  report.push('');

  return report.join('\n');
}

/**
 * Auto-fix common issues (placeholder)
 */
function autoFix(results) {
  console.log('\n🔧 Auto-fix mode enabled...\n');

  const fixedCount = 0;

  for (const result of results) {
    if (!result.valid) {
      console.log(`⚠️  Cannot auto-fix ${result.agentName} (manual intervention required)`);
      // Future: Implement auto-fix logic for common issues
      // - Replace "Search" with "Grep"
      // - Remove "Git" if Bash present
      // - Replace "MCP Tools" with specific tools
    }
  }

  console.log(`\n✅ Auto-fixed ${fixedCount} agents\n`);

  return fixedCount;
}

/**
 * Main
 */
function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Agent Tools Validation CLI                       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const results = validateAllAgents();

  if (FIX_MODE) {
    autoFix(results);
  }

  if (REPORT_MODE) {
    const report = generateReport(results);
    fs.writeFileSync(REPORT_PATH, report);
    console.log(`\n📄 Report generated: ${path.relative(PROJECT_ROOT, REPORT_PATH)}\n`);
  }

  // Summary
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.length - validCount;
  const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(
    `║ Summary: ${validCount}/${results.length} valid, ${invalidCount} invalid, ${warningCount} warnings`.padEnd(
      54
    ) + '║'
  );
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (invalidCount > 0) {
    console.log('❌ Validation failed. Run with --report for details.\n');
    process.exit(1);
  } else if (warningCount > 0) {
    console.log('⚠️  Validation passed with warnings. Run with --report for details.\n');
    process.exit(0);
  } else {
    console.log('✅ All agents validated successfully!\n');
    process.exit(0);
  }
}

main();
