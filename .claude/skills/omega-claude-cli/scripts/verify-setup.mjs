#!/usr/bin/env node
/**
 * Verify omega-claude-cli headless setup: Node and Claude Code CLI only. No MCP required.
 * Exit 0 if all OK, 1 otherwise. Read-only.
 * Usage: node verify-setup.mjs
 */
import { execSync } from 'child_process';

const MIN_NODE_MAJOR = 18;

function checkNode() {
  const v = process.version.slice(1).split('.')[0];
  const major = parseInt(v, 10);
  if (major >= MIN_NODE_MAJOR) return { ok: true };
  return { ok: false, message: `Node ${MIN_NODE_MAJOR}+ required; current: ${process.version}` };
}

function checkClaudeCLI() {
  try {
    execSync('claude --version', { stdio: 'pipe', timeout: 5000 });
    return { ok: true, how: 'claude' };
  } catch {
    try {
      execSync('npx -y @anthropic-ai/claude-code --version', {
        stdio: 'pipe',
        timeout: 15000,
      });
      return { ok: true, how: 'npx @anthropic-ai/claude-code' };
    } catch {
      return {
        ok: false,
        message:
          'Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code or use npx @anthropic-ai/claude-code',
      };
    }
  }
}

function main() {
  const report = [];
  let allOk = true;

  const nodeResult = checkNode();
  if (nodeResult.ok) {
    report.push('OK Node: ' + process.version);
  } else {
    report.push('MISSING Node: ' + nodeResult.message);
    allOk = false;
  }

  const claudeResult = checkClaudeCLI();
  if (claudeResult.ok) {
    report.push('OK Claude Code CLI: ' + (claudeResult.how || 'found'));
  } else {
    report.push('MISSING Claude Code CLI: ' + claudeResult.message);
    allOk = false;
  }

  report.push('Headless mode: no MCP config required. Use scripts/ask-claude.mjs to run Claude.');
  report.push('Auth: run `claude` once and sign in if prompted; then headless script will work.');

  console.log(report.join('\n'));
  process.exit(allOk ? 0 : 1);
}

main();
