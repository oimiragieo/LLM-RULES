#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { pathToFileURL } from 'url';

export function walkTests(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTests(full));
      continue;
    }
    if (name.endsWith('.test.cjs') || name.endsWith('.test.mjs')) {
      files.push(full);
    }
  }
  return files;
}

export function normalizeTestPath(filePath, baseDir = process.cwd()) {
  const relToBase = relative(baseDir, filePath);
  const normalized = relToBase.split(sep).join('/');
  return normalized.replace(/^tests\//, '');
}

export function formatPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

export function runCountAllTests(baseDir = process.cwd()) {
  const testsDir = join(baseDir, 'tests');
  const testFiles = walkTests(testsDir);

  let totalTests = 0;
  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;
  const failedFiles = [];

  const results = [];

  for (const file of testFiles) {
    try {
      const result = spawnSync(process.execPath, ['--test', file], {
        encoding: 'utf-8',
        shell: false,
      });
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      const testsMatch = output.match(/# tests (\d+)/);
      const passMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);
      const skipMatch = output.match(/# skip(?:ped)? (\d+)/);

      const tests = testsMatch ? parseInt(testsMatch[1], 10) : 0;
      const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
      const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
      const skip = skipMatch ? parseInt(skipMatch[1], 10) : 0;

      totalTests += tests;
      totalPass += pass;
      totalFail += fail;
      totalSkip += skip;

      if (result.status !== 0) {
        console.error(`Error running ${file}: exit ${result.status}`);
        failedFiles.push(normalizeTestPath(file, baseDir));
      }

      results.push({
        file: normalizeTestPath(file, baseDir),
        tests,
        pass,
        fail,
        skip,
        passRate: formatPercent(pass, tests),
        error: result.status !== 0,
      });
    } catch (error) {
      console.error(`Error running ${file}:`, error.message);
      failedFiles.push(normalizeTestPath(file, baseDir));
      results.push({
        file: normalizeTestPath(file, baseDir),
        tests: 0,
        pass: 0,
        fail: 0,
        skip: 0,
        passRate: '0.0',
        error: true,
      });
    }
  }

  return { testFiles, results, totals: { totalTests, totalPass, totalFail, totalSkip }, failedFiles };
}

export function printSummary(runResult) {
  const { testFiles, results, totals, failedFiles } = runResult;
  const { totalTests, totalPass, totalFail, totalSkip } = totals;
  console.log('# Test Suite Summary\n');
  console.log('| Test File | Tests | Pass | Fail | Skip | Pass Rate |');
  console.log('|-----------|-------|------|------|------|-----------|');

  results
    .sort((a, b) => a.file.localeCompare(b.file))
    .forEach(r => {
      const icon = r.error ? '💥' : r.fail > 0 ? '❌' : r.tests === r.pass ? '✅' : '⚠️';
      console.log(
        `| ${icon} ${r.file.padEnd(45)} | ${r.tests.toString().padStart(5)} | ${r.pass.toString().padStart(4)} | ${r.fail.toString().padStart(4)} | ${r.skip.toString().padStart(4)} | ${r.passRate}% |`
      );
    });

  console.log('|-----------|-------|------|------|------|-----------|');
  console.log(
    `| **TOTAL** | **${totalTests}** | **${totalPass}** | **${totalFail}** | **${totalSkip}** | **${formatPercent(totalPass, totalTests)}%** |`
  );

  console.log(`\n## Summary Stats\n`);
  console.log(`- Total test files: ${testFiles.length}`);
  console.log(`- Failed to load/run: ${failedFiles.length}`);
  if (failedFiles.length > 0) {
    console.log(`  - Failed files: ${failedFiles.join(', ')}`);
  }
  console.log(`- Total tests: ${totalTests}`);
  console.log(`- Passing: ${totalPass} (${formatPercent(totalPass, totalTests)}%)`);
  console.log(`- Failing: ${totalFail} (${formatPercent(totalFail, totalTests)}%)`);
  console.log(`- Skipped: ${totalSkip} (${formatPercent(totalSkip, totalTests)}%)`);
  console.log(`- Target: 95%+ pass rate`);
  console.log(
    `- Status: ${totalTests > 0 && (totalPass / totalTests) * 100 >= 95 ? '✅ TARGET MET' : `⚠️ NEEDS ${totalTests > 0 ? Math.ceil(totalTests * 0.95 - totalPass) : 'N/A'} MORE PASSING`}`
  );
}

export function isDirectRun(mainArg = process.argv[1], moduleUrl = import.meta.url) {
  if (!mainArg) return false;
  return moduleUrl === pathToFileURL(resolve(mainArg)).href;
}

if (isDirectRun()) {
  const runResult = runCountAllTests();
  printSummary(runResult);
}
