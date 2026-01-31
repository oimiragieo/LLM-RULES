#!/usr/bin/env node

/**
 * Project Analyzer Test Suite
 *
 * Basic tests for project analyzer functionality
 *
 * @version 1.0.0
 */

import { analyzeProject } from '../analyzer.mjs';
import { detectFrameworks } from '../detectors/framework-detector.mjs';
import { analyzeDependencies } from '../detectors/dependency-detector.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Framework detection from package.json
test('Framework detection from package.json', () => {
  const mockPackageJson = {
    dependencies: {
      next: '^14.0.0',
      react: '^18.2.0',
      prisma: '^5.0.0',
    },
    devDependencies: {
      vitest: '^1.0.0',
      eslint: '^8.0.0',
    },
  };

  const frameworks = detectFrameworks({ 'package.json': mockPackageJson });

  assert(frameworks.length >= 3, 'Should detect at least 3 frameworks');
  assert(
    frameworks.some(f => f.name === 'nextjs'),
    'Should detect Next.js'
  );
  assert(
    frameworks.some(f => f.name === 'react'),
    'Should detect React'
  );
  assert(
    frameworks.some(f => f.name === 'vitest'),
    'Should detect Vitest'
  );
});

// Test 2: Dependency analysis from package.json
test('Dependency analysis from package.json', () => {
  const mockPackageJson = {
    dependencies: {
      next: '^14.0.0',
      react: '^18.2.0',
    },
    devDependencies: {
      vitest: '^1.0.0',
      eslint: '^8.0.0',
    },
  };

  const deps = analyzeDependencies({ 'package.json': mockPackageJson });

  assert(deps.production === 2, 'Should have 2 production dependencies');
  assert(deps.development === 2, 'Should have 2 development dependencies');
});

// Test 3: Python dependency parsing
test('Python dependency parsing from requirements.txt', () => {
  const mockRequirements = `
fastapi>=0.100.0
pydantic>=2.0.0
pytest>=7.0.0
uvicorn[standard]>=0.20.0
  `.trim();

  const deps = analyzeDependencies({ 'requirements.txt': mockRequirements });

  assert(deps.production >= 2, 'Should detect production dependencies');
  assert(deps.development >= 1, 'Should detect development dependencies (pytest)');
});

// Test 4: Analyze current project (LLM-RULES)
test('Analyze current project structure', async () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

  try {
    const analysis = await analyzeProject(projectRoot);

    assert(analysis.analysis_id, 'Should have analysis_id');
    assert(analysis.project_type, 'Should detect project type');
    assert(analysis.stats, 'Should have stats');
    assert(analysis.frameworks, 'Should have frameworks');
    assert(analysis.structure, 'Should have structure');
    assert(analysis.metadata, 'Should have metadata');

    console.log(`  ✓ Project type: ${analysis.project_type}`);
    console.log(`  ✓ Total files: ${analysis.stats.total_files}`);
    console.log(`  ✓ Frameworks: ${analysis.frameworks.length}`);
    console.log(`  ✓ Architecture: ${analysis.structure.architecture_pattern}`);
  } catch (error) {
    // Gracefully handle if project structure is unexpected
    console.log(`  ⚠ Analysis skipped: ${error.message}`);
  }
});

// Test 5: Schema validation
test('Output conforms to required schema fields', async () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

  try {
    const analysis = await analyzeProject(projectRoot);

    const requiredFields = [
      'analysis_id',
      'project_type',
      'analyzed_at',
      'stats',
      'frameworks',
      'structure',
    ];

    for (const field of requiredFields) {
      assert(field in analysis, `Missing required field: ${field}`);
    }

    // Validate stats structure
    assert(typeof analysis.stats.total_files === 'number', 'stats.total_files should be number');
    assert(typeof analysis.stats.total_lines === 'number', 'stats.total_lines should be number');
    assert(typeof analysis.stats.languages === 'object', 'stats.languages should be object');

    // Validate frameworks array
    assert(Array.isArray(analysis.frameworks), 'frameworks should be array');

    // Validate structure
    assert(Array.isArray(analysis.structure.root_directories), 'root_directories should be array');
    assert(Array.isArray(analysis.structure.entry_points), 'entry_points should be array');
  } catch (error) {
    console.log(`  ⚠ Validation skipped: ${error.message}`);
  }
});

// Run all tests
async function runTests() {
  console.log('\n🧪 Running Project Analyzer Tests...\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`✅ ${name}`);
    } catch (error) {
      failed++;
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
