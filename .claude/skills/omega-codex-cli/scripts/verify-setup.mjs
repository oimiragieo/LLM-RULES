#!/usr/bin/env node
/**
 * Verify omega-codex-cli headless setup: Node and Codex CLI only. No MCP required.
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

function checkCodexCLI() {
  try {
    execSync('codex --version', { stdio: 'pipe', timeout: 5000 });
    return { ok: true, how: 'codex' };
  } catch {
    try {
      execSync('npx -y @openai/codex --version', {
        stdio: 'pipe',
        timeout: 15000,
      });
      return { ok: true, how: 'npx @openai/codex' };
    } catch {
      return {
        ok: false,
        message:
          'Codex CLI not found. Install: npm install -g @openai/codex or use npx @openai/codex',
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

  const codexResult = checkCodexCLI();
  if (codexResult.ok) {
    report.push('OK Codex CLI: ' + (codexResult.how || 'found'));
  } else {
    report.push('MISSING Codex CLI: ' + codexResult.message);
    allOk = false;
  }

  report.push('Headless mode: no MCP config required. Use scripts/ask-codex.mjs to run codex.');
  report.push('Auth: run `codex login` (or `codex`) once if prompted, then retry.');

  console.log(report.join('\n'));
  process.exit(allOk ? 0 : 1);
}

main();
