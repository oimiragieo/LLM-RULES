/**
 * Tech Stack Detector
 *
 * Analyzes project structure to identify:
 * - Primary language(s)
 * - Frameworks and libraries
 * - Build tools and package managers
 * - Testing frameworks
 * - CI/CD tooling
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Framework detection patterns
 */
const FRAMEWORK_PATTERNS = {
  // JavaScript/TypeScript
  react: ['react', '@types/react'],
  next: ['next'],
  vue: ['vue'],
  angular: ['@angular/core'],
  express: ['express'],
  fastify: ['fastify'],

  // Python
  django: ['django', 'Django'],
  fastapi: ['fastapi'],
  flask: ['flask', 'Flask'],

  // Go
  gin: ['github.com/gin-gonic/gin'],
  echo: ['github.com/labstack/echo'],
};

/**
 * Testing framework patterns
 */
const TEST_PATTERNS = {
  jest: ['jest', '@types/jest'],
  vitest: ['vitest'],
  pytest: ['pytest'],
  mocha: ['mocha'],
  chai: ['chai'],
  'testing-library': ['@testing-library/react', '@testing-library/vue'],
};

/**
 * Detect project technologies
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<Object>} Detection results
 */
async function detect(projectPath) {
  const result = {
    languages: [],
    frameworks: [],
    package_managers: [],
    build_tools: [],
    testing: [],
    ci_cd: [],
    confidence: 0,
  };

  if (!fs.existsSync(projectPath)) {
    return result;
  }

  const signals = {
    packageJson: 0,
    pyprojectToml: 0,
    requirementsTxt: 0,
    goMod: 0,
    cargoToml: 0,
    tsconfigJson: 0,
    githubActions: 0,
  };

  // Check package.json (Node.js/TypeScript)
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    signals.packageJson = 1;
    try {
      const pkg = safeParseJSON(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // Detect TypeScript
      if (allDeps['typescript']) {
        result.languages.push('typescript');
      } else {
        result.languages.push('javascript');
      }

      result.package_managers.push('npm');

      // Detect frameworks
      for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (patterns.some(p => allDeps[p])) {
          result.frameworks.push(framework);
        }
      }

      // Detect testing frameworks
      for (const [testFramework, patterns] of Object.entries(TEST_PATTERNS)) {
        if (patterns.some(p => allDeps[p])) {
          result.testing.push(testFramework);
        }
      }
    } catch (_err) {
      // Invalid JSON - continue
    }
  }

  // Check pyproject.toml (Python with Poetry)
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    signals.pyprojectToml = 1;
    result.languages.push('python');
    result.package_managers.push('poetry');

    const content = fs.readFileSync(pyprojectPath, 'utf8');

    // Detect frameworks from pyproject.toml
    if (content.includes('fastapi')) result.frameworks.push('fastapi');
    if (content.includes('django')) result.frameworks.push('django');
    if (content.includes('flask')) result.frameworks.push('flask');

    // Detect testing
    if (content.includes('pytest')) result.testing.push('pytest');
  }

  // Check requirements.txt (Python with pip)
  const requirementsPath = path.join(projectPath, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    signals.requirementsTxt = 1;
    if (!result.languages.includes('python')) {
      result.languages.push('python');
    }
    result.package_managers.push('pip');

    const content = fs.readFileSync(requirementsPath, 'utf8');

    // Detect frameworks
    if (content.includes('django')) result.frameworks.push('django');
    if (content.includes('fastapi')) result.frameworks.push('fastapi');
    if (content.includes('flask')) result.frameworks.push('flask');

    // Detect testing
    if (content.includes('pytest')) result.testing.push('pytest');
  }

  // Check go.mod (Go)
  const goModPath = path.join(projectPath, 'go.mod');
  if (fs.existsSync(goModPath)) {
    signals.goMod = 1;
    result.languages.push('go');
    result.package_managers.push('go-modules');

    const content = fs.readFileSync(goModPath, 'utf8');

    // Detect frameworks
    if (content.includes('github.com/gin-gonic/gin')) result.frameworks.push('gin');
    if (content.includes('github.com/labstack/echo')) result.frameworks.push('echo');
  }

  // Check tsconfig.json (TypeScript without package.json)
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath) && !result.languages.includes('typescript')) {
    signals.tsconfigJson = 1;
    result.languages.push('typescript');
  }

  // Check GitHub Actions
  const githubWorkflowsPath = path.join(projectPath, '.github/workflows');
  if (fs.existsSync(githubWorkflowsPath)) {
    const workflows = fs
      .readdirSync(githubWorkflowsPath)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    if (workflows.length > 0) {
      signals.githubActions = 1;
      result.ci_cd.push('github-actions');
    }
  }

  // Calculate confidence score
  const totalSignals = Object.values(signals).reduce((sum, val) => sum + val, 0);
  const maxSignals = Object.keys(signals).length;

  // Base confidence on signal strength
  if (signals.packageJson || signals.pyprojectToml || signals.goMod) {
    // Strong signal (package manager file)
    result.confidence = 0.9 + (totalSignals / maxSignals) * 0.1;
  } else if (totalSignals > 0) {
    // Medium signal (config files only)
    result.confidence = 0.5 + (totalSignals / maxSignals) * 0.3;
  } else {
    result.confidence = 0;
  }

  // Deduplicate arrays
  result.languages = [...new Set(result.languages)];
  result.frameworks = [...new Set(result.frameworks)];
  result.testing = [...new Set(result.testing)];

  return result;
}

/**
 * Detect single primary language
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<string|null>} Primary language or null
 */
async function detectLanguage(projectPath) {
  const result = await detect(projectPath);
  return result.languages[0] || null;
}

module.exports = {
  detect,
  detectLanguage,
};
