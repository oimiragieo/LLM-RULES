#!/usr/bin/env node
/**
 * Verify omega-cursor-cli headless setup: Node and Cursor Agent CLI only. No MCP required.
 * Exit 0 if all OK, 1 otherwise. Read-only.
 * Usage: node verify-setup.mjs
 */
import { execSync } from 'child_process';

const MIN_NODE_MAJOR = 18;

function checkNode() {
  const v = process.version.slice(1).split('.')[0];
  const major = Number.parseInt(v, 10);
  if (major >= MIN_NODE_MAJOR) return { ok: true };
  return { ok: false, message: `Node ${MIN_NODE_MAJOR}+ required; current: ${process.version}` };
}

function checkCursorAgentCLI() {
  const candidates = [
    { cmd: 'agent --version', how: 'agent' },
    { cmd: 'cursor-agent --version', how: 'cursor-agent' },
  ];
  for (const { cmd, how } of candidates) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 5000 });
      return { ok: true, how };
    } catch {
      // try next candidate
    }
  }
  try {
    execSync('npx -y @cursor/agent --version', {
      stdio: 'pipe',
      timeout: 15000,
    });
    return { ok: true, how: 'npx @cursor/agent' };
  } catch {
    return {
      ok: false,
      message:
        'Cursor Agent CLI not found. Install: npm install -g @cursor/agent or use npx -y @cursor/agent',
    };
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

  const cursorResult = checkCursorAgentCLI();
  if (cursorResult.ok) {
    report.push('OK Cursor Agent CLI: ' + (cursorResult.how || 'found'));
  } else {
    report.push('MISSING Cursor Agent CLI: ' + cursorResult.message);
    allOk = false;
  }

  report.push(
    'Headless mode: no MCP config required. Use scripts/ask-cursor.mjs to run cursor-agent.'
  );
  report.push('Auth: run `cursor-agent login` once if prompted, then retry.');

  console.log(report.join('\n'));
  process.exit(allOk ? 0 : 1);
}

main();
