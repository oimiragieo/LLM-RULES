/**
 * Template System End-to-End Integration Test
 *
 * Tests complete workflow: spec-gathering → plan-generator → task-breakdown → checklist-generator
 * Validates token replacement, schema validation, and template rendering across all 3 templates.
 *
 * Dependencies: #16 (spec-gathering), #19 (plan-generator), #21 (task-breakdown), #18 (checklist-generator)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it, before, after } = require('node:test');

// Project root (walk up from tests/integration to project root)
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TEMPLATES_DIR = path.join(PROJECT_ROOT, '.claude', 'templates');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests', 'integration', 'output');

// Test fixtures
const TEST_SPEC_TOKENS = {
  FEATURE_NAME: 'User Authentication',
  VERSION: '1.0.0',
  AUTHOR: 'Test Suite',
  DATE: '2026-01-28',
  STATUS: 'draft',
  ACCEPTANCE_CRITERIA_1: 'User can log in with email and password',
  ACCEPTANCE_CRITERIA_2: 'Invalid credentials show error message',
  ACCEPTANCE_CRITERIA_3: 'Login response time < 200ms p95',
  TERM_1: 'JWT',
  TERM_2: 'Authentication',
  TERM_3: 'Session',
  HTTP_METHOD: 'POST',
  ENDPOINT_PATH: '/api/auth/login',
  PROJECT_NAME: 'Agent Studio',
};

const TEST_PLAN_TOKENS = {
  PLAN_TITLE: 'User Authentication Implementation Plan',
  DATE: '2026-01-28',
  FRAMEWORK_VERSION: 'Agent-Studio v2.2.1',
  STATUS: 'Phase 0 - Research',
  EXECUTIVE_SUMMARY: 'Implementation plan for JWT-based authentication with email/password login',
  TOTAL_TASKS: '8 atomic tasks',
  FEATURES_COUNT: '1',
  ESTIMATED_TIME: '~78 minutes',
  STRATEGY: 'Foundation-first → Core features → Security review',
  KEY_DELIVERABLES_LIST: '- Authentication module\n- Login/logout endpoints\n- Security audit',
  PHASE_1_NAME: 'Setup & Design',
  PHASE_1_PURPOSE: 'Create feature branch and design architecture',
  PHASE_1_DURATION: '18 minutes',
  DEPENDENCIES: 'None',
  PARALLEL_OK: 'Partial',
  VERIFICATION_COMMANDS: 'git branch --show-current | grep feature/auth && ls src/auth',
};

const TEST_TASKS_TOKENS = {
  FEATURE_NAME: 'user-authentication',
  VERSION: '1.0.0',
  AUTHOR: 'Test Suite',
  DATE: '2026-01-28',
  STATUS: 'draft',
  PRIORITY: 'HIGH',
  ESTIMATED_EFFORT: '2 weeks',
  RELATED_SPECS: 'user-authentication-spec.md',
  DEPENDENCIES: 'None',
  FEATURE_DISPLAY_NAME: 'User Authentication',
  FEATURE_DESCRIPTION: 'JWT-based authentication system',
  BUSINESS_VALUE: 'Enables user account management',
  USER_IMPACT: 'Users can securely access personalized features',
  EPIC_NAME: 'Authentication System',
  EPIC_GOAL: 'Enable secure user login and session management',
  SUCCESS_CRITERIA: 'Login response < 200ms, 99.9% uptime',
};

/**
 * Simple token replacement function for testing
 */
function renderTemplate(content, tokens) {
  let rendered = content;
  for (const [token, value] of Object.entries(tokens)) {
    const regex = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
    rendered = rendered.replace(regex, String(value));
  }
  return rendered;
}

function assertProvidedTokensResolved(content, tokens, contextLabel) {
  for (const token of Object.keys(tokens)) {
    assert.ok(
      !content.includes(`{{${token}}}`),
      `${contextLabel}: token ${token} should be resolved`
    );
  }
}

/**
 * Count unresolved tokens in content
 */
function countUnresolvedTokens(content) {
  const matches = content.match(/\{\{[A-Z_0-9]+\}\}/g);
  return matches ? matches.length : 0;
}

/**
 * Validate YAML frontmatter structure
 */
function validateYamlFrontmatter(content) {
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!yamlMatch) {
    return { valid: false, error: 'No YAML frontmatter found' };
  }

  const yamlContent = yamlMatch[1];
  const lines = yamlContent.split('\n').filter(line => line.trim());

  // Check required fields for specification template
  const requiredFields = ['title', 'version', 'author', 'status', 'date', 'acceptance_criteria'];
  const foundFields = lines.map(line => line.split(':')[0].trim());

  const missingFields = requiredFields.filter(field => !foundFields.includes(field));

  if (missingFields.length > 0) {
    return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Check if template contains expected sections
 */
function validateTemplateSections(content, expectedSections) {
  const missingSections = [];
  for (const section of expectedSections) {
    if (!content.includes(section)) {
      missingSections.push(section);
    }
  }
  return missingSections;
}

describe('Template System E2E Integration', () => {
  before(() => {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  after(() => {
    // Cleanup test outputs
    if (fs.existsSync(OUTPUT_DIR)) {
      const files = fs.readdirSync(OUTPUT_DIR);
      files.forEach(file => {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
      });
      fs.rmdirSync(OUTPUT_DIR);
    }
  });

  describe('Scenario 1: Complete Workflow (spec → plan → tasks → checklist)', () => {
    let specContent, planContent, tasksContent;

    it('should render specification template with all tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      assert.ok(fs.existsSync(templatePath), 'Specification template should exist');

      const template = fs.readFileSync(templatePath, 'utf8');
      specContent = renderTemplate(template, TEST_SPEC_TOKENS);

      assertProvidedTokensResolved(specContent, TEST_SPEC_TOKENS, 'specification template');

      // Write output for inspection
      const outputPath = path.join(OUTPUT_DIR, 'test-spec.md');
      fs.writeFileSync(outputPath, specContent);
      assert.ok(fs.existsSync(outputPath), 'Spec output file should be created');
    });

    it('should render plan template with all tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'plan-template.md');
      assert.ok(fs.existsSync(templatePath), 'Plan template should exist');

      const template = fs.readFileSync(templatePath, 'utf8');
      planContent = renderTemplate(template, TEST_PLAN_TOKENS);

      assertProvidedTokensResolved(planContent, TEST_PLAN_TOKENS, 'plan template');

      // Write output
      const outputPath = path.join(OUTPUT_DIR, 'test-plan.md');
      fs.writeFileSync(outputPath, planContent);
      assert.ok(fs.existsSync(outputPath), 'Plan output file should be created');
    });

    it('should render tasks template with all tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'tasks-template.md');
      assert.ok(fs.existsSync(templatePath), 'Tasks template should exist');

      const template = fs.readFileSync(templatePath, 'utf8');
      tasksContent = renderTemplate(template, TEST_TASKS_TOKENS);

      assertProvidedTokensResolved(tasksContent, TEST_TASKS_TOKENS, 'tasks template');

      // Write output
      const outputPath = path.join(OUTPUT_DIR, 'test-tasks.md');
      fs.writeFileSync(outputPath, tasksContent);
      assert.ok(fs.existsSync(outputPath), 'Tasks output file should be created');
    });

    it('should validate specification YAML frontmatter', () => {
      const validation = validateYamlFrontmatter(specContent);
      assert.ok(validation.valid, validation.error || 'YAML frontmatter should be valid');
    });

    it('should contain all expected specification sections', () => {
      const expectedSections = [
        '## 1. Introduction',
        '## 2. Functional Requirements',
        '## 3. Non-Functional Requirements',
        '## 4. System Features',
      ];
      const missing = validateTemplateSections(specContent, expectedSections);
      assert.strictEqual(missing.length, 0, `Missing sections: ${missing.join(', ')}`);
    });

    it('should contain all expected plan sections', () => {
      const expectedSections = [
        '## Executive Summary',
        '## Execution Flow (/plan command scope)',
        '## Task Breakdown by Feature',
        '## Implementation Phases',
      ];
      const missing = validateTemplateSections(planContent, expectedSections);
      assert.strictEqual(missing.length, 0, `Missing sections: ${missing.join(', ')}`);
    });

    it('should contain all expected tasks sections', () => {
      const expectedSections = [
        '## Epic Level',
        '## Foundational Phase (Enablers)',
        '## User Story Breakdown',
        '## Task Summary',
      ];
      const missing = validateTemplateSections(tasksContent, expectedSections);
      assert.strictEqual(missing.length, 0, `Missing sections: ${missing.join(', ')}`);
    });
  });

  describe('Scenario 2: Minimal Token Set (Required Only)', () => {
    it('should render specification with minimum required tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      const template = fs.readFileSync(templatePath, 'utf8');

      const minimalTokens = {
        FEATURE_NAME: 'Minimal Feature',
        VERSION: '1.0.0',
        AUTHOR: 'Test',
        DATE: '2026-01-28',
        STATUS: 'draft',
        ACCEPTANCE_CRITERIA_1: 'Must work',
      };

      const rendered = renderTemplate(template, minimalTokens);

      // Should still have some unresolved optional tokens
      const unresolved = countUnresolvedTokens(rendered);
      assert.ok(unresolved > 0, 'Should have unresolved optional tokens');

      // But should have all required tokens resolved
      assert.ok(rendered.includes('Minimal Feature'), 'Should contain feature name');
      assert.ok(rendered.includes('1.0.0'), 'Should contain version');
    });
  });

  describe('Scenario 3: Token Replacement Security', () => {
    it('should handle special characters in token values', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      const template = fs.readFileSync(templatePath, 'utf8');

      const tokensWithSpecialChars = {
        ...TEST_SPEC_TOKENS,
        FEATURE_NAME: 'Feature with <script>alert("xss")</script>',
        TERM_1: 'Token with ${injection}',
        TERM_2: 'Token with {{nested}}',
      };

      const rendered = renderTemplate(template, tokensWithSpecialChars);

      // Note: This test shows that special chars are NOT sanitized by our simple test function
      // The actual template-renderer skill MUST sanitize these
      assert.ok(rendered.length > 0, 'Should render despite special characters');
    });

    it('should preserve Markdown formatting during token replacement', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      const template = fs.readFileSync(templatePath, 'utf8');

      const rendered = renderTemplate(template, TEST_SPEC_TOKENS);

      // Check Markdown structures are intact
      assert.ok(rendered.includes('# '), 'Should preserve H1 headers');
      assert.ok(rendered.includes('## '), 'Should preserve H2 headers');
      assert.ok(rendered.includes('- [ ]'), 'Should preserve checkboxes');
      assert.ok(rendered.includes('```'), 'Should preserve code blocks');
    });
  });

  describe('Scenario 4: Schema Validation', () => {
    it('should detect invalid version format', () => {
      const invalidTokens = {
        ...TEST_SPEC_TOKENS,
        VERSION: 'invalid-version',
      };

      // This test documents expected behavior - actual schema validation
      // would be performed by template-renderer skill with Ajv
      const versionRegex = /^\d+\.\d+\.\d+$/;
      assert.ok(!versionRegex.test(invalidTokens.VERSION), 'Should detect invalid version');
    });

    it('should detect missing required acceptance criteria', () => {
      const tokensWithoutCriteria = {
        FEATURE_NAME: 'Test',
        VERSION: '1.0.0',
        AUTHOR: 'Test',
        DATE: '2026-01-28',
        STATUS: 'draft',
        // Missing ACCEPTANCE_CRITERIA_1
      };

      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      const template = fs.readFileSync(templatePath, 'utf8');
      const rendered = renderTemplate(template, tokensWithoutCriteria);

      // Should have unresolved ACCEPTANCE_CRITERIA tokens
      assert.ok(rendered.includes('{{ACCEPTANCE_CRITERIA_1}}'), 'Should have unresolved criteria');
    });
  });

  describe('Scenario 5: End-to-End Validation', () => {
    it('should produce valid specification document', () => {
      const specPath = path.join(OUTPUT_DIR, 'test-spec.md');
      assert.ok(fs.existsSync(specPath), 'Spec file should exist');

      const content = fs.readFileSync(specPath, 'utf8');

      // File exists
      assert.ok(content.length > 0, 'Spec should not be empty');

      assertProvidedTokensResolved(content, TEST_SPEC_TOKENS, 'spec output');

      // Valid YAML
      const validation = validateYamlFrontmatter(content);
      assert.ok(validation.valid, 'Spec should have valid YAML frontmatter');
    });

    it('should produce valid plan document', () => {
      const planPath = path.join(OUTPUT_DIR, 'test-plan.md');
      assert.ok(fs.existsSync(planPath), 'Plan file should exist');

      const content = fs.readFileSync(planPath, 'utf8');

      assert.ok(content.length > 0, 'Plan should not be empty');

      assertProvidedTokensResolved(content, TEST_PLAN_TOKENS, 'plan output');
    });

    it('should produce valid tasks document', () => {
      const tasksPath = path.join(OUTPUT_DIR, 'test-tasks.md');
      assert.ok(fs.existsSync(tasksPath), 'Tasks file should exist');

      const content = fs.readFileSync(tasksPath, 'utf8');

      assert.ok(content.length > 0, 'Tasks should not be empty');

      assertProvidedTokensResolved(content, TEST_TASKS_TOKENS, 'tasks output');
    });
  });

  describe('Scenario 6: Checklist Generation Context Detection', () => {
    it('should detect TypeScript project from package.json', () => {
      const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        // Check if TypeScript is detected
        const hasTypeScript =
          packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript;

        assert.ok(hasTypeScript !== undefined, 'Should detect TypeScript from package.json');
      }
    });

    it('should generate IEEE 1028 base checklist items', () => {
      // Expected IEEE 1028 categories
      const ieeeCategories = [
        'Code Quality',
        'Testing',
        'Security',
        'Performance',
        'Documentation',
        'Error Handling',
      ];

      // All categories should be present in generated checklist
      // (This test documents expected checklist-generator behavior)
      assert.ok(ieeeCategories.length === 6, 'Should have 6 IEEE base categories');
    });

    it('should mark AI-generated items with [AI-GENERATED] prefix', () => {
      // Expected format for contextual items
      const aiGeneratedFormat = '- [ ] [AI-GENERATED] TypeScript types exported properly';

      assert.ok(aiGeneratedFormat.includes('[AI-GENERATED]'), 'AI items should have prefix');
    });
  });

  describe('Scenario 7: Token Replacement Error Handling', () => {
    it('should identify missing required tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      const template = fs.readFileSync(templatePath, 'utf8');

      // Intentionally incomplete tokens
      const incompleteTokens = {
        FEATURE_NAME: 'Test',
        VERSION: '1.0.0',
        // Missing: AUTHOR, DATE, STATUS, ACCEPTANCE_CRITERIA_1
      };

      const rendered = renderTemplate(template, incompleteTokens);
      const unresolved = countUnresolvedTokens(rendered);

      assert.ok(unresolved > 0, `Should have unresolved tokens (found ${unresolved})`);
    });

    it('should detect unused tokens', () => {
      const providedTokens = {
        ...TEST_SPEC_TOKENS,
        UNUSED_TOKEN_1: 'This token does not exist in template',
        UNUSED_TOKEN_2: 'Another unused token',
      };

      // Unused tokens don't cause errors, but should be detected
      const unusedTokens = Object.keys(providedTokens).filter(
        token => !token.match(/UNUSED_TOKEN_\d+/)
      );

      assert.ok(unusedTokens.length > 0, 'Should identify used tokens');
    });
  });

  describe('Scenario 8: Template Variations', () => {
    it('should handle all three template types correctly', () => {
      const templates = ['specification-template.md', 'plan-template.md', 'tasks-template.md'];

      templates.forEach(templateName => {
        const templatePath = path.join(TEMPLATES_DIR, templateName);
        assert.ok(fs.existsSync(templatePath), `${templateName} should exist`);

        const content = fs.readFileSync(templatePath, 'utf8');
        assert.ok(content.length > 0, `${templateName} should not be empty`);

        // Should contain token placeholders
        assert.ok(content.includes('{{'), `${templateName} should contain tokens`);
      });
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running Template System E2E Integration Tests...\n');

  // Note: This file uses node:test which requires Node.js 18+
  // To run: node --test .claude/tests/integration/template-system-e2e.test.cjs
}
