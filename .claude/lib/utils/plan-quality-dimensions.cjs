'use strict';

const DIMENSIONS = [
  'requirement-coverage',
  'task-completeness',
  'dependency-validity',
  'scope-sanity',
  'artifact-wiring',
  'risk-assessment',
  'testability',
  'estimation-quality',
];

/**
 * Assess plan quality across 8 dimensions.
 * @param {object} plan - { goal, tasks[], requirements[], risks[], artifacts[] }
 * @returns {{ dimensions: Array<{name, score, issues}>, overall: number, pass: boolean }}
 */
function assessPlanQuality(plan) {
  const dimensions = DIMENSIONS.map(name => assess(name, plan));
  const overall = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  return { dimensions, overall, pass: overall >= 0.5 };
}

function assess(name, plan) {
  const issues = [];

  switch (name) {
    case 'requirement-coverage': {
      const reqs = Array.isArray(plan.requirements) ? plan.requirements : [];
      if (reqs.length === 0) issues.push('No requirements defined');
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      if (reqs.length > 0 && tasks.length === 0)
        issues.push('Requirements exist but no tasks to cover them');
      return {
        name,
        score: reqs.length > 0 && tasks.length > 0 ? 1 : reqs.length > 0 ? 0.3 : 0,
        issues,
      };
    }
    case 'task-completeness': {
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      if (tasks.length === 0) issues.push('No tasks defined');
      const missingDesc = tasks.filter(t => !t.description);
      if (missingDesc.length > 0) issues.push(`${missingDesc.length} task(s) missing description`);
      const missingAgent = tasks.filter(t => !t.agent);
      if (missingAgent.length > 0)
        issues.push(`${missingAgent.length} task(s) missing agent assignment`);
      const total =
        tasks.length > 0 ? 1 - (missingDesc.length + missingAgent.length) / (tasks.length * 2) : 0;
      return { name, score: Math.max(0, Math.min(1, total)), issues };
    }
    case 'dependency-validity': {
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      if (tasks.length === 0)
        return { name, score: 0.5, issues: ['No tasks to validate dependencies'] };
      return { name, score: 1, issues };
    }
    case 'scope-sanity': {
      if (!plan.goal) issues.push('No goal defined');
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      if (tasks.length > 50) issues.push('Excessive task count (>50) suggests scope creep');
      return { name, score: plan.goal ? (tasks.length <= 50 ? 1 : 0.5) : 0, issues };
    }
    case 'artifact-wiring': {
      const artifacts = Array.isArray(plan.artifacts) ? plan.artifacts : [];
      if (artifacts.length === 0) issues.push('No artifacts listed');
      return { name, score: artifacts.length > 0 ? 1 : 0.3, issues };
    }
    case 'risk-assessment': {
      const risks = Array.isArray(plan.risks) ? plan.risks : [];
      if (risks.length === 0) issues.push('No risks identified');
      return { name, score: risks.length > 0 ? 1 : 0, issues };
    }
    case 'testability': {
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      const hasTestTasks = tasks.some(
        t => t.agent === 'qa' || (t.description && t.description.toLowerCase().includes('test'))
      );
      if (!hasTestTasks) issues.push('No test-related tasks found');
      return { name, score: hasTestTasks ? 1 : 0.3, issues };
    }
    case 'estimation-quality': {
      const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
      const withEstimates = tasks.filter(t => t.estimatedHours != null);
      if (tasks.length > 0 && withEstimates.length === 0) issues.push('No time estimates on tasks');
      const ratio = tasks.length > 0 ? withEstimates.length / tasks.length : 0.5;
      return { name, score: ratio, issues };
    }
    default:
      return { name, score: 0.5, issues: ['Unknown dimension'] };
  }
}

module.exports = { assessPlanQuality, DIMENSIONS };
