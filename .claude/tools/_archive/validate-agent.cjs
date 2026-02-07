#!/usr/bin/env node
/**
 * Agent Identity Validation CLI Tool
 * ===================================
 *
 * Task #46 (P1-7.2): Update agent definition schema
 *
 * Validates agent markdown files with identity fields against JSON Schema.
 *
 * Usage:
 *   node validate-agent.cjs <agent-file-path>
 *   node validate-agent.cjs --all
 *   node validate-agent.cjs --help
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { AgentParser } = require('../../lib/agents/agent-parser.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// =============================================================================
// CLI Functions
// =============================================================================

/**
 * Validate a single agent file
 *
 * @param {string} agentPath - Path to agent file
 * @returns {{ valid: boolean, agent?: string, errors?: string[] }}
 */
function validateAgentFile(agentPath) {
  const parser = new AgentParser();

  try {
    const agent = parser.parseAgentFile(agentPath);
    const agentName = agent.name || path.basename(agentPath, '.md');

    if (!agent.identity) {
      return {
        valid: true,
        agent: agentName,
        warning: 'No identity defined (optional)',
      };
    }

    return {
      valid: true,
      agent: agentName,
      identity: agent.identity,
    };
  } catch (error) {
    return {
      valid: false,
      agent: path.basename(agentPath, '.md'),
      errors: [error.message],
    };
  }
}

/**
 * Find all agent files in .claude/agents/
 *
 * @returns {string[]} Array of agent file paths
 */
function findAllAgents() {
  const agentsDir = path.join(PROJECT_ROOT, '.claude', 'agents');
  const agentFiles = [];

  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        agentFiles.push(fullPath);
      }
    }
  }

  scanDirectory(agentsDir);
  return agentFiles;
}

/**
 * Print validation summary
 *
 * @param {Array<{valid: boolean, agent: string, errors?: string[], warning?: string}>} results
 */
function printSummary(results) {
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  const warnings = results.filter(r => r.warning);

  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total agents: ${results.length}`);
  console.log(`✅ Valid: ${valid.length}`);
  console.log(`❌ Invalid: ${invalid.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Agent Identity Validation CLI Tool
===================================

Usage:
  node validate-agent.cjs <agent-file-path>  Validate a single agent file
  node validate-agent.cjs --all             Validate all agents in .claude/agents/
  node validate-agent.cjs --help            Show this help message

Examples:
  node validate-agent.cjs .claude/agents/core/developer.md
  node validate-agent.cjs --all

Exit Codes:
  0  All validations passed
  1  One or more validations failed
`);
}

// =============================================================================
// Main CLI Logic
// =============================================================================

function main() {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Handle --all
  if (args.includes('--all')) {
    console.log('Validating all agents in .claude/agents/...\n');
    const agentFiles = findAllAgents();
    const results = [];

    for (const agentPath of agentFiles) {
      const result = validateAgentFile(agentPath);
      results.push(result);

      if (result.valid) {
        if (result.warning) {
          console.log(`⚠️  ${result.agent}: ${result.warning}`);
        } else {
          console.log(`✅ ${result.agent}: Identity valid`);
        }
      } else {
        console.log(`❌ ${result.agent}: Identity validation failed`);
        for (const error of result.errors) {
          console.log(`   - ${error}`);
        }
      }
    }

    printSummary(results);
    const hasErrors = results.some(r => !r.valid);
    process.exit(hasErrors ? 1 : 0);
  }

  // Validate single file
  if (args.length === 0) {
    console.error('Error: No agent file specified');
    printUsage();
    process.exit(1);
  }

  const agentPath = args[0];
  if (!fs.existsSync(agentPath)) {
    console.error(`Error: File not found: ${agentPath}`);
    process.exit(1);
  }

  console.log(`Validating ${agentPath}...\n`);
  const result = validateAgentFile(agentPath);

  if (result.valid) {
    if (result.warning) {
      console.log(`⚠️  ${result.agent}: ${result.warning}`);
    } else {
      console.log(`✅ ${result.agent}: Identity valid`);
      if (result.identity) {
        console.log(`   Role: ${result.identity.role}`);
        console.log(`   Goal: ${result.identity.goal.substring(0, 60)}...`);
      }
    }
    process.exit(0);
  } else {
    console.log(`❌ ${result.agent}: Identity validation failed`);
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { validateAgentFile, findAllAgents };
