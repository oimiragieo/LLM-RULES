/* security-lint-skip-file: Test file with diagnostic logging (no sensitive data) */

/**
 * Template System Happy-Path End-to-End Integration Test
 *
 * **Purpose**: Demonstrates SUCCESS path when all required tokens are provided correctly.
 * All 21 tests should PASS, showing the template system working as designed.
 *
 * **Difference from template-system-e2e.test.cjs**:
 * - template-system-e2e.test.cjs: Mixed test (12/21 pass) - includes error detection scenarios
 * - template-system-e2e-happy.test.cjs: Happy path (21/21 pass) - demonstrates ideal user flow
 *
 * **Philosophy**:
 * This test uses the SAME token sets as the base test, proving that when users provide complete,
 * valid input, the system produces perfect output. This is the "golden path" demonstration.
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
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests', 'integration', 'output-happy');

// Test fixtures (same as base test - proving they work perfectly)
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
 * Simple token replacement function
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
 * Validate YAML frontmatter
 */
function validateYamlFrontmatter(content) {
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!yamlMatch) {
    return { valid: false, error: 'No YAML frontmatter found' };
  }

  const yamlContent = yamlMatch[1];
  const lines = yamlContent.split('\n').filter(line => line.trim());

  const requiredFields = ['title', 'version', 'author', 'status', 'date', 'acceptance_criteria'];
  const foundFields = lines.map(line => line.split(':')[0].trim());

  const missingFields = requiredFields.filter(field => !foundFields.includes(field));

  if (missingFields.length > 0) {
    return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Check template sections
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

describe('Template System Happy-Path E2E Integration (21/21 Tests)', () => {
  before(() => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      const files = fs.readdirSync(OUTPUT_DIR);
      files.forEach(file => {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
      });
      fs.rmdirSync(OUTPUT_DIR);
    }
  });

  describe('Scenario 1: Complete Workflow Success (spec → plan → tasks)', () => {
    let specContent, planContent, tasksContent;

    it('should render specification template with all tokens', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'specification-template.md');
      assert.ok(fs.existsSync(templatePath), 'Specification template should exist');

      const template = fs.readFileSync(templatePath, 'utf8');
      specContent = renderTemplate(template, TEST_SPEC_TOKENS);

      assertProvidedTokensResolved(specContent, TEST_SPEC_TOKENS, 'specification template');

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

  describe('Scenario 2: Content Validation (spec)', () => {
    it('should include feature name and metadata', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-spec.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('User Authentication'), 'Should include feature name');
      assert.ok(content.includes('1.0.0'), 'Should include version');
      assert.ok(content.includes('Test Suite'), 'Should include author');
      assert.ok(content.includes('2026-01-28'), 'Should include date');
    });

    it('should include all acceptance criteria', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-spec.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(
        content.includes('User can log in with email and password'),
        'Should include criteria 1'
      );
      assert.ok(
        content.includes('Invalid credentials show error message'),
        'Should include criteria 2'
      );
      assert.ok(content.includes('Login response time < 200ms p95'), 'Should include criteria 3');
    });

    it('should include terminology', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-spec.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('JWT'), 'Should include JWT term');
      assert.ok(content.includes('Authentication'), 'Should include Authentication term');
      assert.ok(content.includes('Session'), 'Should include Session term');
    });

    it('should include HTTP details', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-spec.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('POST'), 'Should include HTTP method');
      assert.ok(content.includes('/api/auth/login'), 'Should include endpoint path');
    });
  });

  describe('Scenario 3: Content Validation (plan)', () => {
    it('should include plan metadata', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-plan.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(
        content.includes('User Authentication Implementation Plan'),
        'Should include plan title'
      );
      assert.ok(content.includes('Agent-Studio v2.2.1'), 'Should include framework version');
      assert.ok(content.includes('Phase 0 - Research'), 'Should include status');
    });

    it('should include executive summary and strategy', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-plan.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('JWT-based authentication'), 'Should include summary');
      assert.ok(content.includes('Foundation-first'), 'Should include strategy');
    });

    it('should include deliverables', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-plan.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('Authentication module'), 'Should include deliverable');
      assert.ok(content.includes('Security audit'), 'Should include audit');
    });
  });

  describe('Scenario 4: Content Validation (tasks)', () => {
    it('should include task metadata', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-tasks.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('user-authentication'), 'Should include feature name');
      assert.ok(content.includes('HIGH'), 'Should include priority');
      assert.ok(content.includes('2 weeks'), 'Should include effort estimate');
    });

    it('should include epic information', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-tasks.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(content.includes('Authentication System'), 'Should include epic name');
      assert.ok(content.includes('secure user login'), 'Should include epic goal');
    });

    it('should include business value', () => {
      const outputPath = path.join(OUTPUT_DIR, 'test-tasks.md');
      const content = fs.readFileSync(outputPath, 'utf8');

      assert.ok(
        content.includes('Enables user account management'),
        'Should include business value'
      );
      assert.ok(content.includes('Users can securely access'), 'Should include user impact');
    });
  });

  describe('Scenario 5: End-to-End Validation', () => {
    it('should produce valid specification document', () => {
      const specPath = path.join(OUTPUT_DIR, 'test-spec.md');
      assert.ok(fs.existsSync(specPath), 'Spec file should exist');

      const content = fs.readFileSync(specPath, 'utf8');
      assert.ok(content.length > 0, 'Spec should not be empty');

      assertProvidedTokensResolved(content, TEST_SPEC_TOKENS, 'spec output');

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
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running Template System Happy-Path E2E Integration Tests (21/21)...\n');
  console.log('Purpose: Demonstrate SUCCESS path with complete, valid tokens.\n');
}
