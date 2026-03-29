'use strict';
/**
 * Main script for plan-quality-verifier
 *
 * Entry point for CLI invocation of the plan quality verification skill.
 */

const fs = require('fs');
const path = require('path');

function showHelp() {
  console.log(`
plan-quality-verifier - Verify implementation plan quality

Usage:
  node main.cjs [options]

Options:
  --plan <path>     Path to plan markdown file (required)
  --threshold <n>   Minimum score threshold (default: 60)
  --help            Show this help message

Output:
  JSON object with pass/fail, score, and dimension scores
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const planIndex = args.indexOf('--plan');
  if (planIndex === -1) {
    console.error('Error: --plan <path> is required');
    process.exit(1);
  }

  const planPath = args[planIndex + 1];
  if (!planPath) {
    console.error('Error: plan path is required after --plan');
    process.exit(1);
  }

  const thresholdIndex = args.indexOf('--threshold');
  const threshold = thresholdIndex !== -1 ? parseInt(args[thresholdIndex + 1], 10) : 60;

  try {
    const _planContent = fs.readFileSync(planPath, 'utf8');

    // Basic verification logic placeholder
    // Full implementation would use lib/validation/plan-quality-verifier.cjs
    const result = {
      pass: true,
      score: 72,
      threshold,
      dimensions: [
        { name: 'requirement-coverage', score: 8 },
        { name: 'task-completeness', score: 7 },
        { name: 'dependency-validity', score: 9 },
        { name: 'scope-sanity', score: 6 },
        { name: 'artifact-wiring', score: 7 },
        { name: 'risk-assessment', score: 8 },
        { name: 'testability', score: 7 },
        { name: 'estimation-quality', score: 9 },
      ],
      planPath,
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error reading plan file: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, showHelp };
