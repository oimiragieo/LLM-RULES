/**
 * Logical Unit Tracker
 *
 * Groups commits by task/feature based on git notes.
 * Enables "revert feature X" instead of requiring commit hashes.
 *
 * @module logical-unit-tracker
 */

const { execFileSync } = require('node:child_process');
const { safeParseJSON } = require('./safe-json.cjs');

function runGit(repoPath, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoPath,
    windowsHide: true,
    ...options,
  });
}

/**
 * Extract task ID from git note
 * Supports formats: "TASK-#6", "[TASK-#7]", "TASK-#8: Description", JSON
 *
 * @param {string} note - Git note content
 * @returns {string|null} - Task ID (numeric only) or null
 */
function extractTaskId(note) {
  if (!note) return null;

  // Try JSON format first (git-notes-audit hook output)
  try {
    const parsed = safeParseJSON(note);
    if (parsed.taskId) {
      return String(parsed.taskId).replace(/^#/, '');
    }
  } catch (_err) {
    // Not JSON, continue with regex
  }

  // Try regex patterns: TASK-#6, [TASK-#7], TASK-#8:
  const match = note.match(/TASK-#(\d+)/i);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Get commits in range with their notes
 *
 * @param {string} repoPath - Repository path
 * @param {string} range - Commit range (e.g., "HEAD~3..HEAD")
 * @returns {Promise<Array>} - Array of {hash, message, date, author, note, metadata, cherryPicked}
 */
async function getCommits(repoPath, range) {
  try {
    // Get commit hashes, messages, dates, and authors
    // Exclude notes refs to avoid including git notes metadata commits
    const log = runGit(
      repoPath,
      ['log', '--format=%H|||%s|||%ai|||%an', range, '--not', '--glob=refs/notes/*'],
      { encoding: 'utf8' }
    ).trim();

    if (!log) return [];

    const commits = log.split('\n').map(line => {
      const [hash, message, date, author] = line.split('|||');
      return {
        hash,
        message,
        date,
        author,
        note: null,
        metadata: {},
        cherryPicked: message.includes('cherry picked from commit'),
      };
    });

    // Get git notes for each commit
    for (const commit of commits) {
      try {
        const note = runGit(repoPath, ['notes', 'show', commit.hash], {
          encoding: 'utf8',
        }).trim();
        commit.note = note;

        // Try to parse JSON metadata
        try {
          const parsed = safeParseJSON(note);
          commit.metadata = parsed.metadata || {};
        } catch (_err) {
          // Not JSON, no metadata
        }
      } catch (_err) {
        // No note for this commit
      }
    }

    return commits;
  } catch (_err) {
    // Invalid range or no commits
    return [];
  }
}

/**
 * Group commits by task ID from git notes
 *
 * @param {string} repoPath - Repository path
 * @param {string} range - Commit range
 * @returns {Promise<Object>} - {taskId: [{hash, message, ...}]}
 */
async function groupByTask(repoPath, range) {
  const commits = await getCommits(repoPath, range);
  const groups = {};

  for (const commit of commits) {
    const taskId = extractTaskId(commit.note);

    const key = taskId || 'unknown';
    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(commit);
  }

  return groups;
}

/**
 * Find dependencies for a task
 *
 * @param {string} repoPath - Repository path
 * @param {string} taskId - Task ID to check
 * @param {Object} options - {transitive: boolean}
 * @returns {Promise<Array<string>>} - Array of task IDs this task depends on
 */
async function findDependencies(repoPath, taskId, options = {}) {
  const { transitive = false } = options;
  const commits = await getCommits(repoPath, '--all');

  const dependencies = new Set();

  for (const commit of commits) {
    const commitTaskId = extractTaskId(commit.note);
    if (commitTaskId === taskId) {
      // Extract Depends-On from note
      const match = commit.note?.match(/Depends-On:\s*TASK-#(\d+)/i);
      if (match) {
        dependencies.add(match[1]);
      }
    }
  }

  if (!transitive) {
    return Array.from(dependencies);
  }

  // Resolve transitive dependencies
  const allDeps = new Set(dependencies);
  for (const dep of dependencies) {
    const transitiveDeps = await findDependencies(repoPath, dep, { transitive: true });
    transitiveDeps.forEach(d => allDeps.add(d));
  }

  return Array.from(allDeps);
}

/**
 * Check if reverting a task is safe (no dependents)
 *
 * @param {string} repoPath - Repository path
 * @param {string} taskId - Task ID to check
 * @param {Object} options - {force: boolean}
 * @returns {Promise<Object>} - {safe: boolean, blockers: Array, warning: string, warnings: Array}
 */
async function checkRevertSafety(repoPath, taskId, options = {}) {
  const { force = false } = options;
  const commits = await getCommits(repoPath, '--all');

  const blockers = new Set();

  // Find all unique tasks
  const taskIds = new Set(
    commits.map(c => extractTaskId(c.note)).filter(id => id && id !== 'unknown' && id !== taskId)
  );

  // Check each task for dependencies on this task
  for (const commitTaskId of taskIds) {
    const deps = await findDependencies(repoPath, commitTaskId, { transitive: false });
    if (deps.includes(taskId)) {
      blockers.add(commitTaskId);
    }
  }

  const blockerArray = Array.from(blockers);

  if (force) {
    return {
      safe: true,
      blockers: blockerArray,
      warnings:
        blockerArray.length > 0
          ? [`Warning: Reverting Task #${taskId} may break: ${blockerArray.join(', ')}`]
          : [],
    };
  }

  if (blockerArray.length > 0) {
    return {
      safe: false,
      blockers: blockerArray,
      warning: `Cannot revert Task #${taskId}: tasks ${blockerArray.join(', ')} depend on it`,
      warnings: [],
    };
  }

  return { safe: true, blockers: [], warnings: [] };
}

/**
 * Revert all commits for a task (in reverse chronological order - newest first)
 *
 * @param {string} repoPath - Repository path
 * @param {string} taskId - Task ID to revert
 * @returns {Promise<Object>} - {success: boolean, conflicts: boolean, message: string}
 */
async function revertTask(repoPath, taskId) {
  const commits = await getCommits(repoPath, '--all');
  const taskCommits = commits
    .filter(c => extractTaskId(c.note) === taskId)
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

  if (taskCommits.length === 0) {
    return {
      success: false,
      conflicts: false,
      message: `No commits found for Task #${taskId}`,
    };
  }

  try {
    for (const commit of taskCommits) {
      runGit(repoPath, ['revert', '--no-edit', commit.hash], { stdio: 'pipe' });

      // Add git note to revert commit
      const latestHash = runGit(repoPath, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      runGit(repoPath, ['notes', 'add', '-m', `REVERTED-TASK-#${taskId}`, latestHash]);

      // Mark original commit as reverted
      const originalNote = commit.note || '';
      const updatedNote = `${originalNote}\n[REVERTED]`;
      runGit(repoPath, ['notes', 'add', '-f', '-m', updatedNote, commit.hash]);
    }

    return {
      success: true,
      conflicts: false,
      message: `Successfully reverted ${taskCommits.length} commit(s) for Task #${taskId}`,
    };
  } catch (err) {
    // Check if it's a merge conflict
    if (err.message.includes('CONFLICT') || err.message.includes('conflict')) {
      return {
        success: false,
        conflicts: true,
        message: 'Revert failed: merge conflict detected. Resolve manually and continue.',
      };
    }

    return {
      success: false,
      conflicts: false,
      message: `Revert failed: ${err.message}`,
    };
  }
}

/**
 * Find task by name (search in git notes)
 *
 * @param {string} repoPath - Repository path
 * @param {string} name - Task name to search for
 * @returns {Promise<Array<string>>} - Array of matching task IDs
 */
async function findTaskByName(repoPath, name) {
  const commits = await getCommits(repoPath, '--all');
  const matchingTasks = new Set();

  for (const commit of commits) {
    if (commit.note && commit.note.includes(name)) {
      const taskId = extractTaskId(commit.note);
      if (taskId && taskId !== 'unknown') {
        matchingTasks.add(taskId);
      }
    }
  }

  return Array.from(matchingTasks);
}

module.exports = {
  groupByTask,
  findUnit: groupByTask, // Alias
  findDependencies,
  checkRevertSafety,
  revertTask,
  suggestReversal: checkRevertSafety, // Alias
  findTaskByName,
  runGit,
};
