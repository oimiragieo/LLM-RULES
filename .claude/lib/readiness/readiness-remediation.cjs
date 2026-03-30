#!/usr/bin/env node
/* eslint-disable max-lines -- remediation templates + pipeline logic in one facade */
/**
 * Readiness Remediation
 * =====================
 *
 * Auto-remediation pipeline for failing readiness criteria.
 * Run with fix:true to generate remediation tasks for each failing pillar.
 *
 * Features:
 * - Generates remediation tasks for each failing pillar
 * - Scaffolds missing configs from templates (devcontainer.json, AGENTS.md, pre-commit hooks)
 * - Dry-run mode (dryRun:true) lists planned changes without writing files
 * - Failed remediation captured as {pillar, status:'failed', error} without aborting others
 * - When git available, each remediation creates separate branch (fix/readiness-{pillar}-{timestamp})
 * - When no git, skips branch creation, scaffolds files directly
 * - Original branch restored after all remediations
 *
 * @module readiness-remediation
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

/**
 * Remediation templates for each pillar
 * Each template defines files to scaffold and their content
 */
const REMEDIATION_TEMPLATES = {
  styleAndValidation: {
    files: [
      {
        path: '.eslintrc.json',
        content: JSON.stringify(
          {
            env: { node: true, es2022: true },
            parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
            rules: {},
          },
          null,
          2
        ),
      },
      {
        path: '.prettierrc.json',
        content: JSON.stringify({ semi: true, singleQuote: true, tabWidth: 2 }, null, 2),
      },
    ],
    action: 'Create ESLint and Prettier configuration',
    description: 'Add style enforcement tools to improve code consistency',
  },

  buildSystem: {
    files: [
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: './dist',
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
          },
          null,
          2
        ),
      },
    ],
    action: 'Create TypeScript configuration',
    description: 'Add build system configuration for compilation',
  },

  testing: {
    files: [
      {
        path: 'jest.config.js',
        content: `/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/*.test.cjs'],
  collectCoverageFrom: ['src/**/*.js', 'src/**/*.cjs'],
  coverageDirectory: 'coverage',
};

module.exports = config;
`,
      },
    ],
    action: 'Create Jest configuration',
    description: 'Add testing framework configuration',
  },

  documentation: {
    files: [
      {
        path: 'README.md',
        content: `# Project Name

A brief description of this project.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
npm start
\`\`\`

## Development

\`\`\`bash
npm test
npm run lint
\`\`\`

## License

MIT
`,
      },
      {
        path: 'CHANGELOG.md',
        content: `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initial release

## [1.0.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial release
`,
      },
      {
        path: 'CONTRIBUTING.md',
        content: `# Contributing

Thank you for your interest in contributing!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: \`npm install\`
3. Run tests: \`npm test\`

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Run tests and lint
4. Submit a pull request

## Code Style

This project uses ESLint and Prettier for code formatting.
`,
      },
    ],
    action: 'Create documentation files',
    description: 'Add README, CHANGELOG, and CONTRIBUTING guides',
  },

  developmentEnvironment: {
    files: [
      {
        path: '.devcontainer/devcontainer.json',
        content: JSON.stringify(
          {
            name: 'Development Container',
            image: 'mcr.microsoft.com/devcontainers/javascript-node:22',
            features: {},
            customizations: {
              vscode: {
                extensions: ['dbaeumer.vscode-eslint', 'esbenp.prettier-vscode'],
              },
            },
            postCreateCommand: 'npm install',
            remoteUser: 'node',
          },
          null,
          2
        ),
      },
      {
        path: '.env.example',
        content: `# Environment Variables
# Copy this file to .env and fill in your values

# NODE_ENV=development
# API_KEY=your-api-key-here
# DATABASE_URL=postgresql://localhost:5432/mydb
`,
      },
    ],
    action: 'Create devcontainer configuration',
    description: 'Add development container setup for consistent environments',
  },

  debuggingAndObservability: {
    files: [
      {
        path: '.vscode/launch.json',
        content: JSON.stringify(
          {
            version: '0.2.0',
            configurations: [
              {
                type: 'node',
                request: 'launch',
                name: 'Launch Program',
                skipFiles: ['<node_internals>/**'],
                program: '${workspaceFolder}/src/index.js',
              },
              {
                type: 'node',
                request: 'launch',
                name: 'Run Tests',
                runtimeExecutable: 'npm',
                runtimeArgs: ['test'],
                console: 'integratedTerminal',
              },
            ],
          },
          null,
          2
        ),
      },
    ],
    action: 'Create VS Code debug configuration',
    description: 'Add debugging configuration for VS Code',
  },

  security: {
    files: [
      {
        path: '.pre-commit-hooks.yaml',
        content: `# Pre-commit hooks configuration
# Install pre-commit: pip install pre-commit
# Run: pre-commit install

repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: \\.[jt]s$
`,
      },
      {
        path: 'SECURITY.md',
        content: `# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. Do NOT open a public issue
2. Email the maintainers directly
3. Include detailed steps to reproduce
4. Allow 48 hours for initial response

## Security Best Practices

- Keep dependencies updated
- Run \`npm audit\` regularly
- Never commit secrets to the repository
`,
      },
    ],
    action: 'Create security configuration',
    description: 'Add pre-commit hooks and security policy',
  },

  taskDiscovery: {
    files: [
      {
        path: 'AGENTS.md',
        content: `# Agent Guidelines

This file provides context for AI agents working on this codebase.

## Project Overview

[Describe your project here]

## Architecture

[Describe the main architectural patterns]

## Build & Test

\`\`\`bash
npm install     # Install dependencies
npm test        # Run tests
npm run lint    # Run linter
npm run build   # Build the project
\`\`\`

## Code Conventions

- Use CommonJS modules (.cjs extension)
- Follow ESLint rules
- Write tests for new features

## Important Files

- \`src/\` - Source code
- \`tests/\` - Test files
- \`package.json\` - Project configuration

## Known Issues

- [List any known issues or limitations]
`,
      },
    ],
    action: 'Create AGENTS.md',
    description: 'Add agent context file for task discovery',
  },

  productAndExperimentation: {
    files: [
      {
        path: '.github/workflows/ci.yml',
        content: `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
`,
      },
    ],
    action: 'Create CI workflow',
    description: 'Add GitHub Actions CI workflow',
  },
};

/**
 * Check if git is available in the repository
 * @param {string} repoPath - Repository path
 * @returns {boolean} True if git is available
 */
function checkGitAvailable(repoPath) {
  try {
    // Check if git command exists
    const isWindows = process.platform === 'win32';
    const result = childProcess.spawnSync(
      isWindows ? 'where' : 'which',
      ['git'],
      { stdio: 'pipe', windowsHide: true }
    );
    if (result.status !== 0) return false;

    // Check if this is a git repository
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Get current git branch
 * @param {string} repoPath - Repository path
 * @returns {string|null} Current branch name or null
 */
function getCurrentBranch(repoPath) {
  try {
    const result = childProcess.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath,
      stdio: 'pipe',
      windowsHide: true,
    });
    if (result.status === 0) {
      return result.stdout.toString().trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a new git branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch name to create
 * @returns {boolean} True if successful
 */
function createBranch(repoPath, branchName) {
  try {
    const result = childProcess.spawnSync('git', ['checkout', '-b', branchName], {
      cwd: repoPath,
      stdio: 'pipe',
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Checkout an existing branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch name to checkout
 * @returns {boolean} True if successful
 */
function checkoutBranch(repoPath, branchName) {
  try {
    const result = childProcess.spawnSync('git', ['checkout', branchName], {
      cwd: repoPath,
      stdio: 'pipe',
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Generate timestamp for branch naming
 * @returns {string} Timestamp string (YYYYMMDD-HHMMSS)
 */
function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * ReadinessRemediation class
 */
class ReadinessRemediation {
  /**
   * Create a new ReadinessRemediation instance
   * @param {Object} options - Configuration options
   * @param {string} options.repoPath - Repository path to remediate
   * @param {Object} options.report - Readiness report from scorer
   * @param {boolean} [options.fix] - Whether to generate remediations (default: false)
   * @param {boolean} [options.dryRun] - Dry-run mode, don't write files (default: false)
   * @param {boolean} [options.gitAvailable] - Override git detection (optional)
   * @param {string} [options.originalBranch] - Override original branch (optional)
   * @param {string[]} [options.mockFailures] - Pillars to simulate failure for testing
   */
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('Options object is required');
    }

    this.repoPath = path.normalize(options.repoPath);
    this.report = options.report;
    this.fix = options.fix === true;
    this.dryRun = options.dryRun === true;
    this.mockFailures = options.mockFailures || [];

    // Git state
    this.gitAvailable =
      options.gitAvailable !== undefined
        ? options.gitAvailable === true
        : checkGitAvailable(this.repoPath);
    this.originalBranch = options.originalBranch || getCurrentBranch(this.repoPath);
    this.timestamp = generateTimestamp();
  }

  /**
   * Get failing pillars from the report
   * @returns {string[]} List of failing pillar names
   */
  getFailingPillars() {
    if (!this.report || !this.report.pillars) {
      return [];
    }

    return Object.entries(this.report.pillars)
      .filter(([_, pillar]) => !pillar.passed)
      .map(([name]) => name);
  }

  /**
   * Generate remediation task for a pillar
   * @param {string} pillar - Pillar name
   * @returns {Object} Remediation task
   */
  generateRemediationTask(pillar) {
    const template = REMEDIATION_TEMPLATES[pillar];
    if (!template) {
      return {
        pillar,
        action: 'investigate',
        description: `No template available for pillar '${pillar}'. Manual investigation required.`,
        files: [],
        status: 'no_template',
      };
    }

    const files = template.files.map(f => ({
      path: f.path,
      fullPath: path.join(this.repoPath, f.path),
    }));

    return {
      pillar,
      action: template.action,
      description: template.description,
      files: files.map(f => f.path),
      _filesData: template.files, // Internal use only
      status: 'pending',
    };
  }

  /**
   * Scaffold a file from template
   * @param {Object} fileData - File data with path and content
   * @returns {Object} Result { success, error? }
   */
  scaffoldFile(fileData) {
    const fullPath = path.join(this.repoPath, fileData.path);

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file (skip if exists and dry-run)
      if (fs.existsSync(fullPath)) {
        return { success: true, skipped: true, reason: 'File already exists' };
      }

      fs.writeFileSync(fullPath, fileData.content, 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Execute a single remediation
   * @param {Object} task - Remediation task
   * @returns {Object} Updated task with status
   */
  executeRemediation(task) {
    // Check if this is a mock failure
    if (this.mockFailures.includes(task.pillar)) {
      return {
        ...task,
        status: 'failed',
        error: 'Mock failure for testing',
      };
    }

    // If no template, return as-is
    if (task.status === 'no_template') {
      return task;
    }

    // If dry-run, don't actually write files
    if (this.dryRun) {
      return {
        ...task,
        status: 'planned',
      };
    }

    // Create branch if git available
    let branchCreated = false;
    let branchName = null;

    if (this.gitAvailable) {
      branchName = `fix/readiness-${task.pillar}-${this.timestamp}`;
      branchCreated = createBranch(this.repoPath, branchName);
    }

    // Scaffold files
    const results = [];
    const filesData = task._filesData || [];

    for (const fileData of filesData) {
      const result = this.scaffoldFile(fileData);
      results.push({ file: fileData.path, ...result });
    }

    // Check if all files succeeded
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      return {
        ...task,
        status: 'failed',
        error: `Failed to scaffold: ${failures.map(f => f.file).join(', ')}`,
        branch: branchName,
        fileResults: results,
      };
    }

    return {
      ...task,
      status: 'completed',
      branch: branchName,
      branchCreated,
      fileResults: results,
    };
  }

  /**
   * Run the remediation pipeline
   * @returns {Object} Remediation result
   */
  remediate() {
    const remediations = [];
    const plan = [];
    const failingPillars = this.getFailingPillars();

    // If fix is false or no failing pillars, return early
    if (!this.fix || failingPillars.length === 0) {
      return {
        remediations: [],
        plan: [],
        summary: {
          total: 0,
          completed: 0,
          failed: 0,
          planned: 0,
        },
        gitAvailable: this.gitAvailable,
        dryRun: this.dryRun,
        fix: this.fix,
        restoredBranch: null,
      };
    }

    // Generate tasks for each failing pillar
    for (const pillar of failingPillars) {
      const task = this.generateRemediationTask(pillar);
      remediations.push(task);

      // Add to plan
      if (task._filesData) {
        for (const fileData of task._filesData) {
          plan.push({
            pillar,
            file: fileData.path,
            action: this.dryRun ? 'would_create' : 'create',
          });
        }
      }
    }

    // Execute each remediation
    const executedRemediations = [];
    for (const task of remediations) {
      const executed = this.executeRemediation(task);
      executedRemediations.push(executed);
    }

    // Restore original branch if git was used
    // In dry-run mode, we just report what would happen
    let restoredBranch = null;
    if (this.gitAvailable && this.originalBranch) {
      if (this.dryRun) {
        // In dry-run mode, report the intended restore without actually doing it
        restoredBranch = this.originalBranch;
      } else {
        const restored = checkoutBranch(this.repoPath, this.originalBranch);
        if (restored) {
          restoredBranch = this.originalBranch;
        }
      }
    }

    // Calculate summary
    const completed = executedRemediations.filter(r => r.status === 'completed').length;
    const failed = executedRemediations.filter(r => r.status === 'failed').length;
    const planned = executedRemediations.filter(r => r.status === 'planned').length;

    // Clean up internal data from results
    const cleanedRemediations = executedRemediations.map(r => {
      const { _filesData, ...clean } = r;
      return clean;
    });

    return {
      remediations: cleanedRemediations,
      plan: plan.map(p => `${p.action}: ${p.file} (${p.pillar})`),
      summary: {
        total: executedRemediations.length,
        completed,
        failed,
        planned,
      },
      gitAvailable: this.gitAvailable,
      dryRun: this.dryRun,
      fix: this.fix,
      restoredBranch,
    };
  }
}

/**
 * Convenience function to remediate a repository
 * @param {Object} options - Options including repoPath, report, fix, dryRun
 * @returns {Object} Remediation result
 */
function remediateReadiness(options) {
  const remediator = new ReadinessRemediation(options);
  return remediator.remediate();
}

module.exports = {
  ReadinessRemediation,
  remediateReadiness,
  REMEDIATION_TEMPLATES,
  checkGitAvailable,
  getCurrentBranch,
  createBranch,
  checkoutBranch,
  generateTimestamp,
};
