#!/usr/bin/env node
/**
 * Orphan Detection Script
 *
 * Detects skills that are not assigned to any agent.
 * Run after creating skills or agents to ensure everything is wired up.
 *
 * Usage:
 *   node .claude/tools/detect-orphans.mjs
 *   node .claude/tools/detect-orphans.mjs --fix  # Suggest assignments
 *   node .claude/tools/detect-orphans.mjs --strict  # Exit 1 if orphans found
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Simple YAML frontmatter parser (no external dependency)
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const frontmatter = {};
  const lines = yaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(trimmed.slice(2).trim());
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^([a-z_]+):\s*(.*)$/i);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '') {
        frontmatter[currentKey] = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim());
      } else {
        frontmatter[currentKey] = value;
      }
    }
  }

  return frontmatter;
}

const AGENT_SKILL_MATRIX = {
  // Pattern -> Suggested agents
  'test|tdd|coverage': ['developer', 'qa'],
  'debug|troubleshoot': ['developer', 'devops-troubleshooter'],
  'doc|diagram|writing': ['technical-writer', 'architect'],
  'security|auth|compliance': ['security-architect'],
  'docker|k8s|terraform|aws|gcp': ['devops'],
  'lint|style|analyzer|quality': ['developer', 'code-reviewer'],
  'git|github': ['developer'],
  'plan|sequential': ['planner'],
  'architect|design': ['architect'],
  'slack|notification': ['incident-responder'],
  'react|vue|frontend|css|tailwind': ['frontend-pro', 'typescript-pro'],
  'python|django|flask|fastapi': ['python-pro', 'fastapi-pro'],
  'go|golang': ['golang-pro'],
  rust: ['rust-pro'],
  'java|spring': ['java-pro'],
  'typescript|javascript': ['typescript-pro'],
  'nextjs|next': ['nextjs-pro'],
  'svelte|sveltekit': ['sveltekit-expert'],
  'ios|swift|apple': ['ios-pro'],
  'expo|react-native': ['expo-mobile-developer'],
  graphql: ['graphql-pro'],
  'node|express|nest': ['nodejs-pro'],
  'php|laravel': ['php-pro'],
  tauri: ['tauri-desktop-developer'],
  'data|etl|pipeline': ['data-engineer'],
};

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const strict = args.includes('--strict');
  const verbose = args.includes('--verbose');

  console.log('🔍 Scanning for orphaned skills...\n');

  // Find all skills
  const skillPaths = await glob('.claude/skills/*/SKILL.md');
  const skills = skillPaths.map(p => path.basename(path.dirname(p)));

  // Find all agents and their assigned skills
  const agentPaths = await glob('.claude/agents/**/*.md');
  const assignedSkills = new Set();
  const agentSkillMap = {};

  for (const agentPath of agentPaths) {
    try {
      const content = fs.readFileSync(agentPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      if (frontmatter) {
        const agentName = frontmatter.name || path.basename(agentPath, '.md');
        const agentSkills = frontmatter.skills || [];

        agentSkillMap[agentName] = agentSkills;
        agentSkills.forEach(s => assignedSkills.add(s));
      }
    } catch (_e) {
      // Skip files that can't be parsed
    }
  }

  // Find orphans
  const orphans = skills.filter(s => !assignedSkills.has(s));

  // Categorize orphans
  const critical = [];
  const suggested = {};

  for (const orphan of orphans) {
    let foundMatch = false;
    for (const [pattern, agents] of Object.entries(AGENT_SKILL_MATRIX)) {
      if (new RegExp(pattern, 'i').test(orphan)) {
        suggested[orphan] = agents;
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) {
      critical.push(orphan);
    }
  }

  // Report
  console.log('📊 Summary');
  console.log('─'.repeat(50));
  console.log(`Total skills:     ${skills.length}`);
  console.log(`Assigned skills:  ${assignedSkills.size}`);
  console.log(`Orphaned skills:  ${orphans.length}`);
  console.log('');

  if (orphans.length === 0) {
    console.log('✅ All skills are assigned to at least one agent!');
    process.exit(0);
  }

  console.log('⚠️  Orphaned Skills');
  console.log('─'.repeat(50));

  // Skills with suggestions
  if (Object.keys(suggested).length > 0) {
    console.log('\n📋 Skills with suggested assignments:\n');
    for (const [skill, agents] of Object.entries(suggested)) {
      console.log(`  ${skill}`);
      console.log(`    → Suggested: ${agents.join(', ')}`);

      if (fix) {
        console.log(`    Fix: Add to ${agents[0]}.md skills array`);
      }
    }
  }

  // Skills without suggestions
  if (critical.length > 0) {
    console.log('\n❓ Skills with no automatic suggestion:\n');
    for (const skill of critical) {
      console.log(`  ${skill}`);
      console.log(`    → Review manually and assign to appropriate agent`);
    }
  }

  // Verbose: show agent assignments
  if (verbose) {
    console.log('\n📋 Current Agent Assignments:\n');
    for (const [agent, skills] of Object.entries(agentSkillMap)) {
      if (skills.length > 0) {
        console.log(`  ${agent}: ${skills.length} skills`);
      }
    }
  }

  // Fix mode: generate commands
  if (fix) {
    console.log('\n🔧 Fix Commands:\n');
    for (const [skill, agents] of Object.entries(suggested)) {
      console.log(`# Assign ${skill} to ${agents[0]}`);
      console.log(
        `node .claude/skills/skill-creator/scripts/create.cjs --assign "${skill}" --agent "${agents[0]}"`
      );
      console.log('');
    }
  }

  // Exit code
  if (strict && orphans.length > 0) {
    console.log('\n❌ Strict mode: Exiting with error due to orphaned skills');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
