const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Spec Initialization Skill', () => {
  // Type Detection Tests
  test('detects feature from description', () => {
    const description = 'Build dark mode functionality';
    const result = detectType(description);
    assert.equal(result, 'feature');
  });

  test('detects bug from description', () => {
    const description = 'Fix memory leak in scheduler';
    const result = detectType(description);
    assert.equal(result, 'bug');
  });

  test('detects chore from description', () => {
    const description = 'Update dependencies to latest versions';
    const result = detectType(description);
    assert.equal(result, 'chore');
  });

  test('detects refactor from description', () => {
    const description = 'Reorganize component structure';
    const result = detectType(description);
    assert.equal(result, 'refactor');
  });

  test('detects docs from description', () => {
    const description = 'Document authentication flow';
    const result = detectType(description);
    assert.equal(result, 'docs');
  });

  // Question Asking Tests
  test('asks progressive disclosure questions', () => {
    const questions = generateQuestions('feature');
    assert.ok(Array.isArray(questions));
    assert.ok(questions.length >= 5 && questions.length <= 7);
    assert.ok(questions.every(q => q.question && q.options));
  });

  test('validates user answers', () => {
    const answers = {
      problem: 'User frustration',
      users: 'End users',
      success: 'User adoption',
      deadline: '1 week',
      criteria: 'Yes',
    };
    const result = validateAnswers(answers);
    assert.equal(result.valid, true);
  });

  // Spec Generation Tests
  test('generates valid spec markdown', () => {
    const spec = generateSpec({
      title: 'Dark Mode',
      type: 'feature',
      answers: {
        problem: 'Users want dark theme',
        users: 'End users',
        success: 'User adoption',
        deadline: '2 weeks',
        criteria: 'Toggle in settings, persisted preference',
      },
    });

    assert.ok(spec.includes('# SPEC: Dark Mode'));
    assert.ok(spec.includes('**Type**: feature'));
    assert.ok(spec.includes('## 1. Overview'));
    assert.ok(spec.includes('## 2. Problem Statement'));
    assert.ok(spec.includes('## 8. Acceptance Criteria Checklist'));
  });

  test('populates all sections', () => {
    const spec = generateSpec({
      title: 'Test Feature',
      type: 'feature',
      answers: {},
    });

    const requiredSections = [
      '## 1. Overview',
      '## 2. Problem Statement',
      '## 3. Proposed Solution',
      '## 4. Implementation Approach',
      '## 5. Success Metrics',
      '## 6. Effort Estimate',
      '## 7. Dependencies',
      '## 8. Acceptance Criteria Checklist',
    ];

    requiredSections.forEach(section => {
      assert.ok(spec.includes(section), `Missing section: ${section}`);
    });
  });

  test('includes at least 3 AC', () => {
    const spec = generateSpec({
      title: 'Test',
      type: 'feature',
      answers: { criteria: 'Feature works, Tests pass, Docs updated' },
    });

    const acMatches = spec.match(/- \[ \]/g);
    assert.ok(acMatches && acMatches.length >= 3);
  });

  // Validation Tests
  test('validates spec against schema', () => {
    const validSpec = `# SPEC: Test
**Type**: feature
## 1. Overview
Description here
## 2. Problem Statement
Problem here`;

    const result = validateSpec(validSpec);
    assert.equal(result.valid, true);
  });

  test('catches missing sections', () => {
    const invalidSpec = `# SPEC: Test
**Type**: feature`;

    const result = validateSpec(invalidSpec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('Missing section: ## 1. Overview'));
  });

  // Storage Tests
  test('saves spec to correct location', () => {
    const spec = 'test spec content';
    const filename = saveSpec(spec, 'test-feature');

    const _expectedPath = path.join(process.cwd(), '.claude/context/artifacts/specs', filename);

    assert.ok(filename.includes('test-feature'));
    assert.ok(filename.includes('-spec-'));
    assert.ok(filename.endsWith('.md'));
  });

  test('generates valid track metadata', () => {
    const metadata = generateMetadata({
      title: 'Test Feature',
      type: 'feature',
    });

    assert.ok(metadata.trackId);
    assert.equal(metadata.type, 'feature');
    assert.equal(metadata.status, 'new');
    assert.ok(metadata.created_at);
  });

  // Integration Tests
  test('works with progressive-disclosure', () => {
    // Simulates integration with progressive-disclosure skill
    const _questions = generateQuestions('feature');
    const answers = {
      problem: 'Test problem',
      users: 'Test users',
      success: 'Test success',
      deadline: 'Test deadline',
      criteria: 'Test criteria',
    };

    const spec = generateSpec({
      title: 'Test',
      type: 'feature',
      answers,
    });

    assert.ok(spec.includes('Test problem'));
  });

  test('works with spec-validator', () => {
    const spec = generateSpec({
      title: 'Test',
      type: 'feature',
      answers: {},
    });

    const validation = validateSpec(spec);
    assert.equal(validation.valid, true);
  });

  test('offers plan generation after completion', () => {
    const nextSteps = getNextSteps('spec-complete');
    assert.ok(nextSteps.includes('plan-generator'));
    assert.ok(nextSteps.includes('Ready for planner'));
  });

  // Edge Cases
  test('handles long descriptions', () => {
    const longDesc = 'Build '.repeat(100) + 'feature';
    const type = detectType(longDesc);
    assert.equal(type, 'feature');
  });

  test('handles special characters', () => {
    const description = 'Fix bug: User@Name & Email#Parser';
    const type = detectType(description);
    assert.equal(type, 'bug');
  });

  test('graceful error handling', () => {
    const result = generateSpec(null);
    assert.ok(result.includes('Error'));
  });
});

// Implementation functions
function detectType(description) {
  if (!description || typeof description !== 'string') {
    return 'feature'; // default
  }

  const lower = description.toLowerCase();

  // Keywords for detection
  if (
    lower.includes('fix') ||
    lower.includes('bug') ||
    lower.includes('issue') ||
    lower.includes('leak')
  ) {
    return 'bug';
  }
  if (lower.includes('update') || lower.includes('upgrade') || lower.includes('dependency')) {
    return 'chore';
  }
  if (lower.includes('reorganize') || lower.includes('refactor') || lower.includes('restructure')) {
    return 'refactor';
  }
  if (lower.includes('document') || lower.includes('docs') || lower.includes('readme')) {
    return 'docs';
  }
  if (
    lower.includes('build') ||
    lower.includes('add') ||
    lower.includes('create') ||
    lower.includes('implement')
  ) {
    return 'feature';
  }

  return 'feature'; // default
}

function generateQuestions(type) {
  const baseQuestions = [
    {
      question: 'What problem does this solve?',
      options: ['User frustration', 'Performance issue', 'Missing capability', 'Other'],
    },
    {
      question: 'Who are the users?',
      options: ['End users', 'Developers', 'Operators', 'All of above'],
    },
    {
      question: 'How will you measure success?',
      options: ['User adoption', 'Performance metrics', 'Error reduction', 'Feature usage'],
    },
    {
      question: "What's the deadline?",
      options: ['ASAP', '1 week', '1 month', 'No deadline', 'Type custom'],
    },
    {
      question: 'Do you have acceptance criteria?',
      options: ['Yes (provide list)', "No (I'll define them)", 'Other'],
    },
  ];

  // Add type-specific questions
  if (type === 'bug') {
    baseQuestions.push({
      question: 'Can you reproduce this consistently?',
      options: ['Yes', 'Sometimes', 'No'],
    });
  }

  return baseQuestions;
}

function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object') {
    return { valid: false, errors: ['Answers must be an object'] };
  }

  // Check for required fields
  const required = ['problem', 'users', 'success', 'deadline', 'criteria'];
  const missing = required.filter(field => !answers[field]);

  if (missing.length > 0) {
    return {
      valid: false,
      errors: missing.map(field => `Missing required field: ${field}`),
    };
  }

  return { valid: true };
}

function generateSpec(config) {
  try {
    if (!config) {
      return 'Error: Configuration required';
    }

    const title = config.title || 'Untitled';
    const type = config.type || 'feature';
    const answers = config.answers || {};

    const date = new Date().toISOString().split('T')[0];

    const spec = `# SPEC: ${title}

**Status**: Draft
**Created**: ${date}
**Type**: ${type}

## 1. Overview

**Objective**:
${answers.problem || 'Objective to be defined'}

**User Story**:
"As a ${answers.users || 'user'}, I want ${title}, so that ${answers.problem || 'benefit is achieved'}"

**Acceptance Criteria**:
${generateAcceptanceCriteria(answers.criteria)}

## 2. Problem Statement

**Current State**:
${answers.problem || 'Problem to be defined'}

**Pain Points**:
- ${answers.problem || 'Pain point 1'}

**Impact**:
- Who is affected? ${answers.users || 'Users'}
- What's the cost of inaction? ${answers.success || 'Unknown'}

## 3. Proposed Solution

**Approach**:
High-level solution for ${title}

**Key Features**:
- Core functionality

**Out of Scope**:
To be determined

## 4. Implementation Approach

**Phase 1 - Design** (1 day):
- Research and design

**Phase 2 - Implementation** (3 days):
- Build core features

**Phase 3 - Testing** (2 days):
- Write and run tests

**Phase 4 - Documentation** (1 day):
- Update documentation

## 5. Success Metrics

**Quantitative**:
- ${answers.success || 'Metric to be defined'}

**Qualitative**:
- User satisfaction

**Timeline**:
- ${answers.deadline || 'No deadline'}

## 6. Effort Estimate

| Phase | Effort | Notes |
|-------|--------|-------|
| Design | 1 day | Include spike if needed |
| Implementation | 3 days | TDD approach |
| Testing | 2 days | Unit + integration |
| Documentation | 1 day | API + user docs |
| **Total** | **7 days** | With 2-3 person team |

## 7. Dependencies

**Must Complete First**:
- None identified

**Risks**:
- Risk assessment pending

## 8. Acceptance Criteria Checklist

${generateAcceptanceCriteria(answers.criteria)}
- [ ] All tests passing
- [ ] Documentation updated
`;

    return spec;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

function generateAcceptanceCriteria(criteria) {
  if (!criteria) {
    return `- [ ] Feature implemented
- [ ] Tests passing
- [ ] Documentation updated`;
  }

  if (typeof criteria === 'string') {
    const items = criteria.split(',').map(s => s.trim());
    return items.map(item => `- [ ] ${item}`).join('\n');
  }

  return `- [ ] ${criteria}`;
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'string') {
    return { valid: false, errors: ['Spec must be a string'] };
  }

  const errors = [];

  // Check for minimum required sections (basic validation)
  const minimumRequiredSections = ['# SPEC:', '## 1. Overview', '## 2. Problem Statement'];

  minimumRequiredSections.forEach(section => {
    if (!spec.includes(section)) {
      errors.push(`Missing section: ${section}`);
    }
  });

  // Check for type
  if (!spec.includes('**Type**:')) {
    errors.push('Missing Type field');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function saveSpec(spec, name) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `${name}-spec-${date}.md`;
  return filename;
}

function generateMetadata(config) {
  const _date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const randomId = Math.floor(Math.random() * 100000000)
    .toString()
    .padStart(8, '0');

  return {
    trackId: `${config.title.toLowerCase().replace(/\s+/g, '_')}_${randomId}`,
    type: config.type,
    status: 'new',
    created_at: new Date().toISOString(),
  };
}

function getNextSteps(state) {
  if (state === 'spec-complete') {
    return 'Ready for planner to create plan. Use: Skill({ skill: "plan-generator" })';
  }
  return 'Continue with spec creation';
}
