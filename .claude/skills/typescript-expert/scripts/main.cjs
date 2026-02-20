#!/usr/bin/env node
/**
 * typescript-expert - Enterprise Bundle Script
 * TypeScript and JavaScript expert including type systems, patterns, and tooling
 */

'use strict';

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

// ── Help ──────────────────────────────────────────────────────────────────────
if (args.includes('--help')) {
  console.log(`
typescript-expert - TypeScript Expert Skill

Usage:
  node main.cjs --validate [file]   Check TS config strictness, detect any usage
  node main.cjs --analyze [dir]     Report TS version, strict flags, key compiler options
  node main.cjs --list              List consolidated skills
  node main.cjs --help              Show this help

Description:
  TypeScript and JavaScript expert covering:
    - Type systems: generics, mapped types, conditional types, template literals
    - Modern features: TS 5.0-5.8 (satisfies, const type params, NoInfer, erasableSyntaxOnly)
    - Strict mode validation and any-usage detection
    - Discriminated unions, type guards, and narrowing patterns
    - Monorepo / project references best practices
    - ESM/CJS interop guidance

Examples:
  node main.cjs --validate tsconfig.json
  node main.cjs --analyze src/
  node main.cjs --validate src/index.ts
`);
  process.exit(0);
}

// ── List ──────────────────────────────────────────────────────────────────────
if (args.includes('--list')) {
  console.log('Consolidated skills:');
  ['typescript-expert'].forEach(s => console.log('  - ' + s));
  process.exit(0);
}

// ── Validate ──────────────────────────────────────────────────────────────────
if (args.includes('--validate')) {
  const target = args[args.indexOf('--validate') + 1];
  const issues = [];
  const warnings = [];

  // Locate tsconfig.json
  const tsconfigPaths = [
    target && target.endsWith('.json') ? path.resolve(target) : null,
    path.join(PROJECT_ROOT, 'tsconfig.json'),
  ].filter(Boolean);

  let tsconfig = null;
  for (const p of tsconfigPaths) {
    if (fs.existsSync(p)) {
      try {
        tsconfig = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log(`Checking tsconfig: ${p}`);
        break;
      } catch {
        issues.push(`Cannot parse tsconfig at ${p}`);
      }
    }
  }

  if (!tsconfig) {
    issues.push('No tsconfig.json found. Run: tsc --init');
  } else {
    const opts = tsconfig.compilerOptions || {};
    if (!opts.strict) {
      issues.push('strict: true is not set — enables strictNullChecks, noImplicitAny, etc.');
    }
    if (!opts.strictNullChecks && !opts.strict) {
      issues.push('strictNullChecks is disabled — null/undefined may slip through');
    }
    if (!opts.noImplicitAny && !opts.strict) {
      issues.push('noImplicitAny is disabled — implicit any allowed');
    }
    if (!opts.exactOptionalPropertyTypes) {
      warnings.push(
        'exactOptionalPropertyTypes not set — optional props allow undefined implicitly'
      );
    }
    if (!opts.noUncheckedIndexedAccess) {
      warnings.push('noUncheckedIndexedAccess not set — array/index access not T | undefined');
    }
    if (!opts.noImplicitOverride) {
      warnings.push('noImplicitOverride not set — override keyword not enforced');
    }
  }

  // Scan for `any` usage in target ts/tsx files
  const scanDir =
    target && !target.endsWith('.json') ? path.resolve(target) : path.join(PROJECT_ROOT, 'src');
  let anyCount = 0;
  if (fs.existsSync(scanDir)) {
    const scanFile = filePath => {
      const ext = path.extname(filePath);
      if (ext !== '.ts' && ext !== '.tsx') return;
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(/:\s*any\b/g) || [];
      if (matches.length > 0) {
        warnings.push(`${filePath}: ${matches.length} use(s) of 'any'`);
        anyCount += matches.length;
      }
    };
    const walk = dir => {
      if (dir.includes('node_modules') || dir.includes('.git')) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else scanFile(full);
      }
    };
    const stat = fs.statSync(scanDir);
    if (stat.isDirectory()) walk(scanDir);
    else scanFile(scanDir);
  }

  // Report
  if (issues.length) {
    console.error('\n[ERRORS]');
    issues.forEach(i => console.error('  ✗ ' + i));
  }
  if (warnings.length) {
    console.warn('\n[WARNINGS]');
    warnings.forEach(w => console.warn('  ⚠ ' + w));
  }
  if (!issues.length && !warnings.length) {
    console.log('\n✓ TypeScript config looks strict and clean.');
  }
  console.log(
    `\nSummary: ${issues.length} error(s), ${warnings.length} warning(s), ${anyCount} any usage(s)`
  );
  process.exit(issues.length > 0 ? 1 : 0);
}

// ── Analyze ───────────────────────────────────────────────────────────────────
if (args.includes('--analyze')) {
  const _targetDir = args[args.indexOf('--analyze') + 1] || PROJECT_ROOT;

  // TS version from package.json
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  let tsVersion = 'unknown';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.typescript) tsVersion = deps.typescript;
    } catch {
      /* ignore */
    }
  }

  // Compiler options summary
  const tsconfigPath = path.join(PROJECT_ROOT, 'tsconfig.json');
  let opts = {};
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tc = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      opts = tc.compilerOptions || {};
    } catch {
      /* ignore */
    }
  }

  const strictFlags = [
    'strict',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictBindCallApply',
    'strictPropertyInitialization',
    'noImplicitAny',
    'noImplicitThis',
    'exactOptionalPropertyTypes',
    'noUncheckedIndexedAccess',
    'noImplicitOverride',
    'isolatedDeclarations',
    'erasableSyntaxOnly',
  ];

  console.log('\n=== TypeScript Expert Analysis ===');
  console.log(`TypeScript version: ${tsVersion}`);
  console.log(`\nStrict flags:`);
  strictFlags.forEach(flag => {
    const val = opts[flag];
    const status = val === true ? '✓' : val === false ? '✗' : '–';
    console.log(`  ${status} ${flag}: ${val !== undefined ? val : '(not set)'}`);
  });
  console.log(`\nKey compiler options:`);
  const keyOpts = [
    'target',
    'module',
    'moduleResolution',
    'lib',
    'outDir',
    'declaration',
    'sourceMap',
  ];
  keyOpts.forEach(k => {
    if (opts[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(opts[k])}`);
  });

  process.exit(0);
}

// ── Default ───────────────────────────────────────────────────────────────────
console.log('typescript-expert skill loaded. Use --help for usage.');
console.log('Tip: run with --validate to check tsconfig strictness, --analyze for full report.');
