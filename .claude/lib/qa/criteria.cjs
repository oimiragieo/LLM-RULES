'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { validatePathWithinProject, PROJECT_ROOT } = require('../utils/project-root.cjs');

const IMPLEMENTATION_PLAN_FILENAME = 'implementation_plan.json';
const MAX_QA_ITERATIONS = 50;

function resolvePlanPath(planDir) {
  if (!planDir || typeof planDir !== 'string') return null;
  const result = validatePathWithinProject(planDir, PROJECT_ROOT);
  if (!result.safe) return null;
  return path.join(result.resolvedPath, IMPLEMENTATION_PLAN_FILENAME);
}

function loadImplementationPlan(planDir) {
  const filePath = resolvePlanPath(planDir);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function saveImplementationPlan(planDir, plan) {
  const filePath = resolvePlanPath(planDir);
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteJSONSync(filePath, plan);
    return true;
  } catch (_e) {
    return false;
  }
}

function getQaSignoffStatus(planDir) {
  const plan = loadImplementationPlan(planDir);
  return plan?.qa_signoff || null;
}

function isQaApproved(planDir) {
  const s = getQaSignoffStatus(planDir);
  return s?.status === 'approved';
}

function isQaRejected(planDir) {
  const s = getQaSignoffStatus(planDir);
  return s?.status === 'rejected';
}

function isFixesApplied(planDir) {
  const s = getQaSignoffStatus(planDir);
  return s?.status === 'fixes_applied' && s?.ready_for_qa_revalidation === true;
}

function getQaIterationCount(planDir) {
  const s = getQaSignoffStatus(planDir);
  return s?.qa_session ?? 0;
}

function isBuildComplete(planDir) {
  const plan = loadImplementationPlan(planDir);
  if (!plan || !Array.isArray(plan.subtasks) || plan.subtasks.length === 0) return true;
  return plan.subtasks.every(task => task && task.status === 'completed');
}

function shouldRunQa(planDir) {
  return isBuildComplete(planDir) && !isQaApproved(planDir);
}

function shouldRunFixes(planDir) {
  return isQaRejected(planDir) && getQaIterationCount(planDir) < MAX_QA_ITERATIONS;
}

module.exports = {
  loadImplementationPlan,
  saveImplementationPlan,
  getQaSignoffStatus,
  isQaApproved,
  isQaRejected,
  isFixesApplied,
  getQaIterationCount,
  isBuildComplete,
  shouldRunQa,
  shouldRunFixes,
  MAX_QA_ITERATIONS,
};
