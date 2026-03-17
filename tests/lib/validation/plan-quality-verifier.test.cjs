const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  verifyPlan,
  DIMENSIONS,
} = require('../../../.claude/lib/validation/plan-quality-verifier.cjs');

describe('plan-quality-verifier', () => {
  it('has 8 dimensions', () => {
    assert.strictEqual(DIMENSIONS.length, 8);
  });

  it('rejects empty plans', () => {
    const result = verifyPlan('');
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.score, 0);
  });

  it('rejects very short plans', () => {
    const result = verifyPlan('short');
    assert.strictEqual(result.pass, false);
  });

  it('scores a well-structured plan as passing', () => {
    const goodPlan = `# Implementation Plan\n## Requirements\n- Must support authentication\n- Acceptance criteria: users can log in\n\n## Tasks\n- [ ] Create auth middleware\n- [ ] Add JWT validation\n- [ ] Write integration tests\n- [ ] Update API docs\n\n## Dependencies\n- Blocked by database setup\n\n## Risks\n- Risk: token expiration. Mitigation: refresh tokens.\n\n## Testing\n- Verify login flow\n- Assert token refresh\n\n## Estimation\n- Wave 1: auth middleware (low complexity)\n- Wave 2: JWT validation (medium complexity)`;
    const result = verifyPlan(goodPlan);
    assert.strictEqual(result.pass, true);
    assert.ok(result.score >= 6, `Score ${result.score} should be >= 6`);
    assert.strictEqual(result.dimensions.length, 8);
  });

  it('returns dimension details', () => {
    const result = verifyPlan(
      'A plan that is long enough to be valid but has minimal structure for testing purposes here.'
    );
    assert.ok(result.dimensions.length === 8);
    for (const dim of result.dimensions) {
      assert.ok(dim.name);
      assert.ok(typeof dim.score === 'number');
      assert.strictEqual(dim.maxScore, 10);
    }
  });
});
