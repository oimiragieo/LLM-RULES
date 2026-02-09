'use strict';

/**
 * Stub: git-notes-audit was deleted during archive cleanup (2026-02-09).
 *
 * This stub satisfies consumer imports in:
 * - .claude/tools/cli/git-notes-verify.cjs
 *
 * Verified API (from git-notes-verify.cjs line 94):
 * - verifyNote(notes, commitHash) -> { verified, error?, timestamp?, taskId?, agentName? }
 *
 * Consumer expects:
 * - verified: boolean
 * - error: string (if verification failed)
 * - timestamp: string | null
 * - taskId: string | null
 * - agentName: string | null
 */

module.exports = {
  verifyNote: (_notes, _commitHash) => ({
    verified: false,
    error: 'git-notes-audit module archived - verification disabled',
    timestamp: null,
    taskId: null,
    agentName: null,
  }),
};
