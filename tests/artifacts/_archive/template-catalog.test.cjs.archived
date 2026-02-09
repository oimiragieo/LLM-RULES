const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

if (require.main === module) {
  const tests = [
    'should have template catalog file',
    'should list all 4 core templates (spec, plan, tasks, ADR)',
    'should have valid YAML frontmatter',
    'should have usage tracking metadata for each template',
    'should have discovery keywords for each template',
    'should have last_used dates in YYYY-MM-DD format',
  ];

  console.log('Running Template Catalog Tests...\n');

  let passed = 0;
  let failed = 0;

  const catalogPath = path.join(
    __dirname,
    '../../.claude/context/artifacts/catalogs/template-catalog.md'
  );

  // Test 1: Catalog file exists
  if (!fs.existsSync(catalogPath)) {
    console.log(`✗ ${tests[0]}`);
    console.log(`  Error: Catalog file not found at ${catalogPath}`);
    failed++;
  } else {
    console.log(`✓ ${tests[0]}`);
    passed++;
  }

  if (fs.existsSync(catalogPath)) {
    try {
      const content = fs.readFileSync(catalogPath, 'utf8');

      // Test 2: All 4 templates listed
      const hasSpec = content.includes('specification-template');
      const hasPlan = content.includes('plan-template');
      const hasTasks = content.includes('tasks-template');
      const hasADR = content.includes('adr-template');

      if (hasSpec && hasPlan && hasTasks && hasADR) {
        console.log(`✓ ${tests[1]}`);
        passed++;
      } else {
        console.log(`✗ ${tests[1]}`);
        console.log(
          `  Missing: ${!hasSpec ? 'spec ' : ''}${!hasPlan ? 'plan ' : ''}${!hasTasks ? 'tasks ' : ''}${!hasADR ? 'ADR' : ''}`
        );
        failed++;
      }

      // Test 3: Valid YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        try {
          const frontmatter = yaml.load(frontmatterMatch[1]);
          console.log(`✓ ${tests[2]}`);
          passed++;

          // Test 4: Usage tracking metadata
          if (frontmatter.templates && Array.isArray(frontmatter.templates)) {
            const hasUsageTracking = frontmatter.templates.every(
              t => Object.hasOwn(t, 'created_count') && Object.hasOwn(t, 'last_used')
            );

            if (hasUsageTracking) {
              console.log(`✓ ${tests[3]}`);
              passed++;
            } else {
              console.log(`✗ ${tests[3]}`);
              console.log(
                '  Error: Some templates missing usage tracking (created_count, last_used)'
              );
              failed++;
            }

            // Test 5: Discovery keywords
            const hasKeywords = frontmatter.templates.every(
              t =>
                Object.hasOwn(t, 'keywords') && Array.isArray(t.keywords) && t.keywords.length > 0
            );

            if (hasKeywords) {
              console.log(`✓ ${tests[4]}`);
              passed++;
            } else {
              console.log(`✗ ${tests[4]}`);
              console.log('  Error: Template validation failed');
              failed++;
            }

            // Test 6: Date format validation
            const datePattern = /^\d{4}-\d{2}-\d{2}$/;
            const validDates = frontmatter.templates.every(
              t => !t.last_used || datePattern.test(t.last_used)
            );

            if (validDates) {
              console.log(`✓ ${tests[5]}`);
              passed++;
            } else {
              console.log(`✗ ${tests[5]}`);
              console.log('  Error: Some last_used dates not in YYYY-MM-DD format');
              failed++;
            }
          } else {
            console.log(`✗ ${tests[3]}`);
            console.log('  Error: No templates array in frontmatter');
            failed++;
            console.log(`✗ ${tests[4]}`);
            failed++;
            console.log(`✗ ${tests[5]}`);
            failed++;
          }
        } catch (yamlError) {
          console.log(`✗ ${tests[2]}`);
          console.log('  Error: Invalid YAML frontmatter:', yamlError.message);
          failed++;
          // Skip dependent tests
          console.log(`✗ ${tests[3]}`);
          failed++;
          console.log(`✗ ${tests[4]}`);
          failed++;
          console.log(`✗ ${tests[5]}`);
          failed++;
        }
      } else {
        console.log(`✗ ${tests[2]}`);
        console.log('  Error: No YAML frontmatter found');
        failed++;
        // Skip dependent tests
        console.log(`✗ ${tests[3]}`);
        failed++;
        console.log(`✗ ${tests[4]}`);
        failed++;
        console.log(`✗ ${tests[5]}`);
        failed++;
      }
    } catch (error) {
      console.error('Error reading catalog:', error.message);
      // Mark remaining tests as failed
      for (let i = passed + failed; i < tests.length; i++) {
        console.log(`✗ ${tests[i]}`);
        failed++;
      }
    }
  } else {
    // Mark remaining tests as failed if catalog doesn't exist
    for (let i = 1; i < tests.length; i++) {
      console.log(`✗ ${tests[i]}`);
      failed++;
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {};
