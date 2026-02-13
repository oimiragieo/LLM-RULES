#!/usr/bin/env node
/**
 * Verify Debug Log Remediation
 * Checks the most recent Claude Code debug log for the three remediation indicators:
 * 1. No "Failed to parse hook output as JSON" (Part 1 fix)
 * 2. No "Missing required elements: TaskUpdate Warning Box, Task ID Reference" (Part 2 fix)
 * 3. No "Failed to parse agent from ... __tests__" and no "invalid model 'claude-haiku-4-5'" (Part 3 fix)
 *
 * Usage: node .claude/tools/cli/verify-debug-log-remediation.mjs [path-to-debug-log]
 * If no path given, uses the most recent .txt in %USERPROFILE%\.claude\debug (or ~/.claude/debug).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEBUG_DIR =
  process.env.CLAUDE_DEBUG_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'debug');

function getLatestDebugLog(dir, optionalPath) {
  if (optionalPath) {
    const p = path.resolve(optionalPath);
    if (fs.existsSync(p)) return p;
    return null;
  }
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  if (files.length === 0) return null;
  const withStats = files.map(f => ({
    path: path.join(dir, f),
    mtime: fs.statSync(path.join(dir, f)).mtimeMs,
  }));
  withStats.sort((a, b) => b.mtime - a.mtime);
  return withStats[0].path;
}

function main() {
  const logPath = getLatestDebugLog(DEBUG_DIR, process.argv[2]);
  if (!logPath) {
    console.error('No debug log found. Run a Claude Code session with debug enabled first.');
    process.exit(1);
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  const parseFail = lines.filter(l => l.includes('Failed to parse hook output as JSON'));
  const missingRequired = lines.filter(
    l =>
      l.includes('Missing required elements') &&
      (l.includes('TaskUpdate Warning Box') || l.includes('Task ID Reference'))
  );
  const testsReadme = lines.filter(
    l =>
      l.includes('Failed to parse agent') &&
      (l.includes('__tests__') || l.includes('tests\\README'))
  );
  const invalidModel = lines.filter(
    l =>
      l.includes("invalid model 'claude-haiku-4-5'") ||
      l.includes("invalid model 'claude-haiku-4-5'")
  );
  const readMissing = lines.filter(l =>
    l.includes('Read tool validation error: File does not exist.')
  );
  const bashToolError = lines.filter(l => l.includes('Bash tool error'));
  const badSubstitution = lines.filter(l => l.includes('Bad substitution'));
  const secretLeak = lines.filter(l =>
    /(?:apiKey|exaApiKey)=(?!\[REDACTED\])[^&\s"'`]+|authorization:\s*bearer\s+(?!\[REDACTED\])[a-z0-9._-]+|x-api-key\s*[:=]\s*(?!\[REDACTED\])[^\s]+/i.test(
      l
    )
  );
  const maxReadMissing = Number(process.env.DEBUG_LOG_MAX_READ_MISSING || 6);
  const maxBashToolError = Number(process.env.DEBUG_LOG_MAX_BASH_TOOL_ERROR || 3);
  const maxBadSubstitution = Number(process.env.DEBUG_LOG_MAX_BAD_SUBSTITUTION || 2);

  console.log('Debug log:', logPath);
  console.log('');

  let ok = true;

  if (parseFail.length > 0) {
    console.log(
      'FAIL: "Failed to parse hook output as JSON" still present:',
      parseFail.length,
      'occurrence(s)'
    );
    ok = false;
  } else {
    console.log('PASS: No "Failed to parse hook output as JSON" lines (Part 1).');
  }

  if (missingRequired.length > 0) {
    console.log(
      'FAIL: "Missing required elements: TaskUpdate Warning Box, Task ID Reference" still present:',
      missingRequired.length,
      'occurrence(s)'
    );
    ok = false;
  } else {
    console.log('PASS: No spawn-prompt validation missing-required errors (Part 2).');
  }

  if (testsReadme.length > 0) {
    console.log(
      'FAIL: Agent parse error for __tests__/README still present:',
      testsReadme.length,
      'occurrence(s)'
    );
    ok = false;
  } else {
    console.log('PASS: No "Failed to parse agent from ... __tests__/README" (Part 3.2).');
  }

  if (invalidModel.length > 0) {
    console.log(
      "FAIL: Invalid model 'claude-haiku-4-5' still present:",
      invalidModel.length,
      'occurrence(s)'
    );
    ok = false;
  } else {
    console.log("PASS: No invalid model 'claude-haiku-4-5' for context-compressor (Part 3.1).");
  }

  if (readMissing.length > maxReadMissing) {
    console.log(
      `FAIL: Read missing-file noise ${readMissing.length} exceeds max ${maxReadMissing} (pre-hook MCP reads likely).`
    );
    ok = false;
  } else {
    console.log(
      `PASS: Read missing-file noise within threshold (${readMissing.length}/${maxReadMissing}).`
    );
  }

  if (bashToolError.length > maxBashToolError) {
    console.log(
      `FAIL: "Bash tool error" count ${bashToolError.length} exceeds max ${maxBashToolError}.`
    );
    ok = false;
  } else {
    console.log(
      `PASS: "Bash tool error" noise within threshold (${bashToolError.length}/${maxBashToolError}).`
    );
  }

  if (badSubstitution.length > maxBadSubstitution) {
    console.log(
      `FAIL: "Bad substitution" count ${badSubstitution.length} exceeds max ${maxBadSubstitution}.`
    );
    ok = false;
  } else {
    console.log(
      `PASS: "Bad substitution" noise within threshold (${badSubstitution.length}/${maxBadSubstitution}).`
    );
  }

  if (secretLeak.length > 0) {
    console.log(`FAIL: Potential secret leakage detected (${secretLeak.length} line(s)).`);
    ok = false;
  } else {
    console.log('PASS: No API key/token leakage patterns detected in log.');
  }

  console.log('');
  if (ok) {
    console.log('All remediation checks passed for this log.');
    process.exit(0);
  } else {
    console.log('Some checks failed. See above.');
    process.exit(1);
  }
}

main();
