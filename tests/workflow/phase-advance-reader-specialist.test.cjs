/**
 * Test: Domain specialist resolution in phase-advance-reader
 * ============================================================
 *
 * Tests resolveDomainSpecialist() function for dynamic specialist routing
 * in PHASE_2_IMPLEMENT based on task context.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
  resolveDomainSpecialist,
  getNextPhaseAgents,
  DOMAIN_SPECIALIST_MAP,
} = require('../../.claude/lib/workflow/phase-advance-reader.cjs');

describe('resolveDomainSpecialist', () => {
  it('should return null for empty or null context', () => {
    assert.strictEqual(resolveDomainSpecialist(null), null);
    assert.strictEqual(resolveDomainSpecialist(''), null);
    assert.strictEqual(resolveDomainSpecialist(undefined), null);
  });

  it('should resolve python-pro for Python task context', () => {
    assert.strictEqual(
      resolveDomainSpecialist('Implement Python authentication module'),
      'python-pro'
    );
    assert.strictEqual(resolveDomainSpecialist('Fix Django ORM query performance'), 'python-pro');
  });

  it('should resolve fastapi-pro for FastAPI context', () => {
    assert.strictEqual(
      resolveDomainSpecialist('Add FastAPI endpoint for user management'),
      'fastapi-pro'
    );
  });

  it('should resolve frontend-pro for React task context', () => {
    assert.strictEqual(
      resolveDomainSpecialist('Build React component for user profile'),
      'frontend-pro'
    );
    assert.strictEqual(resolveDomainSpecialist('Fix Vue router navigation bug'), 'frontend-pro');
    assert.strictEqual(resolveDomainSpecialist('Update CSS styles for mobile'), 'frontend-pro');
  });

  it('should resolve typescript-pro for TypeScript context', () => {
    assert.strictEqual(
      resolveDomainSpecialist('Add TypeScript interfaces for API'),
      'typescript-pro'
    );
  });

  it('should resolve golang-pro for Go context', () => {
    assert.strictEqual(resolveDomainSpecialist('Implement Go microservice'), 'golang-pro');
    assert.strictEqual(resolveDomainSpecialist('Fix go routine leak'), 'golang-pro');
  });

  it('should resolve nextjs-pro for Next.js context', () => {
    assert.strictEqual(resolveDomainSpecialist('Add Next.js server action'), 'nextjs-pro');
    assert.strictEqual(resolveDomainSpecialist('Fix NextJS routing'), 'nextjs-pro');
  });

  it('should resolve specialist domains', () => {
    assert.strictEqual(resolveDomainSpecialist('Train machine learning model'), 'ai-ml-specialist');
    assert.strictEqual(
      resolveDomainSpecialist('Deploy PyTorch model to production'),
      'ai-ml-specialist'
    );
    assert.strictEqual(
      resolveDomainSpecialist('Write Solidity smart contract'),
      'web3-blockchain-expert'
    );
    assert.strictEqual(resolveDomainSpecialist('Build Unity game level'), 'gamedev-pro');
    assert.strictEqual(resolveDomainSpecialist('Create ETL data pipeline'), 'data-engineer');
  });

  it('should return null for generic task with no specialist keywords', () => {
    assert.strictEqual(resolveDomainSpecialist('Implement authentication logic'), null);
    assert.strictEqual(resolveDomainSpecialist('Fix bug in user service'), null);
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(resolveDomainSpecialist('PYTHON script needed'), 'python-pro');
    assert.strictEqual(resolveDomainSpecialist('React Component'), 'frontend-pro');
  });

  it('should match keywords as substrings', () => {
    assert.strictEqual(resolveDomainSpecialist('We need a Python-based solution'), 'python-pro');
    assert.strictEqual(resolveDomainSpecialist('frontend work required'), 'frontend-pro');
  });
});

describe('getNextPhaseAgents with specialist context', () => {
  it('should return developer for PHASE_2_IMPLEMENT with no context', () => {
    const agents = getNextPhaseAgents('PHASE_2_IMPLEMENT', 'MEDIUM');
    assert.deepStrictEqual(agents, ['developer']);
  });

  it('should return python-pro for PHASE_2_IMPLEMENT with Python context', () => {
    const agents = getNextPhaseAgents('PHASE_2_IMPLEMENT', 'MEDIUM', {
      taskDescription: 'Implement Python Django endpoint',
    });
    // Should resolve to python-pro (Django is a Python framework)
    assert.deepStrictEqual(agents, ['python-pro']);
  });

  it('should return frontend-pro for PHASE_2_IMPLEMENT with React context', () => {
    const agents = getNextPhaseAgents('PHASE_2_IMPLEMENT', 'HIGH', {
      taskDescription: 'Build React dashboard',
    });
    assert.deepStrictEqual(agents, ['frontend-pro']);
  });

  it('should fallback to developer for generic task context', () => {
    const agents = getNextPhaseAgents('PHASE_2_IMPLEMENT', 'LOW', {
      taskDescription: 'Fix authentication bug',
    });
    assert.deepStrictEqual(agents, ['developer']);
  });

  it('should still work for other phases without taskContext', () => {
    const agents = getNextPhaseAgents('PHASE_3_REVIEW', 'MEDIUM');
    assert.deepStrictEqual(agents, ['code-reviewer', 'qa']);
  });
});

describe('DOMAIN_SPECIALIST_MAP', () => {
  it('should export the specialist mapping constant', () => {
    assert.ok(DOMAIN_SPECIALIST_MAP);
    assert.strictEqual(typeof DOMAIN_SPECIALIST_MAP, 'object');
  });

  it('should contain expected language specialists', () => {
    assert.strictEqual(DOMAIN_SPECIALIST_MAP['python'], 'python-pro');
    assert.strictEqual(DOMAIN_SPECIALIST_MAP['typescript'], 'typescript-pro');
    assert.strictEqual(DOMAIN_SPECIALIST_MAP['react'], 'frontend-pro');
  });
});
