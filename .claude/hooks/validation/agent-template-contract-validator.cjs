#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
  getEnforcementMode,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  isAgentFile,
  shouldEnforceForWrite,
  validateAgentContent,
} = require('../../lib/agents/agent-template-contract.cjs');

function readExistingIfAny(absPath) {
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, 'utf8');
}

function getIncomingContent(toolName, toolInput, existingContent) {
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    if (typeof existingContent !== 'string') return '';
    const oldStr = String(toolInput.old_string || '');
    const newStr = String(toolInput.new_string || '');
    if (!oldStr) return existingContent;
    if (!existingContent.includes(oldStr)) return existingContent;
    return existingContent.replace(oldStr, newStr);
  }
  return '';
}

async function main() {
  const mode = getEnforcementMode('AGENT_TEMPLATE_CONTRACT', 'block');
  if (mode === 'off') {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const input = await parseHookInputAsync();
  if (!input) {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const toolName = getToolName(input);
  if (toolName !== 'Write' && toolName !== 'Edit') {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const toolInput = getToolInput(input);
  const candidatePath = extractFilePath(toolInput);
  if (!candidatePath) {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const absPath = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(PROJECT_ROOT, candidatePath);
  if (!isAgentFile(absPath)) {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const existingContent = readExistingIfAny(absPath);
  const incomingContent = getIncomingContent(toolName, toolInput, existingContent);

  if (!shouldEnforceForWrite({ filePath: absPath, incomingContent, existingContent })) {
    console.log(formatResult('allow'));
    process.exit(0);
  }

  const validation = validateAgentContent(incomingContent, { requireMarker: true });
  if (!validation.valid) {
    const message = `[AGENT-TEMPLATE-CONTRACT] ${validation.errors.join(' | ')}`;
    if (mode === 'warn') {
      console.log(formatResult('allow', message));
      process.exit(0);
    }
    console.log(formatResult('block', message));
    process.exit(2);
  }

  // BC-2: v3.0.0 manifest block check (gated — only when V3_MANIFEST_REQUIRED=on)
  if (process.env.V3_MANIFEST_REQUIRED === 'on') {
    const hasManifestBlock = /^manifest\s*:/m.test(incomingContent);
    if (!hasManifestBlock) {
      const bc2Message =
        '[AGENT-TEMPLATE-CONTRACT] BC-2: manifest block required in v3.0.0; run pnpm migrate:2x-to-3';
      if (mode === 'warn') {
        console.log(formatResult('allow', bc2Message));
        process.exit(0);
      }
      console.log(formatResult('block', bc2Message));
      process.exit(2);
    }
  }

  console.log(formatResult('allow'));
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.log(formatResult('block', `[AGENT-TEMPLATE-CONTRACT] ${err.message}`));
    process.exit(0);
  });
}

module.exports = { main, getIncomingContent };
