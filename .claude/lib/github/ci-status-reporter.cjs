'use strict';

/**
 * ci-status-reporter.cjs — Reports CI/agent task results to GitHub PRs as
 * structured, human-readable comments via the gh CLI.
 *
 * Usage:
 *   const { CIStatusReporter } = require('.claude/lib/github/ci-status-reporter.cjs');
 *   const { GitHubCLI } = require('.claude/lib/github/cli-client.cjs');
 *   const reporter = new CIStatusReporter({ githubCLI: new GitHubCLI() });
 *   reporter.reportToPR(42, { status: 'success', summary: 'All tests passed.' });
 */

// ---------------------------------------------------------------------------
// Status emoji map
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const STATUS_EMOJI = {
  success: '✅',
  failure: '❌',
  pending: '⏰',
};

// ---------------------------------------------------------------------------
// CIStatusReporter class
// ---------------------------------------------------------------------------

class CIStatusReporter {
  /**
   * @param {object} [opts]
   * @param {object} [opts.githubCLI] - GitHubCLI instance (or compatible mock).
   *                                    Must expose `commentOnPR(prNumber, body)`.
   */
  constructor({ githubCLI } = {}) {
    this._githubCLI = githubCLI || null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the display emoji for a CI status string.
   *
   * @private
   * @param {string} status - 'success' | 'failure' | 'pending'
   * @returns {string} Unicode emoji character
   */
  _statusEmoji(status) {
    return STATUS_EMOJI[status] || '❓';
  }

  // -------------------------------------------------------------------------
  // Public format methods (return markdown strings)
  // -------------------------------------------------------------------------

  /**
   * Format test execution results into a markdown summary table.
   *
   * Supports an optional `tests` array for per-test breakdown rows.
   *
   * @param {object|null} results
   * @param {number} [results.passed]
   * @param {number} [results.failed]
   * @param {number} [results.skipped]
   * @param {number} [results.total]
   * @param {Array<{name: string, status: string}>} [results.tests]
   * @returns {string} Markdown table string
   */
  formatTestResults(results) {
    const { passed = 0, failed = 0, skipped = 0, total = 0, tests = [] } = results || {};

    const lines = [
      '| Status | Count |',
      '|--------|-------|',
      `| ✅ Passed | ${passed} |`,
      `| ❌ Failed | ${failed} |`,
      `| ⏭️ Skipped | ${skipped} |`,
      `| **Total** | **${total}** |`,
    ];

    if (tests.length > 0) {
      lines.push('', '| Test | Status |', '|------|--------|');
      for (const test of tests) {
        const emoji = test.status === 'pass' ? '✅' : '❌';
        lines.push(`| ${test.name} | ${emoji} ${test.status} |`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a list of code-review findings into a markdown table.
   *
   * @param {Array<{severity: string, description: string, file?: string, line?: number}>|null} findings
   * @returns {string} Markdown table string, or a "no findings" message when empty
   */
  formatReviewFindings(findings) {
    if (!findings || findings.length === 0) {
      return '_No findings._';
    }

    const lines = [
      '| Severity | Description | Location |',
      '|----------|-------------|----------|',
    ];

    for (const finding of findings) {
      let location = '—';
      if (finding.file) {
        location = finding.line != null ? `${finding.file}:${finding.line}` : finding.file;
      }
      lines.push(`| ${finding.severity} | ${finding.description} | ${location} |`);
    }

    return lines.join('\n');
  }

  /**
   * Format mission progress and milestone breakdown into markdown.
   *
   * @param {object|null} status
   * @param {string} [status.overall]   - Overall mission status string
   * @param {string} [status.progress]  - Human-readable progress (e.g. '3/5')
   * @param {Array<{name: string, status: string, features?: number}>} [status.milestones]
   * @returns {string} Markdown string
   */
  formatMissionStatus(status) {
    if (!status) {
      return '_No status available._';
    }

    const lines = [];

    if (status.overall != null) {
      lines.push(`**Overall:** ${status.overall}`);
    }

    if (status.progress != null) {
      lines.push(`**Progress:** ${status.progress}`);
    }

    if (status.milestones && status.milestones.length > 0) {
      lines.push('', '| Milestone | Status | Features |', '|-----------|--------|----------|');
      for (const m of status.milestones) {
        lines.push(`| ${m.name} | ${m.status} | ${m.features != null ? m.features : '—'} |`);
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // reportToPR
  // -------------------------------------------------------------------------

  /**
   * Format a structured CI status comment and post it to a pull request.
   *
   * The comment header uses a status emoji (✅ / ❌ / ⏰), followed by the
   * summary text.  When `details` is supplied it is wrapped in a collapsible
   * `<details>` / `<summary>` HTML block.
   *
   * @param {number} prNumber - Target pull request number
   * @param {object} opts
   * @param {'success'|'failure'|'pending'} opts.status  - CI result status
   * @param {string}  opts.summary  - One-line summary shown at the top
   * @param {string}  [opts.details] - Optional extended markdown content
   */
  reportToPR(prNumber, { status, summary, details }) {
    if (!this._githubCLI || typeof this._githubCLI.commentOnPR !== 'function') {
      throw new Error(
        'CIStatusReporter requires a githubCLI with a commentOnPR(prNumber, body) method'
      );
    }
    const emoji = this._statusEmoji(status);

    let body = `## ${emoji} CI Status\n\n**Status:** ${status}\n\n${summary}`;

    if (details != null) {
      body += `\n\n<details>\n<summary>Details</summary>\n\n${details}\n\n</details>`;
    }

    this._githubCLI.commentOnPR(prNumber, body);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { CIStatusReporter };
