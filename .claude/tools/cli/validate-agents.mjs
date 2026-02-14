#!/usr/bin/env node
/**
 * Validate All Agents
 * Checks that all agents have valid structure and frontmatter
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

// Required frontmatter fields
const REQUIRED_FIELDS = ['name', 'description', 'tools'];
const RECOMMENDED_FIELDS = ['model', 'skills'];

// Skills directory for pointer verification
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// Valid models (short names and full IDs)
const VALID_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-3-5',
  'claude-haiku-4-5',
  'claude-sonnet-4-5-20251101',
  'claude-opus-4-5-20251101',
  'claude-haiku-3-5-20250118',
  'sonnet',
  'opus',
  'haiku',
];

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Parse YAML frontmatter from agent markdown
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  // Simple YAML parser
  const lines = yaml.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[')) {
        // Inline array
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim());
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.match(/^\s+-\s/)) {
      result[currentKey].push(line.replace(/^\s+-\s/, '').trim());
    }
  }

  return result;
}

/**
 * Validate a single agent file
 */
function validateAgent(filePath, _relativePath) {
  const errors = [];
  const warnings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check frontmatter exists
    if (!content.startsWith('---')) {
      errors.push('Missing YAML frontmatter');
      return { errors, warnings };
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      errors.push('Invalid YAML frontmatter');
      return { errors, warnings };
    }

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!frontmatter[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check recommended fields
    for (const field of RECOMMENDED_FIELDS) {
      if (!frontmatter[field]) {
        warnings.push(`Missing recommended field: ${field}`);
      }
    }

    // Validate description length
    if (frontmatter.description && frontmatter.description.length < 10) {
      warnings.push('Description is less than 10 characters');
    }

    // Validate model if specified
    if (frontmatter.model && !VALID_MODELS.includes(frontmatter.model)) {
      warnings.push(`Unknown model: ${frontmatter.model}`);
    }

    // Validate tools is array
    if (frontmatter.tools && !Array.isArray(frontmatter.tools)) {
      warnings.push('tools should be an array');
    }

    // Validate skills is array
    if (frontmatter.skills && !Array.isArray(frontmatter.skills)) {
      warnings.push('skills should be an array');
    }

    // POINTER VERIFICATION: Check skills exist
    if (frontmatter.skills && Array.isArray(frontmatter.skills)) {
      for (const skill of frontmatter.skills) {
        const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          errors.push(`Skill not found: ${skill} (broken pointer)`);
        }
      }
    }

    // Check for multi-line description (causes parsing issues)
    if (content.includes('description: |') || content.includes('description: >')) {
      errors.push('Description must be single-line (multi-line YAML causes issues)');
    }

    // Check for body content
    const bodyMatch = content.match(/---\n[\s\S]*?\n---\n([\s\S]*)/);
    if (!bodyMatch || bodyMatch[1].trim().length < 50) {
      warnings.push('Agent has minimal body content (less than 50 chars)');
    }

    // Check for Memory Protocol section
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    if (!bodyContent.includes('Memory Protocol')) {
      warnings.push('Missing Memory Protocol section');
    }

    return { errors, warnings, frontmatter };
  } catch (e) {
    errors.push(`Read error: ${e.message}`);
    return { errors, warnings };
  }
}

/**
 * Scan directory recursively for .md files
 */
function scanAgents(dir) {
  const agents = [];
  const includeArchive = process.env.INCLUDE_ARCHIVE_AGENTS === 'true';

  function scan(currentDir, relativeBase) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.join(relativeBase, entry.name);

      if (entry.isDirectory()) {
        if (!includeArchive && entry.name === '_archive') {
          continue;
        }
        scan(fullPath, relativePath);
      } else if (entry.name.endsWith('.md')) {
        agents.push({ fullPath, relativePath, name: entry.name });
      }
    }
  }

  scan(dir, '');
  return agents;
}

/**
 * Main execution
 */
function main() {
  console.log('\n📋 Agent Validation Suite');
  console.log('='.repeat(60) + '\n');

  if (!fs.existsSync(AGENTS_DIR)) {
    log('red', '❌ Agents directory not found: ' + AGENTS_DIR);
    process.exit(1);
  }

  const agents = scanAgents(AGENTS_DIR);
  console.log(`Found ${agents.length} agent files to validate\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  let passedAgents = 0;

  // Group by directory
  const byCategory = {};
  for (const agent of agents) {
    const category = path.dirname(agent.relativePath) || 'root';
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(agent);
  }

  for (const [category, categoryAgents] of Object.entries(byCategory)) {
    log('cyan', `\n📁 ${category}/`);

    for (const agent of categoryAgents) {
      const result = validateAgent(agent.fullPath, agent.relativePath);
      const hasErrors = result.errors.length > 0;
      const hasWarnings = result.warnings.length > 0;

      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;

      if (!hasErrors) passedAgents++;

      // Print status
      const statusIcon = hasErrors ? '❌' : hasWarnings ? '⚠️' : '✅';
      const agentName = result.frontmatter?.name || agent.name.replace('.md', '');
      console.log(`  ${statusIcon} ${agentName.padEnd(25)} [${agent.name}]`);

      // Print errors
      if (hasErrors) {
        for (const error of result.errors) {
          log('red', `     ❌ ${error}`);
        }
      }

      // Print warnings (only first 2)
      if (hasWarnings && result.warnings.length <= 2) {
        for (const warning of result.warnings) {
          log('yellow', `     ⚠️  ${warning}`);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary');
  console.log('-'.repeat(40));
  console.log(`Total agents:     ${agents.length}`);
  log(
    passedAgents === agents.length ? 'green' : 'yellow',
    `Passed:           ${passedAgents}/${agents.length}`
  );
  log(totalErrors === 0 ? 'green' : 'red', `Total errors:     ${totalErrors}`);
  log(totalWarnings === 0 ? 'green' : 'yellow', `Total warnings:   ${totalWarnings}`);

  if (totalErrors === 0) {
    log('green', '\n✅ All agents validated successfully!\n');
    process.exit(0);
  } else {
    log('red', `\n❌ Validation failed with ${totalErrors} errors\n`);
    process.exit(1);
  }
}

main();
