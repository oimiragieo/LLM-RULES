'use strict';

const DIMENSIONS = [
  'requirement-coverage',
  'task-completeness',
  'dependency-validity',
  'scope-sanity',
  'artifact-wiring',
  'risk-assessment',
  'testability',
  'estimation-quality'
];

function scoreDimension(name, planContent) {
  const content = planContent.toLowerCase();
  switch (name) {
    case 'requirement-coverage':
      return (content.includes('requirement') || content.includes('acceptance criteria') || content.includes('must')) ? 8 : 4;
    case 'task-completeness': {
      const taskMatches = (planContent.match(/- \[[ x~]\]/g) || []).length;
      return taskMatches >= 3 ? 8 : taskMatches >= 1 ? 6 : 3;
    }
    case 'dependency-validity':
      return (content.includes('depend') || content.includes('blocked') || content.includes('prerequisite')) ? 7 : 5;
    case 'scope-sanity': {
      const totalTasks = (planContent.match(/- \[[ x~]\]/g) || []).length;
      return totalTasks > 10 ? 4 : totalTasks > 5 ? 6 : 8;
    }
    case 'artifact-wiring': {
      const pathRefs = (planContent.match(/\.[a-z]+\/|\.cjs|\.mjs|\.md|\.json/g) || []).length;
      return pathRefs >= 3 ? 8 : pathRefs >= 1 ? 6 : 3;
    }
    case 'risk-assessment':
      return (content.includes('risk') || content.includes('mitigation') || content.includes('rollback')) ? 8 : 4;
    case 'testability':
      return (content.includes('test') || content.includes('verify') || content.includes('assert')) ? 8 : 4;
    case 'estimation-quality':
      return (content.includes('complexity') || content.includes('estimate') || content.includes('wave') || content.includes('phase')) ? 7 : 4;
    default:
      return 5;
  }
}

function verifyPlan(planContent) {
  if (!planContent || typeof planContent !== 'string' || planContent.trim().length < 50) {
    return {
      pass: false,
      score: 0,
      dimensions: DIMENSIONS.map(d => ({ name: d, score: 0, maxScore: 10 })),
      errors: ['Plan content is empty or too short (minimum 50 characters)']
    };
  }
  const dimensions = DIMENSIONS.map(name => ({
    name,
    score: scoreDimension(name, planContent),
    maxScore: 10
  }));
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const avgScore = totalScore / dimensions.length;
  const pass = avgScore >= 6;
  return {
    pass,
    score: Math.round(avgScore * 10) / 10,
    dimensions,
    errors: pass ? [] : dimensions.filter(d => d.score < 5).map(d => `${d.name}: score ${d.score}/10 (below threshold)`)
  };
}

module.exports = { verifyPlan, DIMENSIONS, scoreDimension };
