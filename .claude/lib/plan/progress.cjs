'use strict';

const { load } = require('./implementation-plan.cjs');

function countSubtasks(planDir) {
  const plan = load(planDir);
  if (!plan || !Array.isArray(plan.subtasks)) return 0;
  return plan.subtasks.length;
}

function countCompletedSubtasks(planDir) {
  const plan = load(planDir);
  if (!plan || !Array.isArray(plan.subtasks)) return 0;
  return plan.subtasks.filter((task) => task && task.status === 'completed').length;
}

function isBuildComplete(planDir) {
  const plan = load(planDir);
  if (!plan || !Array.isArray(plan.subtasks) || plan.subtasks.length === 0) return true;
  return plan.subtasks.every((task) => task && task.status === 'completed');
}

function getNextSubtask(planDir) {
  const plan = load(planDir);
  if (!plan || !Array.isArray(plan.subtasks)) return null;
  return plan.subtasks.find((task) => !task || task.status !== 'completed') || null;
}

module.exports = {
  isBuildComplete,
  countSubtasks,
  countCompletedSubtasks,
  getNextSubtask,
};
