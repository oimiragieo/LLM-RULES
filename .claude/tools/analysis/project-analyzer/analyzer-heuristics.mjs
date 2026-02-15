import fs from 'fs/promises';

/**
 * Detect project type from manifests and structure.
 */
export async function detectProjectType(projectRoot, manifests, helpers) {
  const { fileExists, directoryExists } = helpers;

  if (
    manifests['package.json']?.workspaces ||
    (await fileExists(projectRoot, 'pnpm-workspace.yaml')) ||
    (await fileExists(projectRoot, 'lerna.json'))
  ) {
    return 'monorepo';
  }

  if (
    (await directoryExists(projectRoot, 'android')) &&
    (await directoryExists(projectRoot, 'ios'))
  ) {
    return 'mobile';
  }

  const rootDirs = await fs.readdir(projectRoot);
  const serviceDirs = rootDirs.filter(
    dir => dir.includes('service') || dir.includes('microservice')
  );
  if (serviceDirs.length >= 3) {
    return 'microservices';
  }

  if (
    (await fileExists(projectRoot, 'serverless.yml')) ||
    (await fileExists(projectRoot, 'serverless.yaml'))
  ) {
    return 'serverless';
  }

  if (manifests['package.json']) {
    const pkg = manifests['package.json'];
    if (pkg.bin) return 'cli';
    if (pkg.main && !pkg.scripts?.start && !pkg.scripts?.dev) return 'library';

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const hasReact = 'react' in deps;
    const hasNext = 'next' in deps;
    const hasExpress = 'express' in deps;
    const hasFastify = 'fastify' in deps;

    if ((hasNext || hasReact) && (hasExpress || hasFastify)) return 'fullstack';
    if (hasNext) return 'fullstack';
    if (hasReact || 'vue' in deps || '@angular/core' in deps) return 'frontend';
    if (hasExpress || hasFastify || 'koa' in deps) return 'backend';
  }

  if (manifests['requirements.txt'] || manifests['pyproject.toml']) {
    const content = manifests['requirements.txt'] || manifests['pyproject.toml'];
    if (content.includes('fastapi') || content.includes('django') || content.includes('flask')) {
      return 'backend';
    }
  }

  return 'unknown';
}

/**
 * Detect frameworks from manifests.
 */
export async function detectFrameworks(manifests) {
  const frameworks = [];

  if (manifests['package.json']) {
    const pkg = manifests['package.json'];
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const frameworkMap = {
      next: { category: 'framework', name: 'nextjs' },
      react: { category: 'framework', name: 'react' },
      vue: { category: 'framework', name: 'vue' },
      '@angular/core': { category: 'framework', name: 'angular' },
      svelte: { category: 'framework', name: 'svelte' },
      express: { category: 'framework', name: 'express' },
      fastify: { category: 'framework', name: 'fastify' },
      '@mui/material': { category: 'ui-library', name: 'material-ui' },
      antd: { category: 'ui-library', name: 'ant-design' },
      '@chakra-ui/react': { category: 'ui-library', name: 'chakra-ui' },
      redux: { category: 'state-management', name: 'redux' },
      zustand: { category: 'state-management', name: 'zustand' },
      jotai: { category: 'state-management', name: 'jotai' },
      jest: { category: 'testing', name: 'jest' },
      vitest: { category: 'testing', name: 'vitest' },
      cypress: { category: 'testing', name: 'cypress' },
      '@playwright/test': { category: 'testing', name: 'playwright' },
      vite: { category: 'build-tool', name: 'vite' },
      webpack: { category: 'build-tool', name: 'webpack' },
      esbuild: { category: 'build-tool', name: 'esbuild' },
      prisma: { category: 'orm', name: 'prisma' },
      typeorm: { category: 'orm', name: 'typeorm' },
      mongoose: { category: 'orm', name: 'mongoose' },
      'next-auth': { category: 'auth', name: 'nextauth' },
      '@clerk/nextjs': { category: 'auth', name: 'clerk' },
    };

    for (const [depName, depVersion] of Object.entries(allDeps)) {
      if (frameworkMap[depName]) {
        const fw = frameworkMap[depName];
        frameworks.push({
          name: fw.name,
          version: depVersion.replace(/^\^|~/, ''),
          category: fw.category,
          confidence: 1.0,
          source: 'package.json',
        });
      }
    }
  }

  if (manifests['requirements.txt']) {
    const content = manifests['requirements.txt'];
    const pythonFrameworks = {
      fastapi: 'framework',
      django: 'framework',
      flask: 'framework',
      pytest: 'testing',
      sqlalchemy: 'orm',
    };

    for (const [name, category] of Object.entries(pythonFrameworks)) {
      if (content.includes(name)) {
        frameworks.push({
          name,
          category,
          confidence: 0.9,
          source: 'requirements.txt',
        });
      }
    }
  }

  return frameworks;
}

/**
 * Calculate technical debt score.
 */
export function calculateTechDebt(stats, dependencies, codeQuality, _patterns) {
  const indicators = [];
  let score = 0;

  const largeFiles = stats.largest_files.filter(f => f.lines > 1000);
  if (largeFiles.length > 0) {
    score += Math.min(largeFiles.length * 5, 30);
    indicators.push({
      category: 'complexity',
      severity: largeFiles.length > 5 ? 'high' : 'medium',
      description: `${largeFiles.length} files exceed 1000 lines`,
      remediation_effort: largeFiles.length > 10 ? 'major' : 'moderate',
    });
  }

  if (codeQuality.testing.test_files === 0) {
    score += 20;
    indicators.push({
      category: 'missing-tests',
      severity: 'high',
      description: 'No test files found',
      remediation_effort: 'major',
    });
  }

  if (!codeQuality.linting.configured) {
    score += 10;
    indicators.push({
      category: 'documentation',
      severity: 'medium',
      description: 'No linting configuration found',
      remediation_effort: 'minor',
    });
  }

  if (codeQuality.type_safety.typescript && !codeQuality.type_safety.strict_mode) {
    score += 5;
    indicators.push({
      category: 'documentation',
      severity: 'low',
      description: 'TypeScript strict mode not enabled',
      remediation_effort: 'minor',
    });
  }

  return {
    score: Math.min(score, 100),
    indicators,
  };
}

/**
 * Generate recommendations.
 */
export function generateRecommendations(projectType, techDebt, codeQuality) {
  const recommendations = [];

  const complexityIssues = techDebt.indicators.filter(i => i.category === 'complexity');
  if (complexityIssues.length > 0) {
    recommendations.push({
      priority: 'P1',
      category: 'maintainability',
      title: 'Refactor large files',
      description:
        'Break down files exceeding 1000 lines into smaller, focused modules following micro-service principles',
      effort: 'moderate',
      impact: 'high',
    });
  }

  if (codeQuality.testing.test_files === 0) {
    recommendations.push({
      priority: 'P1',
      category: 'quality',
      title: 'Establish test coverage baseline',
      description:
        'Introduce a test harness and prioritize coverage for critical workflows before further feature work.',
      effort: 'major',
      impact: 'high',
    });
  }

  if (projectType === 'unknown') {
    recommendations.push({
      priority: 'P2',
      category: 'architecture',
      title: 'Document project architecture',
      description:
        'Project type could not be inferred confidently. Add architecture and README docs for onboarding clarity.',
      effort: 'minor',
      impact: 'medium',
    });
  }

  return recommendations;
}
