/**
 * Validation tests for specification-template.schema.json
 *
 * Tests both valid and invalid specification templates to ensure
 * schema correctly validates YAML frontmatter structure.
 */

const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

// Initialize Ajv (skip meta schema validation for compatibility)
const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });

// Load schema
const schemaPath = path.join(__dirname, 'specification-template.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

// Test counter
let passed = 0;
let failed = 0;

function runTest(testName, data, shouldPass) {
  const valid = validate(data);
  const result = shouldPass ? valid : !valid;

  if (result) {
    console.log(`✓ ${testName}`);
    passed++;
  } else {
    console.log(`✗ ${testName}`);
    console.log(`  Expected: ${shouldPass ? 'valid' : 'invalid'}`);
    console.log(`  Got: ${valid ? 'valid' : 'invalid'}`);
    if (validate.errors) {
      console.log('  Errors:', JSON.stringify(validate.errors, null, 2));
    }
    failed++;
  }
}

console.log('Running Specification Template Schema Tests...\n');

// Test 1: Valid minimal specification
runTest(
  'Valid minimal specification',
  {
    title: 'User Authentication',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['User can log in'],
  },
  true
);

// Test 2: Valid specification with all optional fields
runTest(
  'Valid specification with all fields',
  {
    title: 'User Authentication System',
    version: '2.1.3',
    author: 'Engineering Team',
    status: 'approved',
    date: '2026-01-28',
    acceptance_criteria: [
      'User can log in with email and password',
      'Password must meet complexity requirements',
      'Failed login attempts are logged',
    ],
    description: 'Comprehensive authentication system with OAuth2 support',
    tags: ['authentication', 'security', 'backend'],
    priority: 'high',
    estimated_effort: '2 weeks',
    stakeholders: ['Product Manager', 'Engineering Team'],
    dependencies: ['User database schema'],
    related_specifications: ['security-requirements.md'],
  },
  true
);

// Test 3: Valid with token replacement fields
runTest(
  'Valid with token replacement',
  {
    title: '{{FEATURE_NAME}} Specification',
    version: '1.0.0',
    author: '{{AUTHOR}}',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Feature is implemented'],
    tokens: {
      PROJECT_NAME: 'MyApp',
      AUTHOR: 'Claude',
      DATE: '2026-01-28',
      VERSION: '1.0.0',
      FEATURE_NAME: 'Authentication',
    },
  },
  true
);

// Test 4: Invalid - missing required field (title)
runTest(
  'Invalid - missing title',
  {
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
  },
  false
);

// Test 5: Invalid - title too short
runTest(
  'Invalid - title too short',
  {
    title: 'Short',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
  },
  false
);

// Test 6: Invalid - version not semver
runTest(
  'Invalid - bad version format',
  {
    title: 'Valid Title Here',
    version: '1.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
  },
  false
);

// Test 7: Invalid - status not in enum
runTest(
  'Invalid - bad status value',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'in-progress',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
  },
  false
);

// Test 8: Invalid - date format wrong
runTest(
  'Invalid - bad date format',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '01/28/2026',
    acceptance_criteria: ['Criteria'],
  },
  false
);

// Test 9: Invalid - acceptance_criteria empty
runTest(
  'Invalid - empty acceptance criteria',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: [],
  },
  false
);

// Test 10: Invalid - acceptance_criteria too many items
runTest(
  'Invalid - too many acceptance criteria',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: new Array(51).fill('Criteria item'),
  },
  false
);

// Test 11: Invalid - priority not in enum
runTest(
  'Invalid - bad priority value',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
    priority: 'urgent',
  },
  false
);

// Test 12: Invalid - estimated_effort wrong format
runTest(
  'Invalid - bad effort format',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
    estimated_effort: 'about 2 weeks',
  },
  false
);

// Test 13: Invalid - tags not kebab-case
runTest(
  'Invalid - bad tag format',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
    tags: ['Valid-Tag', 'Invalid Tag'],
  },
  false
);

// Test 14: Invalid - additional properties not allowed
runTest(
  'Invalid - extra property',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
    extraField: 'not allowed',
  },
  false
);

// Test 15: Invalid - token not in whitelist
runTest(
  'Invalid - non-whitelisted token',
  {
    title: 'Valid Title Here',
    version: '1.0.0',
    author: 'Claude',
    status: 'draft',
    date: '2026-01-28',
    acceptance_criteria: ['Criteria'],
    tokens: {
      PROJECT_NAME: 'MyApp',
      MALICIOUS_TOKEN: 'hack',
    },
  },
  false
);

// Test 16: Valid - all status values
const statuses = ['draft', 'review', 'approved', 'deprecated'];
statuses.forEach(status => {
  runTest(
    `Valid - status=${status}`,
    {
      title: 'Valid Title Here',
      version: '1.0.0',
      author: 'Claude',
      status: status,
      date: '2026-01-28',
      acceptance_criteria: ['Valid acceptance criteria here'],
    },
    true
  );
});

// Test 17: Valid - all priority values
const priorities = ['low', 'medium', 'high', 'critical'];
priorities.forEach(priority => {
  runTest(
    `Valid - priority=${priority}`,
    {
      title: 'Valid Title Here',
      version: '1.0.0',
      author: 'Claude',
      status: 'draft',
      date: '2026-01-28',
      acceptance_criteria: ['Valid acceptance criteria here'],
      priority: priority,
    },
    true
  );
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests Passed: ${passed}`);
console.log(`Tests Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
}
