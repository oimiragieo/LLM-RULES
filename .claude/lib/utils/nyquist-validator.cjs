'use strict';

const fs = require('fs');

/**
 * Perfect coverage score constant — returned when there are no tasks.
 * @type {number}
 */
const COVERAGE_SCORE_PERFECT = 1;

/**
 * Regex to match task list items (- [ ], - [x], - [~]).
 * Captures the task description text after the checkbox.
 */
const TASK_LINE_RE = /^[-*]\s+\[[ x~]\]\s+(.+)$/;

/**
 * Regex to detect a verify field on the line following a task.
 * Matches:
 *   - verify: ...
 *   - **verify**: ...
 *   - verify : ...
 */
const VERIFY_LINE_RE = /[-*]\s+\*{0,2}verify\*{0,2}\s*:/i;

/**
 * Parse a plan markdown file and extract tasks with and without verify fields.
 *
 * The parser scans the file line-by-line. A "task" is any markdown list item
 * with a checkbox (`- [ ]`, `- [x]`, `- [~]`). A task is considered "covered"
 * if any indented sub-bullet on the lines immediately following the task
 * matches the verify-field pattern before the next top-level task.
 *
 * @param {string} planPath - Absolute path to the markdown plan file.
 * @returns {{ tasks: string[], tasksWithVerify: string[] }}
 * @throws {Error} If the file cannot be read.
 */
function parsePlanTasks(planPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  const lines = content.split('\n');

  const tasks = [];
  const tasksWithVerify = [];

  let currentTask = null;
  let currentTaskHasVerify = false;

  for (const line of lines) {
    const taskMatch = line.match(TASK_LINE_RE);

    if (taskMatch) {
      // Flush previous task
      if (currentTask !== null) {
        tasks.push(currentTask);
        if (currentTaskHasVerify) {
          tasksWithVerify.push(currentTask);
        }
      }
      currentTask = taskMatch[1].trim();
      currentTaskHasVerify = false;
    } else if (currentTask !== null && VERIFY_LINE_RE.test(line)) {
      currentTaskHasVerify = true;
    }
  }

  // Flush last task
  if (currentTask !== null) {
    tasks.push(currentTask);
    if (currentTaskHasVerify) {
      tasksWithVerify.push(currentTask);
    }
  }

  return { tasks, tasksWithVerify };
}

/**
 * Validate coverage of a plan file by computing the Nyquist coverage score.
 *
 * Coverage score = tasks_with_verify / total_tasks.
 * Returns 1 (perfect) when there are no tasks (vacuous truth).
 *
 * @param {string} planPath - Absolute path to the markdown plan file.
 * @returns {{
 *   coverageScore: number,
 *   uncoveredTasks: string[],
 *   totalTasks: number,
 *   coveredTasks: number
 * }}
 */
function validateCoverage(planPath) {
  const { tasks, tasksWithVerify } = parsePlanTasks(planPath);

  const totalTasks = tasks.length;
  const coveredTasks = tasksWithVerify.length;

  if (totalTasks === 0) {
    return {
      coverageScore: COVERAGE_SCORE_PERFECT,
      uncoveredTasks: [],
      totalTasks: 0,
      coveredTasks: 0,
    };
  }

  const coverageScore = coveredTasks / totalTasks;

  const coveredSet = new Set(tasksWithVerify);
  const uncoveredTasks = tasks.filter(t => !coveredSet.has(t));

  return {
    coverageScore,
    uncoveredTasks,
    totalTasks,
    coveredTasks,
  };
}

module.exports = {
  parsePlanTasks,
  validateCoverage,
  COVERAGE_SCORE_PERFECT,
};
