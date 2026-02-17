/**
 * Standard Tools for Agents
 * =========================
 *
 * Implements core tools (Read, Write, Edit, Bash, Glob, Grep)
 * for use by specialized agents running within the Orchestrator tool.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const { glob } = require('glob');
const { sanitizePath, PROJECT_ROOT } = require('../utils/project-root.cjs');

const execAsync = util.promisify(exec);

// Helper to get ripgrep path
function getRgPath() {
  try {
    const { rgPath } = require('@vscode/ripgrep');
    return rgPath;
  } catch {
    return 'rg'; // Fallback to system path
  }
}

const StandardTools = {};

/**
 * Read file content
 */
StandardTools.Read = async function ({ path: filePath }) {
  const safePath = sanitizePath(filePath, PROJECT_ROOT);
  return await fs.promises.readFile(safePath, 'utf8');
};

/**
 * Write file content
 */
StandardTools.Write = async function ({ path: filePath, content }) {
  const safePath = sanitizePath(filePath, PROJECT_ROOT);
  const dir = path.dirname(safePath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  await fs.promises.writeFile(safePath, content, 'utf8');
  return `Successfully wrote to ${path.relative(PROJECT_ROOT, safePath).replace(/\\/g, '/')}`;
};

/**
 * Edit file (simple replace)
 * Expects edits: [{ oldText, newText }]
 */
StandardTools.Edit = async function ({ path: filePath, edits, dryRun }) {
  const safePath = sanitizePath(filePath, PROJECT_ROOT);
  const content = await fs.promises.readFile(safePath, 'utf8');

  // Naive implementation matching typical Agent behavior
  // Real implementation should use more robust patching
  let modified = content;

  for (const edit of edits) {
    if (!modified.includes(edit.oldText)) {
      throw new Error(`Text to replace not found in ${filePath}`);
    }
    modified = modified.replace(edit.oldText, edit.newText);
  }

  if (dryRun) {
    return modified;
  }

  await fs.promises.writeFile(safePath, modified, 'utf8');
  return `Successfully edited ${path.relative(PROJECT_ROOT, safePath).replace(/\\/g, '/')}`;
};

/**
 * Execute Bash command
 */
StandardTools.Bash = async function ({ command }) {
  // SECURITY WARNING: In production, this needs strict sandboxing!
  if (!command) throw new Error('Command required');

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return stdout || stderr;
  } catch (error) {
    return `Error: ${error.message}\nStderr: ${error.stderr}\nStdout: ${error.stdout}`;
  }
};

/**
 * Glob search
 */
StandardTools.Glob = async function ({ pattern, path: basePath = '.' }) {
  // Ensure basePath doesn't traverse out
  const safeBase = sanitizePath(basePath, PROJECT_ROOT);

  // Glob pattern is relative to the cwd (PROJECT_ROOT)
  // If basePath provides a subdirectory, we should join it.
  // However, fast-glob/glob patterns are forward-slash only.

  // Construct effective pattern:
  // If pattern is provided, use it relative to safeBase?
  // Usually agents pass { path: 'src' } expecting to list files there.
  // If pattern is missing, default to '**/*'

  const effectivePattern = pattern || '**/*';
  const cwd = safeBase; // Run glob inside the target directory

  const matches = await glob(effectivePattern, {
    cwd: cwd,
    nodir: true,
    ignore: ['node_modules/**', '.git/**'],
    windowsPathsNoEscape: true,
  });

  // Return relative paths to the PROJECT_ROOT (?)
  // Agents might expect paths relative to the `path` argument or project root.
  // Usually project root.
  // glob returns paths relative to `cwd`.
  // So we need to map them back to project root relative if cwd != PROJECT_ROOT.

  if (cwd !== PROJECT_ROOT) {
    return matches
      .map(m => path.join(path.relative(PROJECT_ROOT, cwd), m).replace(/\\/g, '/'))
      .join('\n');
  }

  return matches.join('\n');
};

/**
 * Grep search
 */
StandardTools.Grep = async function ({ query, path: searchPath = '.' }) {
  const rg = getRgPath();
  const cmd = `"${rg}" -i -n "${query}" "${searchPath}"`;

  try {
    const { stdout } = await execAsync(cmd, { cwd: PROJECT_ROOT });
    return stdout;
  } catch (e) {
    // grep returns non-zero if no matches
    return e.stdout || '';
  }
};

module.exports = { StandardTools };

// Aliases & Wrappers for Agent Compatibility

// writeFile: Agents pass { file, content } -> Write expects { path, content }
StandardTools.writeFile = async function (args) {
  return StandardTools.Write({
    path: args.file || args.path,
    content: args.content,
  });
};

// readFile: Agents pass { file } or { path } -> Read expects { path }
StandardTools.readFile = async function (args) {
  return StandardTools.Read({
    path: args.file || args.path,
  });
};

// exec: Agents expect { exitCode, stdout, stderr } -> Bash returns string
StandardTools.exec = async function (args) {
  if (!args.command) throw new Error('Command required');
  try {
    const { stdout, stderr } = await execAsync(args.command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: stdout || '',
      stderr: stderr || '',
    };
  } catch (error) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
    };
  }
};

// listFiles: Agents pass { path } -> Glob expects { pattern, path }
StandardTools.listFiles = async function (args) {
  return StandardTools.Glob({
    path: args.path || '.',
    pattern: args.pattern, // Optional, defaults to '**/*' inside Glob if missing
  });
};

StandardTools.deleteFile = async function ({ path: filePath }) {
  const safePath = sanitizePath(filePath, PROJECT_ROOT);
  await fs.promises.unlink(safePath);
  return `Successfully deleted ${path.relative(PROJECT_ROOT, safePath).replace(/\\/g, '/')}`;
};
