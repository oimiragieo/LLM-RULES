/**
 * SPEC-015: Migration Strategy
 *
 * Defines 4-phase migration strategy for conductor-main integration.
 * Provides task sequencing, effort estimates, and checkpoints.
 */

class MigrationStrategy {
  constructor() {
    this.phases = this._definePhases();
  }

  /**
   * Get all migration phases
   * @returns {Array<{name: string, tasks: Array, successCriteria: Array, rollback: string}>}
   */
  getPhases() {
    return this.phases;
  }

  /**
   * Get tasks for a specific phase
   * @param {string} phaseName - Name of phase (Assessment, Enablement, Validation, Documentation)
   * @returns {Array}
   */
  getMigrationTasks(phaseName) {
    const phase = this.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Invalid phase: ${phaseName}. Valid phases: ${this.phases.map(p => p.name).join(', ')}`);
    }

    return phase.tasks;
  }

  /**
   * Get critical checkpoints across all phases
   * @returns {Array<{phase: string, name: string, validation: string}>}
   */
  getCheckpoints() {
    const checkpoints = [];

    for (const phase of this.phases) {
      for (const task of phase.tasks) {
        if (task.checkpoint) {
          checkpoints.push({
            phase: phase.name,
            name: task.description,
            validation: task.validation || 'Manual verification required'
          });
        }
      }
    }

    return checkpoints;
  }

  /**
   * Estimate effort for a phase
   * @param {string} phaseName
   * @returns {{hours: number, parallel: boolean}}
   */
  estimateEffort(phaseName) {
    const phase = this.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Invalid phase: ${phaseName}`);
    }

    return {
      hours: phase.estimatedHours,
      parallel: phase.parallelizable || false
    };
  }

  /**
   * Calculate total migration effort
   * @returns {number} Total hours
   */
  estimateTotalEffort() {
    return this.phases.reduce((sum, phase) => sum + phase.estimatedHours, 0);
  }

  // Private methods

  _definePhases() {
    return [
      // Phase 1: Assessment
      {
        name: 'Assessment',
        estimatedHours: 2,
        parallelizable: false,
        tasks: [
          {
            id: 'assess-1',
            description: 'Run brownfield detection on conductor-main',
            required: true,
            dependsOn: [],
            validation: 'tech-stack.md generated'
          },
          {
            id: 'assess-2',
            description: 'Generate tech-stack.md',
            required: true,
            dependsOn: ['assess-1']
          },
          {
            id: 'assess-3',
            description: 'Identify existing tracks and state files',
            required: true,
            dependsOn: []
          },
          {
            id: 'assess-4',
            description: 'Map workflows to Agent-Studio equivalents',
            required: true,
            dependsOn: ['assess-3']
          }
        ],
        successCriteria: [
          'Assessment tool runs successfully',
          'Compatibility report generated',
          'Migration plan created',
          'Risk areas documented'
        ],
        rollback: 'No changes made - assessment only'
      },

      // Phase 2: Enablement
      {
        name: 'Enablement',
        estimatedHours: 4,
        parallelizable: true,
        tasks: [
          {
            id: 'enable-1',
            description: 'Enable git-notes-audit.cjs hook',
            required: true,
            dependsOn: [],
            checkpoint: true,
            validation: 'Notes attached to test commit'
          },
          {
            id: 'enable-2',
            description: 'Enable phase-completion-guard.cjs hook (warn mode)',
            required: false,
            dependsOn: [],
            checkpoint: true
          },
          {
            id: 'enable-3',
            description: 'Migrate setup_state.json to workflow-state format',
            required: true,
            dependsOn: []
          },
          {
            id: 'enable-4',
            description: 'Configure code styleguide injection',
            required: false,
            dependsOn: []
          }
        ],
        successCriteria: [
          'Git notes attaching to commits',
          'Workflow state saves correctly',
          'Phase verification in warn mode',
          'Styleguides loaded'
        ],
        rollback: 'Disable hooks via environment variables, restore setup_state.json'
      },

      // Phase 3: Validation
      {
        name: 'Validation',
        estimatedHours: 4,
        parallelizable: false,
        tasks: [
          {
            id: 'validate-1',
            description: 'Run integration test suite against conductor-main',
            required: true,
            dependsOn: [],
            checkpoint: true,
            validation: 'All integration tests pass'
          },
          {
            id: 'validate-2',
            description: 'Verify all existing workflows still function',
            required: true,
            dependsOn: ['validate-1']
          },
          {
            id: 'validate-3',
            description: 'Test new capabilities (analytics, adaptive questioning)',
            required: true,
            dependsOn: []
          },
          {
            id: 'validate-4',
            description: 'Performance benchmark comparison',
            required: true,
            dependsOn: []
          }
        ],
        successCriteria: [
          'All integration tests pass',
          'No regressions in existing tests',
          'Performance within targets',
          'User acceptance tests pass'
        ],
        rollback: 'Disable all hooks, restore backups'
      },

      // Phase 4: Documentation
      {
        name: 'Documentation',
        estimatedHours: 2,
        parallelizable: true,
        tasks: [
          {
            id: 'doc-1',
            description: 'Update README with Agent-Studio references',
            required: true,
            dependsOn: []
          },
          {
            id: 'doc-2',
            description: 'Create migration guide for team',
            required: true,
            dependsOn: []
          },
          {
            id: 'doc-3',
            description: 'Document rollback procedures',
            required: true,
            dependsOn: []
          }
        ],
        successCriteria: [
          'README updated',
          'Migration guide created',
          'Rollback procedures documented'
        ],
        rollback: 'Revert documentation changes'
      }
    ];
  }
}

module.exports = { MigrationStrategy };
