#!/usr/bin/env node
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const testFiles = readdirSync('tests')
  .filter(f => f.endsWith('.test.cjs') || f.endsWith('.test.mjs'))
  .map(f => join('tests', f));

let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

const results = [];

for (const file of testFiles) {
  try {
    const output = execSync(`node --test "${file}" 2>&1`, { encoding: 'utf-8' });
    const testsMatch = output.match(/# tests (\d+)/);
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    const skipMatch = output.match(/# skip(?:ped)? (\d+)/);

    const tests = testsMatch ? parseInt(testsMatch[1]) : 0;
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : 0;
    const skip = skipMatch ? parseInt(skipMatch[1]) : 0;

    totalTests += tests;
    totalPass += pass;
    totalFail += fail;
    totalSkip += skip;

    results.push({
      file: file.replace(/^tests[\\/]/, ''),
      tests,
      pass,
      fail,
      skip,
      passRate: tests > 0 ? ((pass / tests) * 100).toFixed(1) : '0.0',
    });
  } catch (error) {
    console.error(`Error running ${file}:`, error.message);
  }
}

console.log('# Test Suite Summary\n');
console.log('| Test File | Tests | Pass | Fail | Skip | Pass Rate |');
console.log('|-----------|-------|------|------|------|-----------|');

results
  .sort((a, b) => a.file.localeCompare(b.file))
  .forEach(r => {
    const icon = r.fail > 0 ? '❌' : r.tests === r.pass ? '✅' : '⚠️';
    console.log(
      `| ${icon} ${r.file.padEnd(45)} | ${r.tests.toString().padStart(5)} | ${r.pass.toString().padStart(4)} | ${r.fail.toString().padStart(4)} | ${r.skip.toString().padStart(4)} | ${r.passRate}% |`
    );
  });

console.log('|-----------|-------|------|------|------|-----------|');
console.log(
  `| **TOTAL** | **${totalTests}** | **${totalPass}** | **${totalFail}** | **${totalSkip}** | **${((totalPass / totalTests) * 100).toFixed(1)}%** |`
);

console.log(`\n## Summary Stats\n`);
console.log(`- Total tests: ${totalTests}`);
console.log(`- Passing: ${totalPass} (${((totalPass / totalTests) * 100).toFixed(1)}%)`);
console.log(`- Failing: ${totalFail} (${((totalFail / totalTests) * 100).toFixed(1)}%)`);
console.log(`- Skipped: ${totalSkip} (${((totalSkip / totalTests) * 100).toFixed(1)}%)`);
console.log(`- Target: 95%+ pass rate`);
console.log(
  `- Status: ${(totalPass / totalTests) * 100 >= 95 ? '✅ TARGET MET' : `⚠️ NEEDS ${Math.ceil(totalTests * 0.95 - totalPass)} MORE PASSING`}`
);
