'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFailureEvidenceSummary,
  buildFlakeOpsSummary,
  buildImpactedValidationSummary,
  buildReleaseGateSummary,
} = require('../../../.claude/lib/ci/github-actions-summary.cjs');

test('buildImpactedValidationSummary renders advisory recommendations deterministically', () => {
  const markdown = buildImpactedValidationSummary({
    advisory: true,
    changedFiles: ['.github/workflows/ci.yml', 'package.json'],
    rationale: 'Touched workflow wiring and package scripts.',
    recommendedCommands: ['pnpm validate:affected --json', 'pnpm test -- --grep ci'],
  });

  assert.equal(
    markdown,
    [
      '## Impacted Validation',
      '- Advisory: yes',
      '- Changed files: `2`',
      '- Rationale: Touched workflow wiring and package scripts.',
      '- Recommended commands:',
      '  - `pnpm validate:affected --json`',
      '  - `pnpm test -- --grep ci`',
    ].join('\n')
  );
});

test('buildReleaseGateSummary renders semver classification and failures deterministically', () => {
  const markdown = buildReleaseGateSummary({
    docsOnly: false,
    requiredBump: 'major',
    ok: false,
    failures: ['Major release requires a migration guide.'],
  });

  assert.equal(
    markdown,
    [
      '## Release Gate',
      '- Semver class: `major`',
      '- Release path: `major`',
      '- Docs only: no',
      '- Migration guide required: yes',
      '- Gate status: failing',
      '- Failures:',
      '  - Major release requires a migration guide.',
    ].join('\n')
  );
});

test('buildFailureEvidenceSummary renders linked artifacts deterministically', () => {
  const markdown = buildFailureEvidenceSummary({
    artifacts: [
      {
        name: 'full-validation-tests-failure-evidence',
        kind: 'failure_evidence',
        url: 'https://example.test/artifacts/123',
        createdAt: '2026-04-17T21:00:00.000Z',
      },
    ],
  });

  assert.equal(
    markdown,
    [
      '## Failure Evidence',
      '- Artifact count: `1`',
      '- Artifacts:',
      '  - [full-validation-tests-failure-evidence](https://example.test/artifacts/123) (`failure_evidence`, `2026-04-17T21:00:00.000Z`)',
    ].join('\n')
  );
});

test('buildFlakeOpsSummary renders actionable counts and categories deterministically', () => {
  const markdown = buildFlakeOpsSummary({
    actionable: true,
    issueUrl: 'https://example.test/issues/42',
    observationWindow: '14d',
    totalArtifacts: 5,
    totalOccurrences: 3,
    byCategory: {
      env_nondeterminism: 2,
      test_defect: 1,
      unknown: 0,
    },
  });

  assert.equal(
    markdown,
    [
      '## Flake Ops',
      '- Observation window: `14d`',
      '- Total artifacts: `5`',
      '- Total occurrences: `3`',
      '- Actionable: yes',
      '- Tracking issue: [#42](https://example.test/issues/42)',
      '- Category counts:',
      '  - `env_nondeterminism`: `2`',
      '  - `test_defect`: `1`',
      '  - `unknown`: `0`',
    ].join('\n')
  );
});
