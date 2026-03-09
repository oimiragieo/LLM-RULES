#!/usr/bin/env node
/**
 * Analyze a Claude Code session by merging its UI transcript (.jsonl)
 * with its raw execution debug log (.txt).
 *
 * Usage:
 *   node scripts/analyze-session-transcript.mjs [--session <id>] [--out <output.md>]
 *   pnpm debug:analyze
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `
Usage: pnpm debug:analyze [--session <id>] [--out <file.md>]

Options:
  --session <id>   The specific session UUID to analyze. (e.g. f1326443-...)
  --out <file.md>  Output markdown file path. Default is .tmp/transcript-analysis-<id>.md
  --help           Show this message.

Auto-detect behavior:
  If no --session is provided, finds the most recently modified .jsonl file 
  inside ~/.claude/projects/ and pairs it with the corresponding .txt in ~/.claude/debug/.
`;

function getClaudeHome() {
  return path.join(os.homedir(), '.claude');
}

/**
 * Determines the Claude project folder name based on the current working directory.
 * E.g., C:\dev\projects\agent-studio -> C--dev-projects-agent-studio
 */
function getProjectDir() {
  const cwd = process.cwd();
  let folderName = cwd.replace(':\\', '--').replace(/\\/g, '-').replace(/\//g, '-');
  if (folderName.startsWith('-')) {
    folderName = folderName.replace(/^-/, '');
  }
  return path.join(getClaudeHome(), 'projects', folderName);
}

/**
 * Searches the project's transcript directory for the most recent .jsonl file.
 */
function findMostRecentTranscript() {
  let searchDir = getProjectDir();
  if (!fs.existsSync(searchDir)) {
    console.warn(
      `⚠️ Warning: Specific project dir not found (${searchDir}). Falling back to global search.`
    );
    searchDir = path.join(getClaudeHome(), 'projects');
  }

  if (!fs.existsSync(searchDir)) {
    throw new Error(`Projects directory not found: ${searchDir}`);
  }

  const allFiles = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const stats = fs.statSync(fullPath);
        allFiles.push({ path: fullPath, mtime: stats.mtimeMs, name: entry.name });
      }
    }
  }

  scanDir(searchDir);

  if (allFiles.length === 0) {
    throw new Error(`No .jsonl transcripts found in ${searchDir}`);
  }

  allFiles.sort((a, b) => b.mtime - a.mtime);
  return allFiles[0];
}

/**
 * Finds the specific JSONL file for a given session ID
 */
function findTranscriptById(sessionId) {
  let searchDir = getProjectDir();
  if (!fs.existsSync(searchDir)) {
    searchDir = path.join(getClaudeHome(), 'projects');
  }

  if (!fs.existsSync(searchDir)) {
    throw new Error(`Projects directory not found: ${searchDir}`);
  }

  let foundPath = null;

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (foundPath) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.includes(sessionId) &&
        entry.name.endsWith('.jsonl')
      ) {
        foundPath = fullPath;
      }
    }
  }

  scanDir(searchDir);

  if (!foundPath) {
    throw new Error(`Transcript for session ${sessionId} not found in ${searchDir}`);
  }

  const stats = fs.statSync(foundPath);
  return { path: foundPath, mtime: stats.mtimeMs, name: path.basename(foundPath) };
}

/**
 * Finds the corresponding debug log file.
 */
function findDebugLog(sessionId) {
  const debugDir = path.join(getClaudeHome(), 'debug');
  const exactPath = path.join(debugDir, `${sessionId}.txt`);

  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  // Fallback: search for prefix matching
  if (fs.existsSync(debugDir)) {
    const files = fs.readdirSync(debugDir);
    for (const file of files) {
      if (file.includes(sessionId) && file.endsWith('.txt')) {
        return path.join(debugDir, file);
      }
    }
  }

  return null;
}

/**
 * Parses the JSONL transcript
 */
function parseTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (_e) {
      // Ignore malformed lines
    }
  }
  return events;
}

/**
 * Parses the Debug log to extract major errors
 */
function parseDebugLog(filePath) {
  if (!filePath) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const errors = [];

  for (const line of lines) {
    if (line.includes('[ERROR]') || line.includes('error:') || line.includes('BLOCKED')) {
      errors.push(line.trim());
    }
    // Also capture specific prompt length issues
    if (line.includes('prompt is too long')) {
      errors.push(line.trim());
    }
    // And JSON parsing issues
    if (line.includes('SyntaxError: Unterminated string in JSON')) {
      errors.push(line.trim());
    }
  }

  return errors;
}

/**
 * Run heuristics and generate markdown
 */
function generateReport(sessionId, transcriptEvents, debugErrors) {
  const lines = [];
  lines.push(`# Session Analysis Report: ${sessionId}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  let userMessages = 0;
  let toolUses = 0;
  let toolErrors = 0;

  const toolUsageCounts = {};
  const toolFailures = [];

  for (const event of transcriptEvents) {
    if (event.type === 'user' || event.type === 'assistant') {
      if (
        event.type === 'user' &&
        Array.isArray(event.message?.content) &&
        event.message.content.length > 0 &&
        event.message.content[0].type === 'text'
      ) {
        userMessages++;
      }

      const contentBlocks = Array.isArray(event.message?.content) ? event.message.content : [];
      for (const block of contentBlocks) {
        if (block.type === 'tool_use') {
          toolUses++;
          const name = block.name;
          toolUsageCounts[name] = (toolUsageCounts[name] || 0) + 1;
        }
        if (block.type === 'tool_result' && block.is_error) {
          toolErrors++;
          toolFailures.push(block);
        }
      }
    }
  }

  lines.push('## 📊 Overview Metrics');
  lines.push(`- **User Turns:** ${userMessages}`);
  lines.push(`- **Tool Invocations:** ${toolUses}`);
  lines.push(`- **Tool Errors:** ${toolErrors}`);
  lines.push(`- **Debug Log Errors:** ${debugErrors.length}`);
  lines.push('');

  lines.push('## 🛠️ Tool Usage Summary');
  const sortedTools = Object.entries(toolUsageCounts).sort((a, b) => b[1] - a[1]);
  for (const [tool, count] of sortedTools) {
    lines.push(`- \`${tool}\`: ${count} times`);
  }
  lines.push('');

  lines.push('## 🚨 Heuristic Findings');
  let cleanSystem = true;

  // Heuristic 1: Router Lockdown / TaskCreate Violations
  const routerLocks = debugErrors.filter(
    e => e.includes('ROUTER-LOCKDOWN') || e.includes('TASK-CREATE VIOLATION')
  );
  if (routerLocks.length > 0) {
    cleanSystem = false;
    lines.push('### ⚠️ Router Protocol Violations Detected');
    lines.push(
      'The agent system locked down due to direct file modifications bypassing the router.'
    );
    lines.push(`Occurred **${routerLocks.length}** times.`);
    lines.push('');
  }

  // Heuristic 2: Context Length Violations
  const contextOverflows = debugErrors.filter(e => e.includes('prompt is too long'));
  if (contextOverflows.length > 0) {
    cleanSystem = false;
    lines.push('### ⚠️ Context Length Exceeded (API Error)');
    lines.push('The orchestrator accumulated too many tokens and crashed the API request.');
    lines.push(`Occurred **${contextOverflows.length}** times.`);
    lines.push('');
  }

  // Heuristic 3: JSON / Parse errors from UI tools
  const jsonParseErrs = debugErrors.filter(e => e.includes('Unterminated string in JSON'));
  if (jsonParseErrs.length > 0) {
    cleanSystem = false;
    lines.push('### ⚠️ Hook JSON Parse Failures');
    lines.push('System failed to parse a tool output payload JSON.');
    lines.push(`Occurred **${jsonParseErrs.length}** times.`);
    lines.push('');
  }

  if (cleanSystem) {
    lines.push('> ✅ No major systemic hook bypasses or API crashes detected in debug logs.');
    lines.push('');
  }

  lines.push('## ❌ Top Tool Failures (from Transcript UI)');
  if (toolFailures.length === 0) {
    lines.push('None.');
  } else {
    // Show first 5
    const show = toolFailures.slice(0, 5);
    for (const fail of show) {
      if (typeof fail.content === 'string') {
        // Truncate
        const errShort = fail.content.slice(0, 150).replace(/\n/g, ' ') + '...';
        lines.push(`- \`${fail.tool_use_id}\`: ${errShort}`);
      } else if (Array.isArray(fail.content) && fail.content[0]?.text) {
        const errShort = fail.content[0].text.slice(0, 150).replace(/\n/g, ' ') + '...';
        lines.push(`- ERROR: ${errShort}`);
      }
    }
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  let sessionId = null;
  const sessionIdx = args.indexOf('--session');
  if (sessionIdx !== -1 && args[sessionIdx + 1]) {
    sessionId = args[sessionIdx + 1];
  }

  let outputPath = null;
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outputPath = args[outIdx + 1];
  }

  let transcriptMeta;
  try {
    if (sessionId) {
      console.log(`🔍 Searching for transcript with session ID: ${sessionId}`);
      transcriptMeta = findTranscriptById(sessionId);
    } else {
      console.log('🔍 Locating most recent transcript...');
      transcriptMeta = findMostRecentTranscript();
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  console.log(`📄 Found Transcript: ${transcriptMeta.path}`);
  // Extract clean UUID from the file name (e.g. f1326443-490f-486b-bb67-01c72bf42408)
  const exactSessionId = transcriptMeta.name.replace('.jsonl', '');

  const debugLogPath = findDebugLog(exactSessionId);
  if (!debugLogPath) {
    console.warn(`⚠️ Warning: No matching debug log found for session ${exactSessionId}`);
  } else {
    console.log(`🐛 Found Debug Log:  ${debugLogPath}`);
  }

  console.log('🧩 Parsing files and executing heuristics...');
  const events = parseTranscript(transcriptMeta.path);
  const debugErrors = parseDebugLog(debugLogPath);

  const report = generateReport(exactSessionId, events, debugErrors);

  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), '..');
  const tmpDir = path.join(projectRoot, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const finalOutput = outputPath
    ? path.resolve(outputPath)
    : path.join(tmpDir, `transcript-analysis-${exactSessionId.slice(0, 8)}.md`);

  fs.writeFileSync(finalOutput, report, 'utf8');
  console.log(`✅ Report generated at: ${finalOutput}`);
}

main();
