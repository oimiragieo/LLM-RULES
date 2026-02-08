/**
 * Brownfield Orchestrator
 *
 * Auto-configures onboarding workflow based on:
 * 1. Tech stack detection
 * 2. Project maturity assessment
 * 3. Agent/skill selection
 * 4. Workflow parameter configuration
 * 5. Onboarding report generation
 */

const techStackDetector = require('../utils/tech-stack-detector.cjs');
const brownfieldAssessor = require('../utils/brownfield-assessor.cjs');
const path = require('path');
const fs = require('fs');

/**
 * Orchestrate brownfield project onboarding
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<Object>} Onboarding configuration
 */
async function orchestrate(projectPath) {
  const startTime = Date.now();

  // Step 1: Detect tech stack
  console.log('[BROWNFIELD] Detecting tech stack...');
  const techStack = await techStackDetector.detect(projectPath);

  // Step 2: Assess maturity
  console.log('[BROWNFIELD] Assessing project maturity...');
  const assessment = await brownfieldAssessor.assess(projectPath);

  // Step 3: Select agents
  console.log('[BROWNFIELD] Selecting appropriate agents...');
  const suggestedAgents = assessment.suggested_agents;

  // Step 4: Configure phase-completion-guard based on maturity
  console.log('[BROWNFIELD] Configuring workflow parameters...');
  const configuration = configureWorkflow(assessment);

  // Step 5: Generate onboarding report
  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  const estimatedSetupTime = estimateSetupTime(assessment);

  const onboardingReport = {
    tech_stack: techStack,
    project_type: assessment.type,
    maturity_scores: assessment.scores,
    suggested_agents: suggestedAgents,
    suggested_workflows: assessment.suggested_workflows,
    recommendations: assessment.recommendations,
    configuration: configuration,
    estimated_setup_time: estimatedSetupTime,
    detection_time: `${elapsedTime} seconds`,
    next_steps: generateNextSteps(assessment, techStack),
  };

  console.log(`[BROWNFIELD] Onboarding configured in ${elapsedTime}s`);
  console.log(`[BROWNFIELD] Estimated setup time: ${estimatedSetupTime}`);

  return onboardingReport;
}

/**
 * Configure workflow parameters based on maturity
 */
function configureWorkflow(assessment) {
  const config = {
    phase_completion_guard: 'warn', // default
    test_coverage_threshold: 0.8,
    documentation_required: true,
    code_review_required: true,
  };

  // Adjust based on project type
  if (assessment.type === 'greenfield') {
    config.phase_completion_guard = 'warn'; // Lenient for new projects
    config.test_coverage_threshold = 0.6; // Lower threshold
  } else if (assessment.type === 'brownfield') {
    config.phase_completion_guard = 'block'; // Enforce quality gates
    config.test_coverage_threshold = 0.8; // Standard threshold
  } else if (assessment.type === 'legacy') {
    config.phase_completion_guard = 'block'; // Strict for legacy
    config.test_coverage_threshold = 0.7; // Realistic for legacy
    config.refactoring_recommended = true;
  }

  return config;
}

/**
 * Estimate setup time based on project maturity
 */
function estimateSetupTime(assessment) {
  if (assessment.type === 'greenfield') {
    return '15-20 minutes';
  } else if (assessment.type === 'brownfield') {
    return '20-30 minutes';
  } else {
    return '30-45 minutes'; // legacy
  }
}

/**
 * Generate next steps for onboarding
 */
function generateNextSteps(assessment, _techStack) {
  const steps = [];

  // Step 1: Always start with project-onboarding
  steps.push({
    order: 1,
    action: 'Run project-onboarding skill',
    command: 'Skill({ skill: "project-onboarding" })',
    description: 'Auto-configure project based on detected tech stack',
  });

  // Step 2: Review recommendations
  if (assessment.recommendations.length > 0) {
    steps.push({
      order: 2,
      action: 'Review recommendations',
      description: `Address: ${assessment.recommendations.slice(0, 3).join(', ')}`,
    });
  }

  // Step 3: Set up testing if low coverage
  if (assessment.scores.tests < 0.5) {
    steps.push({
      order: 3,
      action: 'Set up testing framework',
      command: 'Skill({ skill: "tdd" })',
      description: 'Implement TDD workflow for quality assurance',
    });
  }

  // Step 4: Invoke appropriate domain agents
  if (assessment.suggested_agents.length > 0) {
    steps.push({
      order: 4,
      action: 'Configure domain agents',
      description: `Suggested agents: ${assessment.suggested_agents.join(', ')}`,
    });
  }

  // Step 5: Review workflows
  steps.push({
    order: 5,
    action: 'Review suggested workflows',
    description: `Workflows: ${assessment.suggested_workflows.join(', ')}`,
  });

  return steps;
}

/**
 * Save onboarding report to file
 */
async function saveOnboardingReport(projectPath, report) {
  const reportDir = path.join(projectPath, '.claude/context/artifacts');
  const reportPath = path.join(reportDir, 'onboarding-report.json');

  // Create directory if needed
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[BROWNFIELD] Onboarding report saved: ${reportPath}`);

  return reportPath;
}

module.exports = {
  orchestrate,
  saveOnboardingReport,
};
