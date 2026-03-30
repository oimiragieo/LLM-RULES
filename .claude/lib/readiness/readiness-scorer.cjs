#!/usr/bin/env node
/**
 * Readiness Scorer
 * ================
 *
 * 5-level Autonomy Maturity Model (AMM) with 9 weighted pillars.
 * Each pillar executes real commands and checks exit codes.
 *
 * Pillars and weights:
 * - styleAndValidation: 1.0
 * - buildSystem: 1.0
 * - testing: 1.5
 * - documentation: 0.8
 * - developmentEnvironment: 0.8
 * - debuggingAndObservability: 1.0
 * - security: 1.2
 * - taskDiscovery: 0.7
 * - productAndExperimentation: 0.5
 *
 * Level classification:
 * - L1: 0-39
 * - L2: 40-59
 * - L3: 60-79
 * - L4: 80-94
 * - L5: 95-100
 *
 * @module readiness-scorer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const Ajv = require('ajv');

const { commandExists } = require('../utils/command-exists.cjs');

/**
 * Pillar weights from specification
 */
const PILLAR_WEIGHTS = {
  styleAndValidation: 1.0,
  buildSystem: 1.0,
  testing: 1.5,
  documentation: 0.8,
  developmentEnvironment: 0.8,
  debuggingAndObservability: 1.0,
  security: 1.2,
  taskDiscovery: 0.7,
  productAndExperimentation: 0.5,
};

/**
 * Level boundaries from specification
 */
const LEVEL_BOUNDARIES = [
  { name: 'L1', min: 0, max: 39 },
  { name: 'L2', min: 40, max: 59 },
  { name: 'L3', min: 60, max: 79 },
  { name: 'L4', min: 80, max: 94 },
  { name: 'L5', min: 95, max: 100 },
];

/**
 * Gate threshold (80% per level)
 */
const GATE_THRESHOLD = 80;

/**
 * Default command timeout (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Pillar definitions: command patterns and scoring logic
 * Each pillar has:
 * - name: pillar identifier
 * - commands: array of commands to check (first successful wins)
 * - files: array of file patterns to check for existence
 * - scoreFn: optional custom scoring function
 */
const PILLAR_DEFINITIONS = [
  {
    name: 'styleAndValidation',
    commands: [
      { cmd: 'pnpm lint', weight: 0.5 },
      { cmd: 'pnpm format:check', weight: 0.3 },
    ],
    files: [
      { pattern: '.eslintrc', score: 10 },
      { pattern: '.eslintrc.js', score: 10 },
      { pattern: '.eslintrc.json', score: 10 },
      { pattern: '.eslintrc.yaml', score: 10 },
      { pattern: '.eslintrc.yml', score: 10 },
      { pattern: '.prettierrc', score: 5 },
      { pattern: '.prettierrc.json', score: 5 },
      { pattern: '.prettierrc.yaml', score: 5 },
      { pattern: '.prettierignore', score: 5 },
    ],
    description: 'Code style enforcement and validation tools',
  },
  {
    name: 'buildSystem',
    commands: [
      { cmd: 'pnpm build', weight: 0.4, optional: true },
      { cmd: 'npm run build', weight: 0.4, optional: true },
    ],
    files: [
      { pattern: 'package.json', score: 20, required: true },
      { pattern: 'tsconfig.json', score: 15 },
      { pattern: 'webpack.config.js', score: 10 },
      { pattern: 'vite.config.js', score: 10 },
      { pattern: 'vite.config.ts', score: 10 },
      { pattern: 'rollup.config.js', score: 10 },
      { pattern: 'Cargo.toml', score: 15 },
      { pattern: 'pyproject.toml', score: 15 },
    ],
    description: 'Build configuration and tooling',
  },
  {
    name: 'testing',
    commands: [{ cmd: 'pnpm test', weight: 0.6 }],
    files: [
      { pattern: 'jest.config.js', score: 10 },
      { pattern: 'jest.config.ts', score: 10 },
      { pattern: 'vitest.config.js', score: 10 },
      { pattern: 'vitest.config.ts', score: 10 },
      { pattern: 'pytest.ini', score: 10 },
      { pattern: 'tests/', score: 15, isDir: true },
      { pattern: 'test/', score: 15, isDir: true },
      { pattern: '__tests__/', score: 15, isDir: true },
    ],
    description: 'Test framework and coverage',
  },
  {
    name: 'documentation',
    commands: [],
    files: [
      { pattern: 'README.md', score: 20, required: true },
      { pattern: 'CHANGELOG.md', score: 10 },
      { pattern: 'CONTRIBUTING.md', score: 10 },
      { pattern: 'docs/', score: 20, isDir: true },
      { pattern: '.github/CONTRIBUTING.md', score: 10 },
      { pattern: 'LICENSE', score: 10 },
      { pattern: 'LICENSE.md', score: 10 },
    ],
    description: 'Project documentation and guides',
  },
  {
    name: 'developmentEnvironment',
    commands: [],
    files: [
      { pattern: '.devcontainer/devcontainer.json', score: 20 },
      { pattern: '.devcontainer.json', score: 20 },
      { pattern: 'docker-compose.yml', score: 15 },
      { pattern: 'docker-compose.yaml', score: 15 },
      { pattern: 'Dockerfile', score: 15 },
      { pattern: '.nvmrc', score: 10 },
      { pattern: '.python-version', score: 10 },
      { pattern: 'flake.nix', score: 15 },
      { pattern: '.env.example', score: 10 },
    ],
    description: 'Development environment configuration',
  },
  {
    name: 'debuggingAndObservability',
    commands: [],
    files: [
      { pattern: '.vscode/launch.json', score: 15 },
      { pattern: '.vscode/', score: 10, isDir: true },
      { pattern: 'sentry.properties', score: 10 },
      { pattern: '.sentryclirc', score: 10 },
      { pattern: 'prometheus.yml', score: 10 },
      { pattern: 'grafana/', score: 10, isDir: true },
      { pattern: 'opentelemetry.js', score: 10 },
    ],
    description: 'Debugging tools and observability setup',
  },
  {
    name: 'security',
    commands: [
      { cmd: 'pnpm audit', weight: 0.3, expectNonZero: false },
      { cmd: 'npm audit', weight: 0.3, expectNonZero: false },
    ],
    files: [
      { pattern: '.github/SECURITY.md', score: 15 },
      { pattern: 'SECURITY.md', score: 15 },
      { pattern: '.snyk', score: 10 },
      { pattern: '.dependabot.yml', score: 10 },
      { pattern: '.github/dependabot.yml', score: 10 },
      { pattern: '.gitignore', score: 10, required: true },
      { pattern: '.pre-commit-hooks.yaml', score: 10 },
      { pattern: '.prettierrc', score: 5 }, // For formatting consistency
    ],
    description: 'Security configuration and vulnerability scanning',
  },
  {
    name: 'taskDiscovery',
    commands: [],
    files: [
      { pattern: 'AGENTS.md', score: 25 },
      { pattern: '.claude/AGENTS.md', score: 25 },
      { pattern: 'CLAUDE.md', score: 20 },
      { pattern: '.cursorrules', score: 15 },
      { pattern: '.github/ISSUE_TEMPLATE/', score: 15, isDir: true },
      { pattern: '.github/PULL_REQUEST_TEMPLATE.md', score: 10 },
      { pattern: 'TODO.md', score: 5 },
    ],
    description: 'Task discovery and agent context files',
  },
  {
    name: 'productAndExperimentation',
    commands: [],
    files: [
      { pattern: '.github/workflows/', score: 20, isDir: true },
      { pattern: '.gitlab-ci.yml', score: 15 },
      { pattern: 'Jenkinsfile', score: 15 },
      { pattern: '.circleci/', score: 15, isDir: true },
      { pattern: 'vercel.json', score: 10 },
      { pattern: 'netlify.toml', score: 10 },
      { pattern: 'firebase.json', score: 10 },
      { pattern: '.github/ACTIONS.md', score: 5 },
    ],
    description: 'CI/CD and deployment automation',
  },
];

/**
 * JSON Schema for readiness report validation
 */
const READINESS_REPORT_SCHEMA = {
  type: 'object',
  required: ['repoPath', 'timestamp', 'level', 'overallScore', 'pillars', 'gateStatus'],
  properties: {
    repoPath: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    level: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
    overallScore: { type: 'number', minimum: 0, maximum: 100 },
    pillars: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['score', 'passed', 'weight', 'command', 'exitCode'],
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          passed: { type: 'boolean' },
          weight: { type: 'number' },
          command: { type: 'string' },
          exitCode: { type: 'number', nullable: true },
          reason: { type: 'string', nullable: true },
        },
        additionalProperties: false,
      },
    },
    gateStatus: {
      type: 'object',
      required: ['passed', 'threshold'],
      properties: {
        passed: { type: 'boolean' },
        threshold: { type: 'number' },
        details: { type: 'string' },
      },
      additionalProperties: true,
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};

/**
 * Get level name from score
 * @param {number} score - Overall score (0-100)
 * @returns {string} Level name (L1-L5)
 */
function getLevelFromScore(score) {
  for (const boundary of LEVEL_BOUNDARIES) {
    if (score >= boundary.min && score <= boundary.max) {
      return boundary.name;
    }
  }
  // Fallback for edge cases
  if (score >= 95) return 'L5';
  if (score >= 80) return 'L4';
  if (score >= 60) return 'L3';
  if (score >= 40) return 'L2';
  return 'L1';
}

/**
 * Execute a command with timeout
 * @param {string} command - Command to execute
 * @param {number} timeout - Timeout in ms
 * @param {string} cwd - Working directory
 * @returns {Object} Execution result { exitCode, stdout, stderr, timedOut, error }
 */
function executeCommand(command, timeout, cwd) {
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/sh';
  const shellFlag = isWindows ? '/c' : '-c';

  try {
    const result = childProcess.spawnSync(shell, [shellFlag, command], {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Check for timeout
    if (result.signal === 'SIGKILL' || (result.error && result.error.code === 'ETIMEDOUT')) {
      return { exitCode: null, stdout: '', stderr: '', timedOut: true, error: null };
    }

    // Handle spawn errors
    if (result.error) {
      return {
        exitCode: null,
        stdout: result.stdout ? result.stdout.toString() : '',
        stderr: result.stderr ? result.stderr.toString() : '',
        timedOut: false,
        error: result.error,
      };
    }

    return {
      exitCode: result.status,
      stdout: result.stdout ? result.stdout.toString() : '',
      stderr: result.stderr ? result.stderr.toString() : '',
      timedOut: false,
      error: null,
    };
  } catch (err) {
    return {
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      error: err,
    };
  }
}

/**
 * Check if a file or directory exists
 * @param {string} basePath - Base path to check from
 * @param {Object} filePattern - File pattern definition
 * @returns {boolean} True if exists
 */
function checkFileExists(basePath, filePattern) {
  const fullPath = path.join(basePath, filePattern.pattern);

  if (filePattern.isDir) {
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  }

  return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
}

/**
 * Evaluate a single pillar
 * @param {Object} pillarDef - Pillar definition
 * @param {string} repoPath - Repository path
 * @param {number} timeout - Command timeout
 * @param {Object} mockData - Optional mock data for testing
 * @returns {Object} Pillar result { score, passed, weight, command, exitCode, reason }
 */
function evaluatePillar(pillarDef, repoPath, timeout, mockData = null) {
  // Use mock data if provided
  if (mockData && mockData[pillarDef.name]) {
    const mock = mockData[pillarDef.name];
    return {
      score: mock.score,
      passed: mock.exitCode === 0,
      weight: PILLAR_WEIGHTS[pillarDef.name],
      command: '<mock>',
      exitCode: mock.exitCode,
      reason: mock.reason || null,
    };
  }

  let score = 0;
  let bestCommand = '<none>';
  let exitCode = null;
  let reason = null;
  const missingFiles = [];

  // Check files first
  for (const filePattern of pillarDef.files) {
    if (checkFileExists(repoPath, filePattern)) {
      score += filePattern.score;
    } else {
      if (filePattern.required) {
        missingFiles.push(filePattern.pattern);
      }
    }
  }

  // Execute commands
  let commandScore = 0;
  for (const cmdDef of pillarDef.commands) {
    // Skip if binary doesn't exist
    const binary = cmdDef.cmd.split(' ')[0];
    if (!commandExists(binary)) {
      if (!cmdDef.optional) {
        reason = `Binary '${binary}' not found`;
      }
      continue;
    }

    const result = executeCommand(cmdDef.cmd, timeout, repoPath);

    // Handle timeout
    if (result.timedOut) {
      reason = `Command '${cmdDef.cmd}' timed out after ${timeout}ms`;
      exitCode = null;
      continue;
    }

    // Handle execution error
    if (result.error) {
      reason = `Command failed: ${result.error.message}`;
      exitCode = null;
      continue;
    }

    exitCode = result.exitCode;
    bestCommand = cmdDef.cmd;

    // Check if command passed
    // Some commands like 'pnpm audit' are expected to return non-zero when vulnerabilities found
    const passed = cmdDef.expectNonZero ? result.exitCode !== 0 : result.exitCode === 0;

    if (passed) {
      commandScore += (cmdDef.weight || 0.5) * 100;
    } else {
      reason = `Command '${cmdDef.cmd}' exited with code ${result.exitCode}`;
    }

    // Use first successful command
    if (passed) break;
  }

  // Combine file score and command score
  // File checks contribute up to 50%, commands up to 50%
  const fileMaxScore = pillarDef.files.reduce((sum, f) => sum + f.score, 0);
  const normalizedFileScore = fileMaxScore > 0 ? (score / fileMaxScore) * 50 : 50;

  const totalScore = Math.min(100, normalizedFileScore + commandScore);

  // Determine passed status based on gate threshold
  const passed = totalScore >= GATE_THRESHOLD;

  return {
    score: Math.round(totalScore),
    passed,
    weight: PILLAR_WEIGHTS[pillarDef.name],
    command: bestCommand,
    exitCode,
    reason: reason || null,
  };
}

/**
 * Calculate overall weighted score
 * @param {Object} pillars - Pillar results object
 * @returns {number} Weighted average score (0-100)
 */
function calculateOverallScore(pillars) {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const pillar of Object.values(pillars)) {
    totalWeightedScore += pillar.score * pillar.weight;
    totalWeight += pillar.weight;
  }

  if (totalWeight === 0) return 0;

  return Math.round(totalWeightedScore / totalWeight);
}

/**
 * Generate recommendations based on pillar results
 * @param {Object} pillars - Pillar results
 * @returns {Array<string>} List of recommendations
 */
function generateRecommendations(pillars) {
  const recommendations = [];

  for (const [name, pillar] of Object.entries(pillars)) {
    if (!pillar.passed) {
      const def = PILLAR_DEFINITIONS.find(d => d.name === name);
      if (def) {
        recommendations.push(
          `Improve ${name}: ${def.description}. Current score: ${pillar.score}/100`
        );
      }
    }
  }

  return recommendations;
}

/**
 * ReadinessScorer class
 */
class ReadinessScorer {
  /**
   * Create a new ReadinessScorer instance
   * @param {Object} options - Configuration options
   * @param {string} options.repoPath - Repository path to score
   * @param {number} [options.timeout] - Command timeout in ms (default 30000)
   * @param {Object} [options.mockPillars] - Mock pillar data for testing
   * @param {number} [options.mockScore] - Mock overall score for testing
   */
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('Options object is required');
    }

    this.repoPath = path.normalize(options.repoPath);
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.mockPillars = options.mockPillars || null;
    this.mockScore = options.mockScore !== undefined ? options.mockScore : null;
  }

  /**
   * Run the readiness scoring
   * @returns {Object} Readiness report
   */
  score() {
    // Check if repo exists
    if (!fs.existsSync(this.repoPath)) {
      throw new Error(`Repository path does not exist: ${this.repoPath}`);
    }

    const pillars = {};

    // Evaluate each pillar
    for (const pillarDef of PILLAR_DEFINITIONS) {
      pillars[pillarDef.name] = evaluatePillar(
        pillarDef,
        this.repoPath,
        this.timeout,
        this.mockPillars
      );
    }

    // Calculate overall score
    let overallScore;
    if (this.mockScore !== null) {
      overallScore = this.mockScore;
    } else {
      overallScore = calculateOverallScore(pillars);
    }

    // Determine level
    const level = getLevelFromScore(overallScore);

    // Gate status
    const gatePassed = overallScore >= GATE_THRESHOLD;
    const gateStatus = {
      passed: gatePassed,
      threshold: GATE_THRESHOLD,
      details: gatePassed
        ? `Score ${overallScore} meets threshold ${GATE_THRESHOLD}`
        : `Score ${overallScore} below threshold ${GATE_THRESHOLD}`,
    };

    // Generate recommendations
    const recommendations = generateRecommendations(pillars);

    // Build report
    const report = {
      repoPath: this.repoPath,
      timestamp: new Date().toISOString(),
      level,
      overallScore,
      pillars,
      gateStatus,
      recommendations,
    };

    // Validate report against schema
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(READINESS_REPORT_SCHEMA);
    const valid = validate(report);

    if (!valid) {
      // Log validation errors but don't throw - return report anyway
      console.error('Readiness report schema validation failed:', validate.errors);
    }

    return report;
  }
}

/**
 * Convenience function to score a repository
 * @param {string} repoPath - Repository path
 * @param {Object} options - Optional configuration
 * @returns {Object} Readiness report
 */
function scoreReadiness(repoPath, options = {}) {
  const scorer = new ReadinessScorer({
    repoPath,
    ...options,
  });
  return scorer.score();
}

// Initialize AJV validator for external use
const ajv = new Ajv({ strict: false });
const validateReport = ajv.compile(READINESS_REPORT_SCHEMA);

module.exports = {
  ReadinessScorer,
  scoreReadiness,
  PILLAR_WEIGHTS,
  LEVEL_BOUNDARIES,
  GATE_THRESHOLD,
  DEFAULT_TIMEOUT,
  PILLAR_DEFINITIONS,
  READINESS_REPORT_SCHEMA,
  validateReport,
  getLevelFromScore,
  calculateOverallScore,
};
