/**
 * Brownfield Project Assessor
 *
 * Scores project on multiple dimensions:
 * - Code structure (0-1)
 * - Test coverage (0-1)
 * - Documentation (0-1)
 * - Architecture patterns (0-1)
 *
 * Classification:
 * - Greenfield (score 0-0.3): New project, minimal existing code
 * - Brownfield (score 0.3-0.8): Established project, good structure
 * - Legacy (score 0.8-1.0): Mature, complex, needs careful handling
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Assess project maturity
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<Object>} Assessment results
 */
async function assess(projectPath) {
  const result = {
    type: 'greenfield',
    scores: {
      structure: 0,
      tests: 0,
      docs: 0,
      patterns: 0,
    },
    recommendations: [],
    suggested_workflows: [],
    suggested_agents: [],
  };

  if (!fs.existsSync(projectPath)) {
    return result;
  }

  // Score structure
  result.scores.structure = await scoreStructure(projectPath);

  // Score tests
  result.scores.tests = await scoreTests(projectPath);

  // Score documentation
  result.scores.docs = await scoreDocs(projectPath);

  // Score architecture patterns
  result.scores.patterns = await scorePatterns(projectPath);

  // Calculate overall maturity
  const avgScore =
    (result.scores.structure + result.scores.tests + result.scores.docs + result.scores.patterns) /
    4;

  // Classify project
  if (avgScore >= 0.8) {
    result.type = 'legacy';
  } else if (avgScore >= 0.3) {
    result.type = 'brownfield';
  } else {
    result.type = 'greenfield';
  }

  // Generate recommendations
  result.recommendations = generateRecommendations(result.scores);

  // Suggest workflows
  result.suggested_workflows = suggestWorkflows(result.type, result.scores);

  // Suggest agents based on tech stack
  result.suggested_agents = await suggestAgents(projectPath);

  return result;
}

/**
 * Score project structure (directory organization)
 */
async function scoreStructure(projectPath) {
  let score = 0;

  const expectedDirs = [
    'src',
    'lib',
    'tests',
    'test',
    '__tests__',
    'docs',
    'doc',
    'config',
    'scripts',
    'build',
    'dist',
  ];

  const files = fs.readdirSync(projectPath);
  const dirCount = expectedDirs.filter(dir => files.includes(dir)).length;

  // Base score on directory organization
  if (dirCount >= 5) {
    score = 0.9;
  } else if (dirCount >= 3) {
    score = 0.6;
  } else if (dirCount >= 1) {
    score = 0.3;
  } else {
    score = 0.1;
  }

  // Bonus for GitHub workflows (CI/CD maturity)
  const githubWorkflowsPath = path.join(projectPath, '.github/workflows');
  if (fs.existsSync(githubWorkflowsPath)) {
    score = Math.min(score + 0.1, 1.0);
  }

  return score;
}

/**
 * Score test coverage (test file count)
 */
async function scoreTests(projectPath) {
  let score = 0;

  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  let testFileCount = 0;

  for (const testDir of testDirs) {
    const testPath = path.join(projectPath, testDir);
    if (fs.existsSync(testPath)) {
      testFileCount += countFilesRecursive(testPath, /\.(test|spec)\.(js|ts|jsx|tsx|py)$/);
    }
  }

  // Score based on test file count
  if (testFileCount >= 20) {
    score = 0.9;
  } else if (testFileCount >= 10) {
    score = 0.7;
  } else if (testFileCount >= 5) {
    score = 0.5;
  } else if (testFileCount >= 1) {
    score = 0.3;
  } else {
    score = 0;
  }

  return score;
}

/**
 * Score documentation quality
 */
async function scoreDocs(projectPath) {
  let score = 0;

  const docFiles = [
    'README.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'LICENSE',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
  ];

  const files = fs.readdirSync(projectPath);
  const docCount = docFiles.filter(doc => files.includes(doc)).length;

  // Check README quality
  const readmePath = path.join(projectPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const hasInstallation = readmeContent.toLowerCase().includes('install');
    const hasUsage = readmeContent.toLowerCase().includes('usage');
    const hasAPI = readmeContent.toLowerCase().includes('api');

    if (hasInstallation && hasUsage && hasAPI) {
      score += 0.3;
    } else if (hasInstallation || hasUsage) {
      score += 0.2;
    }
  }

  // Score based on doc file count
  if (docCount >= 4) {
    score += 0.6;
  } else if (docCount >= 2) {
    score += 0.4;
  } else if (docCount >= 1) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Score architecture patterns (config files, standards)
 */
async function scorePatterns(projectPath) {
  let score = 0;

  const configFiles = [
    'tsconfig.json',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.editorconfig',
    'jest.config.js',
    'webpack.config.js',
    'vite.config.js',
    'rollup.config.js',
  ];

  const files = fs.readdirSync(projectPath);
  const configCount = configFiles.filter(config => files.includes(config)).length;

  // Score based on config file count
  if (configCount >= 5) {
    score = 0.9;
  } else if (configCount >= 3) {
    score = 0.6;
  } else if (configCount >= 1) {
    score = 0.3;
  } else {
    score = 0.1;
  }

  return score;
}

/**
 * Generate recommendations based on scores
 */
function generateRecommendations(scores) {
  const recommendations = [];

  if (scores.tests < 0.5) {
    recommendations.push('Increase test coverage to 80%+');
    recommendations.push('Add unit tests for core functionality');
  }

  if (scores.docs < 0.5) {
    recommendations.push('Add comprehensive README with installation and usage');
    recommendations.push('Create API documentation');
    recommendations.push('Add CONTRIBUTING.md for contributors');
  }

  if (scores.structure < 0.5) {
    recommendations.push('Organize code into src/ and tests/ directories');
    recommendations.push('Separate concerns (components, utils, services)');
  }

  if (scores.patterns < 0.5) {
    recommendations.push('Add linting configuration (.eslintrc)');
    recommendations.push('Add code formatting (.prettierrc)');
    recommendations.push('Consider adding TypeScript for type safety');
  }

  return recommendations;
}

/**
 * Suggest appropriate workflows
 */
function suggestWorkflows(type, scores) {
  const workflows = [];

  // Always suggest project-onboarding for brownfield/legacy
  if (type === 'brownfield' || type === 'legacy') {
    workflows.push('project-onboarding');
  }

  // Suggest TDD if low test coverage
  if (scores.tests < 0.5) {
    workflows.push('tdd');
    workflows.push('qa-workflow');
  }

  // Suggest context-driven-development for brownfield/legacy
  if (type === 'brownfield' || type === 'legacy') {
    workflows.push('context-driven-development');
  }

  return workflows;
}

/**
 * Suggest appropriate agents based on tech stack
 */
async function suggestAgents(projectPath) {
  const agents = [];

  // Read package.json for TypeScript
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = safeParseJSON(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['typescript']) {
        agents.push('typescript-pro');
      }

      if (allDeps['react']) {
        agents.push('frontend-pro');
      }

      if (allDeps['next']) {
        agents.push('nextjs-pro');
      }

      if (allDeps['vue']) {
        agents.push('frontend-pro');
      }

      if (allDeps['express'] || allDeps['fastify']) {
        agents.push('nodejs-pro');
      }
    } catch (_err) {
      // Invalid JSON
    }
  }

  // Check for Python
  if (
    fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(projectPath, 'requirements.txt'))
  ) {
    agents.push('python-pro');
  }

  // Check for Go
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    agents.push('golang-pro');
  }

  // Always suggest QA for brownfield projects with low test coverage
  agents.push('qa');

  return agents;
}

/**
 * Count files recursively matching pattern
 */
function countFilesRecursive(dir, pattern) {
  let count = 0;

  if (!fs.existsSync(dir)) {
    return count;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      count += countFilesRecursive(filePath, pattern);
    } else if (pattern.test(file)) {
      count++;
    }
  }

  return count;
}

module.exports = {
  assess,
};
