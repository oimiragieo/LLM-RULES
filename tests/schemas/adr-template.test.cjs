const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

// Run tests
if (require.main === module) {
  const tests = [
    'should validate a complete ADR frontmatter',
    'should reject ADR with missing required fields',
    'should reject ADR with invalid status enum',
    'should reject ADR with invalid date format',
    'should accept ADR with optional alternatives field',
    'should validate ADR number format',
  ];

  console.log('Running ADR Template Schema Tests...\n');

  let passed = 0;
  let failed = 0;

  // Load schema
  const schemaPath = path.join(__dirname, 'adr-template.schema.json');

  if (!fs.existsSync(schemaPath)) {
    console.error(`✗ Schema file not found: ${schemaPath}`);
    console.log('\n0 passing, 6 failing');
    process.exit(1);
  }

  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });

    // Test 1: Valid ADR
    {
      const validADR = {
        adr_number: 'ADR-050',
        title: 'Example Architecture Decision',
        date: '2026-01-28',
        status: 'accepted',
        context: 'We need to decide how to handle distributed caching.',
        decision: 'Use Redis for distributed caching with consistent hashing.',
        consequences: 'Improved performance but adds operational complexity.',
        alternatives: 'Memcached was considered but lacks persistence.',
      };

      const validate = ajv.compile(schema);
      const valid = validate(validADR);

      if (valid) {
        console.log(`✓ ${tests[0]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[0]}`);
        console.log('  Errors:', validate.errors);
        failed++;
      }
    }

    // Test 2: Missing required fields
    {
      const invalidADR = {
        adr_number: 'ADR-051',
        title: 'Incomplete ADR',
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidADR);

      if (!valid && validate.errors.some(e => e.keyword === 'required')) {
        console.log(`✓ ${tests[1]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[1]}`);
        failed++;
      }
    }

    // Test 3: Invalid status
    {
      const invalidADR = {
        adr_number: 'ADR-052',
        title: 'Invalid Status ADR',
        date: '2026-01-28',
        status: 'invalid-status',
        context: 'Context here',
        decision: 'Decision here',
        consequences: 'Consequences here',
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidADR);

      if (!valid) {
        console.log(`✓ ${tests[2]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[2]}`);
        failed++;
      }
    }

    // Test 4: Invalid date format
    {
      const invalidADR = {
        adr_number: 'ADR-053',
        title: 'Invalid Date ADR',
        date: '01/28/2026',
        status: 'proposed',
        context: 'Context here',
        decision: 'Decision here',
        consequences: 'Consequences here',
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidADR);

      if (!valid) {
        console.log(`✓ ${tests[3]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[3]}`);
        failed++;
      }
    }

    // Test 5: Valid with alternatives
    {
      const validADR = {
        adr_number: 'ADR-054',
        title: 'ADR with Alternatives',
        date: '2026-01-28',
        status: 'accepted',
        context: 'Context here',
        decision: 'Decision here',
        consequences: 'Consequences here',
        alternatives: 'Alternative options considered',
      };

      const validate = ajv.compile(schema);
      const valid = validate(validADR);

      if (valid) {
        console.log(`✓ ${tests[4]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[4]}`);
        console.log('  Errors:', validate.errors);
        failed++;
      }
    }

    // Test 6: Invalid ADR number format
    {
      const invalidADR = {
        adr_number: 'INVALID',
        title: 'Invalid Number Format',
        date: '2026-01-28',
        status: 'proposed',
        context: 'Context here',
        decision: 'Decision here',
        consequences: 'Consequences here',
      };

      const validate = ajv.compile(schema);
      const valid = validate(invalidADR);

      if (!valid) {
        console.log(`✓ ${tests[5]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[5]}`);
        failed++;
      }
    }

    console.log(`\n${passed} passing, ${failed} failing`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test execution error:', error.message);
    console.log('\n0 passing, 6 failing');
    process.exit(1);
  }
}

module.exports = {
  /* test helpers if needed */
};
