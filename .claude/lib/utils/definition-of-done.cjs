'use strict';

/**
 * Definition of Done — 26-item checklist across 5 categories.
 *
 * Each CHECKLIST_ITEMS entry has:
 *   id          — unique snake_case identifier
 *   category    — one of CATEGORIES
 *   description — human-readable label
 *   contextKey  — key read from the context object passed to checkDefinitionOfDone
 */

const CATEGORIES = ['context', 'implementation', 'testing', 'documentation', 'verification'];

/** @type {Array<{ id: string, category: string, description: string, contextKey: string }>} */
const CHECKLIST_ITEMS = [
  // Context (5 items)
  {
    id: 'task_id_present',
    category: 'context',
    description: 'Task ID is present and referenced in work',
    contextKey: 'taskIdPresent',
  },
  {
    id: 'memory_queried',
    category: 'context',
    description: 'Memory was queried before starting',
    contextKey: 'memoryQueried',
  },
  {
    id: 'plan_file_updated',
    category: 'context',
    description: 'Plan file markers updated ([~] in progress, [x] done)',
    contextKey: 'planFileUpdated',
  },
  {
    id: 'deviations_logged',
    category: 'context',
    description: 'All deviations logged to session gap log',
    contextKey: 'deviationsLogged',
  },
  {
    id: 'task_claimed_in_progress',
    category: 'context',
    description: 'TaskUpdate(in_progress) called before work started',
    contextKey: 'taskClaimedInProgress',
  },

  // Implementation (6 items)
  {
    id: 'no_todo_fixme_stub',
    category: 'implementation',
    description: 'No TODO / FIXME / STUB markers in new code',
    contextKey: 'noTodoFixmeStub',
  },
  {
    id: 'lint_passes',
    category: 'implementation',
    description: 'pnpm lint:fix passes with zero errors',
    contextKey: 'lintPasses',
  },
  {
    id: 'format_passes',
    category: 'implementation',
    description: 'pnpm format produces no changes',
    contextKey: 'formatPasses',
  },
  {
    id: 'no_console_log',
    category: 'implementation',
    description: 'No console.log in production code',
    contextKey: 'noConsoleLog',
  },
  {
    id: 'absolute_paths_used',
    category: 'implementation',
    description: 'Absolute paths used for all file operations',
    contextKey: 'absolutePathsUsed',
  },
  {
    id: 'error_handling_present',
    category: 'implementation',
    description: 'Error handling present at all boundaries',
    contextKey: 'errorHandlingPresent',
  },

  // Testing (6 items)
  {
    id: 'failing_test_written_first',
    category: 'testing',
    description: 'Failing test written before implementation (TDD red phase)',
    contextKey: 'failingTestWrittenFirst',
  },
  {
    id: 'all_tests_pass',
    category: 'testing',
    description: 'All tests pass (zero failures)',
    contextKey: 'allTestsPass',
  },
  {
    id: 'regression_test_added',
    category: 'testing',
    description: 'Regression test added for any bug fix',
    contextKey: 'regressionTestAdded',
  },
  {
    id: 'edge_cases_covered',
    category: 'testing',
    description: 'Edge cases and boundary conditions covered',
    contextKey: 'edgeCasesCovered',
  },
  {
    id: 'test_isolated',
    category: 'testing',
    description: 'Tests are isolated with no shared mutable state',
    contextKey: 'testIsolated',
  },
  {
    id: 'no_real_api_calls',
    category: 'testing',
    description: 'No real API or LLM calls in unit tests',
    contextKey: 'noRealApiCalls',
  },

  // Documentation (4 items)
  {
    id: 'changelog_updated',
    category: 'documentation',
    description: 'CHANGELOG.md updated under [Unreleased]',
    contextKey: 'changelogUpdated',
  },
  {
    id: 'inline_comments_added',
    category: 'documentation',
    description: 'Inline comments added for complex logic',
    contextKey: 'inlineCommentsAdded',
  },
  {
    id: 'public_apis_documented',
    category: 'documentation',
    description: 'Public APIs and exports documented (JSDoc)',
    contextKey: 'publicApisDocumented',
  },
  {
    id: 'env_example_updated',
    category: 'documentation',
    description: '.env.example updated if new env vars introduced',
    contextKey: 'envExampleUpdated',
  },

  // Verification (6 items)
  {
    id: 'atomic_commit_made',
    category: 'verification',
    description: 'Atomic commit created for this task',
    contextKey: 'atomicCommitMade',
  },
  {
    id: 'git_status_clean',
    category: 'verification',
    description: 'git status is clean (no unintended changes)',
    contextKey: 'gitStatusClean',
  },
  {
    id: 'task_marked_completed',
    category: 'verification',
    description: 'TaskUpdate(completed) called with metadata',
    contextKey: 'taskMarkedCompleted',
  },
  {
    id: 'cleanup_scan_run',
    category: 'verification',
    description: 'Cleanup scan run (no AI slop in project root)',
    contextKey: 'cleanupScanRun',
  },
  {
    id: 'no_slop_in_root',
    category: 'verification',
    description: 'Project root is free of temp files and debug artifacts',
    contextKey: 'noSlopInRoot',
  },
];

/**
 * Evaluates a context object against the 26-item Definition of Done checklist.
 *
 * @param {Record<string, boolean>} context — flat object keyed by contextKey values
 * @returns {{ passed: boolean, score: number, checklist: Array<{ id: string, category: string, description: string, checked: boolean }> }}
 */
function checkDefinitionOfDone(context = {}) {
  const checklist = CHECKLIST_ITEMS.map(item => ({
    id: item.id,
    category: item.category,
    description: item.description,
    checked: context[item.contextKey] === true,
  }));

  const checkedCount = checklist.filter(item => item.checked).length;
  const total = checklist.length;
  const score = total === 0 ? 0 : checkedCount / total;
  const passed = score === 1;

  return { passed, score, checklist };
}

module.exports = { checkDefinitionOfDone, CATEGORIES, CHECKLIST_ITEMS };
