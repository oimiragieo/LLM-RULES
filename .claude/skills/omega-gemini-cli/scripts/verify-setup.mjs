#!/usr/bin/env node
/**
 * Verify omega-gemini-cli headless setup: Node and Gemini CLI only. No MCP required.
 * Exit 0 if all OK, 1 otherwise. Read-only.
 * Usage: node verify-setup.mjs
 */
import { execSync } from 'child_process';

const MIN_NODE_MAJOR = 18;
const MIN_GEMINI_MAJOR = 0;
const MIN_GEMINI_MINOR = 1;

function checkNode() {
  const v = process.version.slice(1).split('.')[0];
  const major = parseInt(v, 10);
  if (major >= MIN_NODE_MAJOR) return { ok: true };
  return { ok: false, message: `Node ${MIN_NODE_MAJOR}+ required; current: ${process.version}` };
}

function getGeminiVersion(how) {
  try {
    const cmd = how === 'npx' ? 'npx -y @google/gemini-cli --version' : 'gemini --version';
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    const match = (out || '').trim().match(/(\d+)\.(\d+)/);
    if (match)
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        raw: (out || '').trim(),
      };
    return { raw: (out || '').trim() };
  } catch {
    return null;
  }
}

function checkGeminiCLI() {
  try {
    execSync('gemini -help', { stdio: 'pipe', timeout: 5000 });
    const ver = getGeminiVersion('gemini');
    const versionOk = !ver || (ver.major >= MIN_GEMINI_MAJOR && ver.minor >= MIN_GEMINI_MINOR);
    return {
      ok: true,
      how: 'gemini',
      version: ver && ver.raw ? ver.raw : undefined,
      versionWarning: versionOk
        ? undefined
        : `Gemini CLI ${ver?.raw || '?'} may be older than ${MIN_GEMINI_MAJOR}.${MIN_GEMINI_MINOR}; headless script may need a newer version.`,
    };
  } catch {
    try {
      execSync('npx -y @google/gemini-cli -help', { stdio: 'pipe', timeout: 15000 });
      const ver = getGeminiVersion('npx');
      return {
        ok: true,
        how: 'npx @google/gemini-cli',
        version: ver && ver.raw ? ver.raw : undefined,
      };
    } catch {
      return {
        ok: false,
        message:
          'Gemini CLI not found. Install: npm install -g @google/gemini-cli or use npx @google/gemini-cli',
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

  const geminiResult = checkGeminiCLI();
  if (geminiResult.ok) {
    report.push(
      'OK Gemini CLI: ' +
        (geminiResult.how || 'found') +
        (geminiResult.version ? ' (' + geminiResult.version + ')' : '')
    );
    if (geminiResult.versionWarning) {
      report.push('WARN ' + geminiResult.versionWarning);
    }
  } else {
    report.push('MISSING Gemini CLI: ' + geminiResult.message);
    allOk = false;
  }

  report.push('Headless mode: no MCP config required. Use scripts/ask-gemini.mjs to run Gemini.');
  report.push('Auth: run `gemini` once and sign in if prompted; then headless script will work.');

  console.log(report.join('\n'));
  process.exit(allOk ? 0 : 1);
}

main();
