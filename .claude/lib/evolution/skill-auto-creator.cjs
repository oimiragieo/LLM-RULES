'use strict';
// F7 ARCHIVED — see .claude/lib/evolution/_archive/skill-auto-creator.cjs
// Rationale: violates GATE 4 (writes SKILL.md bypassing unified-creator-guard).
// Roadmap: refactor to proposer-only pattern routing through skill-creator as effector.
//
// analyzeTranscript is re-exported from the archive so that integration tests
// (VAL-CROSS-003) that were written before the archival can continue to run.
// The archive file has broken relative-path requires when loaded from its
// subdirectory, so we load it here where the relative paths are correct.
const path = require('path');
const _archive = require(path.join(__dirname, '_archive', 'skill-auto-creator.cjs'));
const { analyzeTranscript } = _archive;
module.exports = {
  disabled: true,
  reason: 'GATE4_VIOLATION',
  archivedAt: '2026-04-19',
  analyzeTranscript,
};
