/**
 * Evolution Integration Wiring Tests (Task #15)
 *
 * Verifies evolution-orchestrator and evolution-workflow are wired into ADR-100 artifact integration system.
 *
 * Evidence Required:
 * 1. evolution-orchestrator.md has artifact-integrator in skills array
 * 2. evolution-orchestrator.md mentions "Integration Analysis" or "ADR-100"
 * 3. evolution-workflow.md mentions "artifact-integrator" or "integration graph"
 * 4. evolution-workflow.md Gate 6 includes integration check
 * 5. Iron Laws include integration (law #7)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('Evolution Integration Wiring (Task #15)', () => {
  let orchestratorContent;
  let workflowContent;

  before(() => {
    const orchestratorPath = path.join(PROJECT_ROOT, '.claude', 'agents', 'orchestrators', 'evolution-orchestrator.md');
    const workflowPath = path.join(PROJECT_ROOT, '.claude', 'workflows', 'core', 'evolution-workflow.md');

    assert.ok(fs.existsSync(orchestratorPath), 'evolution-orchestrator.md must exist');
    assert.ok(fs.existsSync(workflowPath), 'evolution-workflow.md must exist');

    orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
  });

  describe('evolution-orchestrator.md', () => {
    it('should have artifact-integrator in skills array', () => {
      // Parse YAML frontmatter
      const frontmatterMatch = orchestratorContent.match(/^---\n([\s\S]+?)\n---/);
      assert.ok(frontmatterMatch, 'evolution-orchestrator.md must have YAML frontmatter');

      const frontmatter = frontmatterMatch[1];
      assert.match(frontmatter, /artifact-integrator/, 'artifact-integrator must be in skills array');
    });

    it('should mention Integration Analysis or ADR-100 in Phase E', () => {
      assert.match(
        orchestratorContent,
        /Integration Analysis|ADR-100/,
        'evolution-orchestrator.md must mention Integration Analysis or ADR-100'
      );

      // Verify it's in Phase E section
      const phaseESection = orchestratorContent.match(/### Phase E: ENABLE.*?(?=###|$)/s);
      assert.ok(phaseESection, 'Phase E: ENABLE section must exist');
      assert.match(
        phaseESection[0],
        /Integration Analysis|ADR-100/,
        'Integration Analysis/ADR-100 must be in Phase E section'
      );
    });

    it('should include integration check in Phase E actions', () => {
      const phaseESection = orchestratorContent.match(/### Phase E: ENABLE.*?(?=###|$)/s);
      assert.ok(phaseESection, 'Phase E: ENABLE section must exist');

      assert.match(
        phaseESection[0],
        /artifact-integrator|integration graph|graph connectivity|orphaned/i,
        'Phase E must mention artifact integration concepts'
      );
    });

    it('should include "NO ARTIFACT WITHOUT INTEGRATION" in Iron Laws', () => {
      const ironLawsSection = orchestratorContent.match(/## Iron Laws of Evolution.*?(?=##|$)/s);
      assert.ok(ironLawsSection, 'Iron Laws section must exist');

      assert.match(
        ironLawsSection[0],
        /7\.\s+NO ARTIFACT WITHOUT INTEGRATION/,
        'Iron Law #7 must be "NO ARTIFACT WITHOUT INTEGRATION"'
      );

      assert.match(
        ironLawsSection[0],
        /orphaned.*deployment failure|artifact.*at least 1 edge/i,
        'Iron Law #7 must mention orphaned artifacts or edge count'
      );
    });

    it('should mention artifact graph in Gate Criteria', () => {
      const phaseESection = orchestratorContent.match(/### Phase E: ENABLE.*?(?=###|$)/s);
      assert.ok(phaseESection, 'Phase E: ENABLE section must exist');

      assert.match(
        phaseESection[0],
        /integration graph.*at least 1 edge|artifact.*not orphaned/i,
        'Gate Criteria must mention integration graph with edge count check'
      );
    });
  });

  describe('evolution-workflow.md', () => {
    it('should mention artifact-integrator or integration graph', () => {
      assert.match(
        workflowContent,
        /artifact-integrator|integration graph/i,
        'evolution-workflow.md must mention artifact-integrator or integration graph'
      );
    });

    it('should include artifact-integrator skill invocation in Phase 6 Actions', () => {
      const phase6Section = workflowContent.match(/### Phase 6: ENABLE.*?(?=###|$)/s);
      assert.ok(phase6Section, 'Phase 6: ENABLE section must exist');

      assert.match(
        phase6Section[0],
        /Skill\(\{\s*skill:\s*['"]artifact-integrator['"]\s*\}\)|artifact-integrator/,
        'Phase 6 Actions must invoke artifact-integrator skill'
      );
    });

    it('should include integration check in Exit Conditions', () => {
      const phase6Section = workflowContent.match(/### Phase 6: ENABLE.*?(?=###|$)/s);
      assert.ok(phase6Section, 'Phase 6: ENABLE section must exist');

      const exitConditionsSection = phase6Section[0].match(/\*\*Exit Conditions\*\*.*?(?=\*\*|$)/s);
      assert.ok(exitConditionsSection, 'Exit Conditions section must exist in Phase 6');

      assert.match(
        exitConditionsSection[0],
        /integration graph.*at least 1 edge|not orphaned/i,
        'Exit Conditions must include integration graph edge check'
      );
    });

    it('should include integration fields in Gate Validation Script', () => {
      const phase6Section = workflowContent.match(/### Phase 6: ENABLE.*?(?=###|$)/s);
      assert.ok(phase6Section, 'Phase 6: ENABLE section must exist');

      const gateValidationSection = phase6Section[0].match(/\*\*Gate Validation Script\*\*.*?(?=\*\*|$)/s);
      assert.ok(gateValidationSection, 'Gate Validation Script must exist in Phase 6');

      assert.match(
        gateValidationSection[0],
        /artifactInGraph|artifactNotOrphaned/,
        'Gate Validation Script must include artifactInGraph and artifactNotOrphaned checks'
      );
    });

    it('should include integrationStatus and integrationEdges in Evolution State Schema', () => {
      const schemaSection = workflowContent.match(/## Evolution State Schema.*?(?=##|$)/s);
      assert.ok(schemaSection, 'Evolution State Schema section must exist');

      assert.match(
        schemaSection[0],
        /"integrationStatus":\s*"pending\|connected\|orphaned"/,
        'Evolution State Schema must include integrationStatus field'
      );

      assert.match(
        schemaSection[0],
        /"integrationEdges":\s*0/,
        'Evolution State Schema must include integrationEdges field'
      );
    });
  });

  describe('Integration Completeness', () => {
    it('should have consistent integration terminology across both files', () => {
      // Check that both files use similar terms
      const orchestratorHasGraph = /artifact.*graph|integration.*graph/i.test(orchestratorContent);
      const workflowHasGraph = /artifact.*graph|integration.*graph/i.test(workflowContent);

      assert.ok(
        orchestratorHasGraph && workflowHasGraph,
        'Both files must reference artifact/integration graph consistently'
      );
    });

    it('should mention orphaned artifacts in both files', () => {
      const orchestratorHasOrphaned = /orphaned/i.test(orchestratorContent);
      const workflowHasOrphaned = /orphaned/i.test(workflowContent);

      assert.ok(
        orchestratorHasOrphaned && workflowHasOrphaned,
        'Both files must mention orphaned artifacts'
      );
    });

    it('should reference ADR-100 in integration sections', () => {
      const hasADR100 = /ADR-100|ADR 100/i.test(orchestratorContent) || /ADR-100|ADR 100/i.test(workflowContent);
      assert.ok(hasADR100, 'At least one file must reference ADR-100');
    });
  });
});
