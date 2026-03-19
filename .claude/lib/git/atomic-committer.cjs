'use strict';

/**
 * Per-Task Atomic Git Commits
 *
 * Ensures each task produces exactly one atomic commit capturing
 * all changes for that specific task. Features:
 *   - Conventional commit message generation
 *   - Scope validation (no extra/missing files)
 *   - Co-author attribution
 *   - Task ID footer
 *   - Windows path normalization
 *
 * @module atomic-committer
 */

/**
 * Build a conventional commit message.
 *
 * @param {{ type: string, scope?: string, subject: string, body?: string, coAuthor?: string, taskId?: string }} opts
 * @returns {string}
 */
function buildCommitMessage(opts) {
  if (!opts.type) throw new Error('Commit type is required');
  if (!opts.subject) throw new Error('Commit subject is required');

  const header = opts.scope
    ? `${opts.type}(${opts.scope}): ${opts.subject}`
    : `${opts.type}: ${opts.subject}`;

  const parts = [header];

  if (opts.body) {
    parts.push('');
    parts.push(opts.body);
  }

  const footers = [];
  if (opts.taskId) footers.push(`Task: ${opts.taskId}`);
  if (opts.coAuthor) footers.push(`Co-Authored-By: ${opts.coAuthor}`);

  if (footers.length > 0) {
    parts.push('');
    parts.push(...footers);
  }

  return parts.join('\n');
}

/**
 * Normalize a file path (Windows backslashes → forward slashes).
 * @param {string} p
 * @returns {string}
 */
function normPath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Validate that staged files match task scope.
 *
 * @param {{ taskFiles: string[], stagedFiles: string[] }} opts
 * @returns {{ valid: boolean, extraFiles: string[], missingFiles: string[] }}
 */
function validateCommitScope(opts) {
  const taskSet = new Set((opts.taskFiles || []).map(normPath));
  const stagedSet = new Set((opts.stagedFiles || []).map(normPath));

  const extraFiles = [...stagedSet].filter(f => !taskSet.has(f));
  const missingFiles = [...taskSet].filter(f => !stagedSet.has(f));

  return {
    valid: extraFiles.length === 0,
    extraFiles,
    missingFiles,
  };
}

class AtomicCommitter {
  /**
   * @param {{ taskId: string, agentId: string, description: string, commitType?: string }} opts
   */
  constructor(opts) {
    this.taskId = opts.taskId;
    this.agentId = opts.agentId;
    this.description = opts.description;
    this.commitType = opts.commitType || 'feat';
    this._trackedFiles = new Set();
  }

  /**
   * Track a file modified by this task.
   * @param {string} filePath
   */
  trackFile(filePath) {
    this._trackedFiles.add(normPath(filePath));
  }

  /**
   * Get all tracked files.
   * @returns {string[]}
   */
  getTrackedFiles() {
    return [...this._trackedFiles];
  }

  /**
   * Generate commit message from task context.
   * @returns {string}
   */
  generateCommitMessage() {
    return buildCommitMessage({
      type: this.commitType,
      subject: this.description,
      taskId: this.taskId,
      coAuthor: 'Claude Opus 4.6 <noreply@anthropic.com>',
    });
  }

  /**
   * Validate that staged files match tracked task files.
   * @param {string[]} stagedFiles
   * @returns {{ valid: boolean, extraFiles: string[], missingFiles: string[] }}
   */
  validateScope(stagedFiles) {
    return validateCommitScope({
      taskFiles: this.getTrackedFiles(),
      stagedFiles,
    });
  }

  /**
   * Get structured commit plan.
   * @returns {{ taskId: string, agentId: string, message: string, files: string[] }}
   */
  getCommitPlan() {
    return {
      taskId: this.taskId,
      agentId: this.agentId,
      message: this.generateCommitMessage(),
      files: this.getTrackedFiles(),
    };
  }
}

module.exports = {
  AtomicCommitter,
  buildCommitMessage,
  validateCommitScope,
};
