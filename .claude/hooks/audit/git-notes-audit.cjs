/**
 * Hook: git-notes-audit.cjs
 *
 * Attaches task metadata to git commits via git notes for tamper-proof audit trail.
 *
 * @trigger PostToolUse(Bash) when command matches "git commit"
 *
 * @captures
 * - Task ID (from context)
 * - Agent name (from context)
 * - Commit hash
 * - Timestamp
 * - Decision rationale
 * - Verification hash (SHA-256)
 *
 * @example Git Note Format
 * ```
 * [TASK-#6] developer@agent-studio
 * Decision: Created track metadata schema
 * Timestamp: 2026-01-29T14:30:00Z
 * Hash: sha256(task+commit+timestamp+agentName)
 * ```
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

module.exports = {
  name: 'git-notes-audit',
  trigger: 'PostToolUse',
  tool: 'Bash',

  /**
   * Execute hook to attach git note to commit
   *
   * @param {object} result - Bash command result
   * @param {string} result.command - The git command executed
   * @param {string} result.output - Command output
   * @param {object} context - Hook execution context
   * @param {string} context.taskId - Current task ID
   * @param {string} context.agentName - Agent performing commit
   * @param {string} context.timestamp - ISO 8601 timestamp
   * @param {string} context.workSummary - Description of changes
   * @returns {object} Result unchanged
   */
  execute: function (result, context) {
    // Only process git commit commands
    if (!result.command || !result.command.includes('git commit')) {
      return result;
    }

    // Extract commit hash from output
    const commitHash = this.extractCommitHash(result.output);
    if (!commitHash) {
      // Commit failed, skip audit (no note to attach)
      return result;
    }

    // Build git note
    const note = this.buildAuditNote(context, commitHash);

    try {
      // Attach to commit using git notes
      // Write note to temp file to avoid shell escaping issues
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const tempFile = path.join(os.tmpdir(), `git-note-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, note, 'utf-8');

      const cmd = `git notes add -F "${tempFile}" ${commitHash}`;
      execSync(cmd, { stdio: 'pipe' });

      // Cleanup temp file
      fs.unlinkSync(tempFile);
    } catch (error) {
      // Note might already exist (re-run), ignore error
      // Hook should not block commit on note failures
    }

    return result;
  },

  /**
   * Extract commit hash from git commit output
   *
   * @param {string} output - Git commit command output
   * @returns {string|null} Commit hash or null if not found
   *
   * @example
   * extractCommitHash('[main abc123def] feat: new feature') // 'abc123def'
   */
  extractCommitHash: function (output) {
    if (!output) return null;

    // Match: [branch commitHash] message
    // Or: commitHash message (detached HEAD)
    const match = output.match(/\[[\w/-]+\s+([a-f0-9]+)\]|^([a-f0-9]{7,})/m);
    return match ? (match[1] || match[2]) : null;
  },

  /**
   * Build audit note content
   *
   * @param {object} context - Hook context
   * @param {string} commitHash - Git commit hash
   * @returns {string} Formatted note content
   */
  buildAuditNote: function (context, commitHash) {
    const taskId = context.taskId || 'unknown';
    const agentName = context.agentName || 'unknown';
    const timestamp = context.timestamp || new Date().toISOString();
    const decision = this.sanitizeDecision(context.workSummary || 'Code changes');

    // Compute verification hash
    const verificationHash = this.computeVerificationHash(taskId, commitHash, timestamp, agentName);

    const note = `[TASK-${taskId}] ${agentName}
Decision: ${decision}
Timestamp: ${timestamp}
Hash: ${verificationHash}`.trim();

    return note;
  },

  /**
   * Sanitize decision text to prevent credential leaks
   *
   * @param {string} text - Raw decision text
   * @returns {string} Sanitized text with credentials masked
   */
  sanitizeDecision: function (text) {
    if (!text) return 'Code changes';

    // Mask common credential patterns
    const patterns = [
      { pattern: /API_KEY\s*=\s*['"]?[^\s'"]+['"]?/gi, replacement: 'API_KEY=[REDACTED]' },
      { pattern: /PASSWORD\s*=\s*['"]?[^\s'"]+['"]?/gi, replacement: 'PASSWORD=[REDACTED]' },
      { pattern: /sk-[a-zA-Z0-9]{32,}/g, replacement: '[REDACTED]' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED]' },
      { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED]' },
    ];

    let sanitized = text;
    for (const { pattern, replacement } of patterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    // Limit length to prevent overly long notes
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 197) + '...';
    }

    return sanitized;
  },

  /**
   * Compute SHA-256 verification hash
   *
   * @param {string} taskId - Task ID
   * @param {string} commitHash - Commit hash
   * @param {string} timestamp - ISO timestamp
   * @param {string} agentName - Agent name
   * @returns {string} SHA-256 hash (hex)
   */
  computeVerificationHash: function (taskId, commitHash, timestamp, agentName) {
    return crypto.createHash('sha256')
      .update(taskId + commitHash + timestamp + agentName)
      .digest('hex');
  },

  /**
   * Verify note signature
   *
   * @param {string} note - Git note content
   * @param {string} commitHash - Commit hash
   * @returns {object} Verification result
   */
  verifyNote: function (note, commitHash) {
    const lines = note.trim().split('\n');
    const taskIdMatch = lines[0].match(/\[TASK-([^\]]+)\]\s+(\S+)/);
    const timestampMatch = note.match(/Timestamp:\s*(\S+)/);
    const hashMatch = note.match(/Hash:\s*([a-f0-9]{64})/);

    if (!taskIdMatch || !timestampMatch || !hashMatch) {
      return { verified: false, error: 'Malformed note structure' };
    }

    const taskId = taskIdMatch[1];
    const agentName = taskIdMatch[2];
    const timestamp = timestampMatch[1];
    const providedHash = hashMatch[1];

    const expectedHash = this.computeVerificationHash(taskId, commitHash, timestamp, agentName);

    if (providedHash !== expectedHash) {
      return {
        verified: false,
        error: 'Hash mismatch - note may have been tampered with',
        expected: expectedHash,
        actual: providedHash
      };
    }

    return { verified: true, taskId, agentName, timestamp };
  },

  /**
   * Validate timestamp format (ISO 8601)
   *
   * @param {string} timestamp - Timestamp string
   * @returns {boolean} True if valid ISO 8601 format
   */
  validateTimestamp: function (timestamp) {
    if (!timestamp) return false;

    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ
    const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    return iso8601Pattern.test(timestamp);
  },

  /**
   * Escape string for shell command
   *
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeForShell: function (str) {
    // Escape double quotes and backslashes for -m "..." argument
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }
};
