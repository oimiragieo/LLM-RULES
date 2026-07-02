'use strict';

/**
 * diff-engine.cjs — Git diff computation for code review.
 *
 * Exports three functions that parse unified diff output from git into a
 * structured representation:
 *
 *   computeBaseBranchDiff(repoPath, baseBranch)
 *     → { files: [{path, binary, hunks, additions, deletions}] }
 *
 *   computeUncommittedDiff(repoPath)
 *     → same format, covering staged + unstaged + untracked changes
 *
 *   computeCommitDiff(repoPath, commitHash)
 *     → same format, for a specific commit (including initial commits)
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Execute a git command and return its stdout.
 *
 * Uses execFileSync (argv form, no shell) so that refs such as `baseBranch`
 * and `commitHash` are passed as literal arguments to git and can never be
 * interpreted as shell syntax — closing a command-injection hole.
 *
 * @param {string[]} args - git arguments (without the leading "git")
 * @param {string} cwd    - Working directory
 * @returns {string}
 */
function runGit(args, cwd) {
  // git diff exits 0 for empty diffs; a non-zero exit means an invalid ref or
  // other git error — let it propagate to the caller.
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

/**
 * Detect whether a Buffer contains binary (non-text) content by scanning for
 * null bytes in the first 8 000 bytes (same heuristic used by git).
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isBinaryBuffer(buf) {
  const sample = buf.length > 8000 ? buf.slice(0, 8000) : buf;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Unified diff parser
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff string (as produced by `git diff`, `git show`, or
 * `git diff-tree`) into an array of file-diff objects.
 *
 * Each object has the shape:
 *   {
 *     path:      string,           // b-side path (or a-side for deletions)
 *     binary:    boolean,
 *     hunks:     Hunk[],
 *     additions: number,
 *     deletions: number,
 *   }
 *
 * where Hunk is:
 *   {
 *     header:   string,   // e.g. "@@ -1,3 +1,4 @@ optional context"
 *     oldStart: number,
 *     oldLines: number,
 *     newStart: number,
 *     newLines: number,
 *     lines:    string[], // diff lines (prefixed with +, -, or space)
 *   }
 *
 * @param {string} diffOutput
 * @returns {Array<{path:string,binary:boolean,hunks:object[],additions:number,deletions:number}>}
 */
function parseUnifiedDiff(diffOutput) {
  if (!diffOutput || !diffOutput.trim()) return [];

  const result = [];
  const lines = diffOutput.split('\n');

  /** @type {{path:string,binary:boolean,hunks:object[],additions:number,deletions:number}|null} */
  let currentFile = null;
  /** @type {{header:string,oldStart:number,oldLines:number,newStart:number,newLines:number,lines:string[]}|null} */
  let currentHunk = null;

  /**
   * Push the currently-open hunk into currentFile (if any).
   */
  function flushHunk() {
    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk);
      currentHunk = null;
    }
  }

  /**
   * Push the currently-open file into result (if any).
   */
  function flushFile() {
    flushHunk();
    if (currentFile) {
      result.push(currentFile);
      currentFile = null;
    }
  }

  for (const line of lines) {
    // -----------------------------------------------------------------------
    // New file header: diff --git a/<path> b/<path>
    // -----------------------------------------------------------------------
    if (line.startsWith('diff --git ')) {
      flushFile();

      // Extract the b-side path as initial guess; will be overridden by
      // the +++ line for accuracy (handles renames, spaces in filenames, etc.)
      const gitMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        path: gitMatch ? gitMatch[2] : '',
        binary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!currentFile) continue;

    // -----------------------------------------------------------------------
    // Binary marker
    // -----------------------------------------------------------------------
    if (line.startsWith('Binary files')) {
      currentFile.binary = true;
      continue;
    }

    // -----------------------------------------------------------------------
    // --- a/<path>  (old-side path; used to determine path for deletions)
    // -----------------------------------------------------------------------
    if (line.startsWith('--- ') && !currentFile.binary) {
      if (line !== '--- /dev/null') {
        const m = line.match(/^--- [ab]\/(.+)$/);
        if (m) currentFile._oldPath = m[1];
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // +++ b/<path>  (new-side path — most reliable source for the file path)
    // -----------------------------------------------------------------------
    if (line.startsWith('+++ ') && !currentFile.binary) {
      if (line === '+++ /dev/null') {
        // Deleted file — use the old-side path
        if (currentFile._oldPath) currentFile.path = currentFile._oldPath;
      } else {
        const m = line.match(/^\+\+\+ [ab]\/(.+)$/);
        if (m) currentFile.path = m[1];
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Hunk header: @@ -oldStart[,oldLines] +newStart[,newLines] @@ [context]
    // -----------------------------------------------------------------------
    if (line.startsWith('@@ ') && !currentFile.binary) {
      flushHunk();
      const m = line.match(/^(@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@)/);
      if (m) {
        currentHunk = {
          header: line, // include any trailing context text
          oldStart: parseInt(m[2], 10),
          oldLines: m[3] !== undefined ? parseInt(m[3], 10) : 1,
          newStart: parseInt(m[4], 10),
          newLines: m[5] !== undefined ? parseInt(m[5], 10) : 1,
          lines: [],
        };
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Hunk content lines
    // -----------------------------------------------------------------------
    if (currentHunk && !currentFile.binary) {
      if (line.startsWith('+')) {
        currentFile.additions++;
        currentHunk.lines.push(line);
      } else if (line.startsWith('-')) {
        currentFile.deletions++;
        currentHunk.lines.push(line);
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push(line);
      }
      // Lines starting with '\' are "No newline at end of file" markers — skip.
      // Lines that don't match any prefix (e.g. blank lines between hunks) — skip.
    }
  }

  flushFile();

  // Clean up private _oldPath tracking field from all file objects
  for (const f of result) {
    delete f._oldPath;
    // Ensure binary files never carry stale hunk/count data
    if (f.binary) {
      f.hunks = [];
      f.additions = 0;
      f.deletions = 0;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the diff between the merge-base of `baseBranch` and HEAD.
 * This is the standard PR-style diff showing all commits ahead of the base.
 *
 * @param {string} repoPath   - Absolute path to the git repository root
 * @param {string} baseBranch - Branch name, tag, or commit ref to diff against
 * @returns {{ files: Array }}
 */
function computeBaseBranchDiff(repoPath, baseBranch) {
  // Three-dot syntax: diff from merge-base of baseBranch and HEAD to HEAD
  const diffOutput = runGit(['diff', String(baseBranch) + '...HEAD', '--unified=3'], repoPath);
  return { files: parseUnifiedDiff(diffOutput) };
}

/**
 * Compute the diff for all uncommitted changes: staged, unstaged, and untracked.
 *
 * Strategy:
 *   - `git diff HEAD` captures both staged and unstaged changes to tracked files.
 *   - `git ls-files --others --exclude-standard` lists untracked files which
 *     are then read directly and represented as all-addition hunks.
 *
 * @param {string} repoPath - Absolute path to the git repository root
 * @returns {{ files: Array }}
 */
function computeUncommittedDiff(repoPath) {
  const files = [];
  const seen = new Set();

  // --- Staged + unstaged (tracked files only) ---
  let headDiff = '';
  try {
    headDiff = runGit(['diff', 'HEAD', '--unified=3'], repoPath);
  } catch {
    // No HEAD yet (empty repo) or other error — fall back to staged-only diff
    try {
      headDiff = runGit(['diff', '--cached', '--unified=3'], repoPath);
    } catch {
      headDiff = '';
    }
  }

  for (const f of parseUnifiedDiff(headDiff)) {
    seen.add(f.path);
    files.push(f);
  }

  // --- Untracked files ---
  let untrackedOutput = '';
  try {
    untrackedOutput = runGit(['ls-files', '--others', '--exclude-standard'], repoPath);
  } catch {
    untrackedOutput = '';
  }

  for (const relPath of untrackedOutput.split('\n').filter(Boolean)) {
    if (seen.has(relPath)) continue;

    const fullPath = path.join(repoPath, relPath);
    let buf;
    try {
      buf = fs.readFileSync(fullPath);
    } catch {
      continue; // File unreadable — skip silently
    }

    if (isBinaryBuffer(buf)) {
      files.push({ path: relPath, binary: true, hunks: [], additions: 0, deletions: 0 });
      continue;
    }

    // Represent the entire file as a single addition hunk
    const content = buf.toString('utf8');
    const rawLines = content.split('\n');
    // Remove trailing empty element produced by a final newline
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }

    const lineCount = rawLines.length;
    files.push({
      path: relPath,
      binary: false,
      hunks: [
        {
          header: `@@ -0,0 +1,${lineCount} @@`,
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: lineCount,
          lines: rawLines.map(l => `+${l}`),
        },
      ],
      additions: lineCount,
      deletions: 0,
    });
  }

  return { files };
}

/**
 * Compute the diff introduced by a specific commit.
 * Works for any commit including the initial one (no parent).
 *
 * @param {string} repoPath    - Absolute path to the git repository root
 * @param {string} commitHash  - Full or abbreviated commit hash
 * @returns {{ files: Array }}
 */
function computeCommitDiff(repoPath, commitHash) {
  // `git diff-tree --no-commit-id -p -r` shows the diff for the commit vs its
  // parent(s). `--root` ensures the initial commit (no parent) is treated as a
  // diff against the empty tree, so all added files are included.
  const diffOutput = runGit(
    ['diff-tree', '--no-commit-id', '-p', '-r', '--root', String(commitHash)],
    repoPath
  );
  return { files: parseUnifiedDiff(diffOutput) };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  computeBaseBranchDiff,
  computeUncommittedDiff,
  computeCommitDiff,
  // Exposed for testing / reuse in the pipeline layer
  parseUnifiedDiff,
};
