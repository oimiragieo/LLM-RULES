'use strict';

/**
 * project-stage-detection/scripts/main.cjs
 * CLI entry point for project maturity stage detection.
 * Usage: node main.cjs [--dir <path>] [--json]
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const jsonFlag = args.includes('--json');

const projectRoot = dirIdx !== -1 ? path.resolve(args[dirIdx + 1]) : process.cwd();

/** Indicator definitions: { id, label, weight, check(root) => boolean } */
const INDICATORS = [
  {
    id: 'source_dir',
    label: 'Source directory exists (src/, lib/, or app/)',
    weight: 2,
    check: root => ['src', 'lib', 'app'].some(d => fs.existsSync(path.join(root, d))),
  },
  {
    id: 'tests_exist',
    label: 'Test directory exists (tests/, test/, spec/, __tests__/)',
    weight: 2,
    check: root =>
      ['tests', 'test', 'spec', '__tests__'].some(d => fs.existsSync(path.join(root, d))),
  },
  {
    id: 'ci_pipeline',
    label: 'CI/CD pipeline configured',
    weight: 2,
    check: root =>
      fs.existsSync(path.join(root, '.github', 'workflows')) ||
      fs.existsSync(path.join(root, '.gitlab-ci.yml')) ||
      fs.existsSync(path.join(root, '.circleci', 'config.yml')),
  },
  {
    id: 'package_manifest',
    label: 'Package manifest exists (package.json or pyproject.toml)',
    weight: 1,
    check: root =>
      fs.existsSync(path.join(root, 'package.json')) ||
      fs.existsSync(path.join(root, 'pyproject.toml')) ||
      fs.existsSync(path.join(root, 'setup.py')) ||
      fs.existsSync(path.join(root, 'Cargo.toml')),
  },
  {
    id: 'readme_nontrivial',
    label: 'README.md exists and is non-trivial (>500 bytes)',
    weight: 1,
    check: root => {
      const p = path.join(root, 'README.md');
      if (!fs.existsSync(p)) return false;
      return fs.statSync(p).size > 500;
    },
  },
  {
    id: 'linting_configured',
    label: 'Linting configured (.eslintrc*, .ruff.toml, .pylintrc)',
    weight: 1,
    check: root => {
      const lintFiles = [
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.cjs',
        '.eslintrc.json',
        '.ruff.toml',
        '.pylintrc',
        '.flake8',
        'biome.json',
      ];
      return lintFiles.some(f => fs.existsSync(path.join(root, f)));
    },
  },
  {
    id: 'docs_dir',
    label: 'Documentation directory exists (docs/)',
    weight: 1,
    check: root =>
      fs.existsSync(path.join(root, 'docs')) || fs.existsSync(path.join(root, 'documentation')),
  },
  {
    id: 'changelog',
    label: 'CHANGELOG.md present',
    weight: 1,
    check: root =>
      fs.existsSync(path.join(root, 'CHANGELOG.md')) ||
      fs.existsSync(path.join(root, 'CHANGELOG.rst')),
  },
  {
    id: 'lockfile',
    label: 'Dependency lockfile present',
    weight: 1,
    check: root =>
      fs.existsSync(path.join(root, 'package-lock.json')) ||
      fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ||
      fs.existsSync(path.join(root, 'yarn.lock')) ||
      fs.existsSync(path.join(root, 'poetry.lock')) ||
      fs.existsSync(path.join(root, 'Cargo.lock')),
  },
];

function detectStage(root) {
  if (!fs.existsSync(root)) {
    process.stderr.write(`[project-stage-detection] Directory not found: ${root}\n`);
    process.exit(1);
  }

  const results = INDICATORS.map(indicator => {
    let present = false;
    try {
      present = indicator.check(root);
    } catch (_) {
      present = false;
    }
    return { ...indicator, present };
  });

  const score = results.reduce((sum, r) => sum + (r.present ? r.weight : 0), 0);
  const maxScore = INDICATORS.reduce((sum, i) => sum + i.weight, 0);
  const confidence = Math.round((score / maxScore) * 100);

  let stage;
  if (score <= 2) stage = 'new';
  else if (score <= 5) stage = 'early';
  else if (score <= 7) stage = 'mid';
  else stage = 'mature';

  const missingIndicators = results.filter(r => !r.present).map(r => r.label);

  const recommendations = [];
  if (stage === 'new') {
    recommendations.push('Initialize project structure with src/ and tests/ directories');
    recommendations.push('Add package.json or pyproject.toml');
    recommendations.push('Invoke project-onboarding skill');
  } else if (stage === 'early') {
    recommendations.push('Add test infrastructure (tests/ directory + test runner config)');
    recommendations.push('Configure CI/CD pipeline');
    recommendations.push('Invoke gap-detection skill to find missing components');
  } else if (stage === 'mid') {
    recommendations.push('Add CHANGELOG.md and keep it updated');
    recommendations.push('Configure linting if not already present');
    recommendations.push('Invoke gap-detection + proactive-audit for quality gaps');
  } else {
    recommendations.push('Run gap-detection as periodic health check');
  }

  return {
    stage,
    score,
    maxScore,
    confidence,
    projectRoot: root,
    indicators: results.map(r => ({
      id: r.id,
      label: r.label,
      present: r.present,
      weight: r.weight,
    })),
    missingIndicators,
    recommendations,
    timestamp: new Date().toISOString(),
  };
}

const result = detectStage(projectRoot);

if (jsonFlag) {
  process.stdout.write(JSON.stringify(result) + '\n');
} else {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
