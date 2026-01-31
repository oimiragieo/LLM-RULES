/**
 * Integration Test Framework - SPEC-012 Multi-Feature Integration Testing
 *
 * Provides infrastructure for testing coordination between Phase 0-2 features:
 * - SPEC-001 (Spec-Init) + SPEC-007 (Track Metadata)
 * - SPEC-005 (Brownfield) + SPEC-009 (Progressive Disclosure)
 * - SPEC-010 (Smart Revert) + SPEC-002 (Git Notes Audit)
 * - Cross-feature coordinator tests
 *
 * @implements {SPEC-012}
 */

const fs = require('fs');
const path = require('path');
// const { execSync } = require('child_process'); // unused
const os = require('os');

class IntegrationTestFramework {
  constructor() {
    this.scenarios = new Map();
    this.tempDir = null;
    this.results = [];
  }

  /**
   * Setup test environment
   * Creates temporary directory for test isolation
   */
  async setup() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
    this.results = [];
    return this.tempDir;
  }

  /**
   * Cleanup test environment
   * Removes temporary directory and resets state
   */
  async teardown() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
    this.tempDir = null;
    this.scenarios.clear();
    this.results = [];
  }

  /**
   * Register integration scenario
   * @param {string} id - Scenario identifier
   * @param {Array<{name: string, execute: Function, rollback?: Function}>} steps - Scenario steps
   * @param {Object} expected - Expected outcomes
   */
  addScenario(id, steps, expected) {
    if (this.scenarios.has(id)) {
      throw new Error(`Scenario ${id} already registered`);
    }

    this.scenarios.set(id, {
      id,
      steps,
      expected,
      status: 'pending',
    });
  }

  /**
   * Execute scenario steps sequentially
   * @param {string} id - Scenario identifier
   * @returns {Promise<Object>} Execution result
   */
  async executeSequential(id) {
    const scenario = this.scenarios.get(id);
    if (!scenario) {
      throw new Error(`Scenario ${id} not found`);
    }

    const startTime = Date.now();
    const stepResults = [];
    let failedStep = null;

    try {
      for (const [index, step] of scenario.steps.entries()) {
        const stepStart = Date.now();
        try {
          const result = await this.executeStep(step);
          stepResults.push({
            index,
            name: step.name,
            status: 'passed',
            duration: Date.now() - stepStart,
            result,
          });
        } catch (error) {
          failedStep = index;
          stepResults.push({
            index,
            name: step.name,
            status: 'failed',
            duration: Date.now() - stepStart,
            error: error.message,
          });
          break;
        }
      }

      const result = {
        scenarioId: id,
        status: failedStep === null ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        steps: stepResults,
        failedStep,
      };

      this.results.push(result);
      return result;
    } catch (error) {
      const result = {
        scenarioId: id,
        status: 'error',
        duration: Date.now() - startTime,
        steps: stepResults,
        error: error.message,
      };
      this.results.push(result);
      throw error;
    }
  }

  /**
   * Execute multiple scenarios in parallel
   * @param {Array<string>} ids - Scenario identifiers
   * @returns {Promise<Array<Object>>} Execution results
   */
  async executeParallel(ids) {
    const promises = ids.map(id =>
      this.executeSequential(id).catch(err => ({
        scenarioId: id,
        status: 'error',
        error: err.message,
      }))
    );
    return Promise.all(promises);
  }

  /**
   * Execute single scenario step
   * @param {Object} step - Step definition
   * @returns {Promise<any>} Step result
   */
  async executeStep(step) {
    if (typeof step.execute !== 'function') {
      throw new Error(`Step ${step.name} missing execute function`);
    }
    return step.execute();
  }

  /**
   * Validate scenario outcome against expected results
   * @param {Object} result - Actual result
   * @param {Object} expected - Expected result
   * @returns {Object} Validation result
   */
  validateOutcome(result, expected) {
    const validation = {
      passed: true,
      mismatches: [],
    };

    // Validate status
    if (expected.status && result.status !== expected.status) {
      validation.passed = false;
      validation.mismatches.push({
        field: 'status',
        expected: expected.status,
        actual: result.status,
      });
    }

    // Validate data presence
    if (expected.hasData) {
      for (const [key, shouldExist] of Object.entries(expected.hasData)) {
        const exists = result.steps?.some(s => s.result?.[key] !== undefined);
        if (exists !== shouldExist) {
          validation.passed = false;
          validation.mismatches.push({
            field: key,
            expected: shouldExist ? 'exists' : 'not exists',
            actual: exists ? 'exists' : 'not exists',
          });
        }
      }
    }

    // Validate step count
    if (expected.stepCount && result.steps?.length !== expected.stepCount) {
      validation.passed = false;
      validation.mismatches.push({
        field: 'stepCount',
        expected: expected.stepCount,
        actual: result.steps?.length || 0,
      });
    }

    return validation;
  }

  /**
   * Separate succeeded and failed scenarios
   * @param {Array<Object>} results - Scenario results
   * @returns {Object} Segregated results
   */
  isolateFailures(results) {
    return {
      succeeded: results.filter(r => r.status === 'passed'),
      failed: results.filter(r => r.status === 'failed' || r.status === 'error'),
      total: results.length,
      passRate: results.filter(r => r.status === 'passed').length / results.length,
    };
  }

  /**
   * Generate markdown report from test results
   * @param {Array<Object>} results - Test results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    const { succeeded, failed, total, passRate } = this.isolateFailures(results);

    let report = `# Integration Test Report\n\n`;
    report += `**Generated**: ${new Date().toISOString()}\n\n`;
    report += `## Summary\n\n`;
    report += `- **Total Scenarios**: ${total}\n`;
    report += `- **Passed**: ${succeeded.length}\n`;
    report += `- **Failed**: ${failed.length}\n`;
    report += `- **Pass Rate**: ${(passRate * 100).toFixed(1)}%\n\n`;

    if (succeeded.length > 0) {
      report += `## Passed Scenarios\n\n`;
      for (const result of succeeded) {
        report += `### ✅ ${result.scenarioId}\n`;
        report += `- Duration: ${result.duration}ms\n`;
        report += `- Steps: ${result.steps.length}\n\n`;
      }
    }

    if (failed.length > 0) {
      report += `## Failed Scenarios\n\n`;
      for (const result of failed) {
        report += `### ❌ ${result.scenarioId}\n`;
        report += `- Status: ${result.status}\n`;
        report += `- Duration: ${result.duration}ms\n`;
        if (result.error) {
          report += `- Error: ${result.error}\n`;
        }
        if (result.failedStep !== null) {
          const step = result.steps[result.failedStep];
          report += `- Failed Step: ${step.name} (${step.error})\n`;
        }
        report += `\n`;
      }
    }

    return report;
  }
}

module.exports = { IntegrationTestFramework };
