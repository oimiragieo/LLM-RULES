#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function loadAgentRegistry(projectRoot = PROJECT_ROOT) {
  const registryPath = path.join(projectRoot, '.claude', 'context', 'agent-registry.json');
  if (!fs.existsSync(registryPath)) return null;
  try {
    return safeParseJSON(fs.readFileSync(registryPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function findAgentFilePath(agentType, projectRoot = PROJECT_ROOT) {
  const registry = loadAgentRegistry(projectRoot);
  const normalized = String(agentType || '')
    .trim()
    .toLowerCase();
  if (registry && registry.agents && registry.agents[normalized]?.filePath) {
    return registry.agents[normalized].filePath;
  }

  const agentsRoot = path.join(projectRoot, '.claude', 'agents');
  if (!fs.existsSync(agentsRoot)) return '';
  const target = `${normalized}.md`;

  const stack = [agentsRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === target) {
        return full;
      }
    }
  }

  return '';
}

function loadAgentPromptOverrides(agentType, projectRoot = PROJECT_ROOT) {
  const agentPath = findAgentFilePath(agentType, projectRoot);
  if (!agentPath) return '';
  const agentDir = path.join(path.dirname(agentPath), path.basename(agentPath, '.md'));
  const promptsDir = path.join(agentDir, 'prompts');
  if (!fs.existsSync(promptsDir)) return '';
  const files = fs
    .readdirSync(promptsDir)
    .filter(file => file.endsWith('.md'))
    .sort();
  if (files.length === 0) return '';
  const chunks = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(promptsDir, file), 'utf8').trim();
    if (content) chunks.push(content);
  }
  return chunks.join('\n\n').trim();
}

function loadBehaviourRules(projectRoot = PROJECT_ROOT) {
  try {
    const behaviourPath = path.join(projectRoot, '.claude', 'context', 'memory', 'behaviour.md');
    if (!fs.existsSync(behaviourPath)) return '';
    const raw = fs.readFileSync(behaviourPath, 'utf8');
    const lines = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    return lines.join('\n').trim();
  } catch (_e) {
    return '';
  }
}

function formatBehaviourSection(rules) {
  if (!rules) return '';
  return `## Dynamic behaviour rules\n\n${rules}\n`;
}

module.exports = {
  loadAgentPromptOverrides,
  loadBehaviourRules,
  formatBehaviourSection,
};
