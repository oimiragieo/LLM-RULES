const fs = require('fs');
const path = require('path');

if (require.main === module) {
  const tests = [
    'should have security-design-checklist.md template',
    'should include STRIDE threat model categories',
    'should have "What could go wrong?" prompts',
    'should reference OWASP resources',
    'should have concrete security questions',
  ];

  console.log('Running Security Design Checklist Tests...\n');

  let passed = 0;
  let failed = 0;

  const checklistPath = path.join(__dirname, 'security-design-checklist.md');

  // Test 1: File exists
  if (!fs.existsSync(checklistPath)) {
    console.log(`✗ ${tests[0]}`);
    console.log(`  Error: Checklist not found at ${checklistPath}`);
    failed++;
  } else {
    console.log(`✓ ${tests[0]}`);
    passed++;
  }

  if (fs.existsSync(checklistPath)) {
    try {
      const content = fs.readFileSync(checklistPath, 'utf8');

      // Test 2: STRIDE categories
      const hasStride =
        content.includes('Spoofing') &&
        content.includes('Tampering') &&
        content.includes('Repudiation') &&
        content.includes('Information Disclosure') &&
        content.includes('Denial of Service') &&
        content.includes('Elevation of Privilege');

      if (hasStride) {
        console.log(`✓ ${tests[1]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[1]}`);
        console.log('  Error: Missing STRIDE threat model categories');
        failed++;
      }

      // Test 3: "What could go wrong?" prompts
      const hasPrompts = content.toLowerCase().includes('what could go wrong');

      if (hasPrompts) {
        console.log(`✓ ${tests[2]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[2]}`);
        console.log('  Error: Missing "What could go wrong?" security prompts');
        failed++;
      }

      // Test 4: OWASP references
      const hasOWASP = content.includes('OWASP');

      if (hasOWASP) {
        console.log(`✓ ${tests[3]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[3]}`);
        console.log('  Error: Missing OWASP references');
        failed++;
      }

      // Test 5: Security questions (at least 10)
      const questionCount = (content.match(/\?/g) || []).length;

      if (questionCount >= 10) {
        console.log(`✓ ${tests[4]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[4]}`);
        console.log(`  Error: Only ${questionCount} questions found, need at least 10`);
        failed++;
      }
    } catch (error) {
      console.error('Error reading checklist:', error.message);
      // Mark remaining tests as failed
      for (let i = passed + failed; i < tests.length; i++) {
        console.log(`✗ ${tests[i]}`);
        failed++;
      }
    }
  } else {
    // Mark remaining tests as failed
    for (let i = 1; i < tests.length; i++) {
      console.log(`✗ ${tests[i]}`);
      failed++;
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {};
