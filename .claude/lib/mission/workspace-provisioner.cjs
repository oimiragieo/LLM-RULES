'use strict';

/**
 * Mission Workspace Provisioner
 *
 * Creates UUID-based isolated workspace directories for missions.
 * Scaffolds the canonical Factory Droid-aligned mission bundle:
 *
 * missions/<uuid>/
 * ├── mission.md                    # Mission spec template
 * ├── AGENTS.md                     # Worker coding rules
 * ├── features.json                 # Typed feature backlog (DAG)
 * ├── state.json                    # Orchestrator state snapshot
 * ├── validation-contract.md        # VAL-* acceptance assertions
 * ├── validation-state.json         # VAL-* status ledger
 * ├── progress_log.jsonl            # Append-only orchestration events
 * ├── working_directory.txt         # Target workspace path
 * ├── manifest.json                 # Mission metadata
 * ├── artifacts/                    # General artifacts
 * ├── handoffs/                     # Worker handoff JSON files
 * ├── evidence/                     # Test output tied to VAL-* assertions
 * ├── verdicts/                     # Scrutiny review verdicts
 * ├── logs/                         # Mission logs
 * └── state/                        # State snapshots
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Current version of the workspace format
const WORKSPACE_VERSION = '2.0.0';

// Required subdirectories for each workspace
const REQUIRED_SUBDIRS = ['artifacts', 'handoffs', 'evidence', 'verdicts', 'logs', 'state'];

/**
 * Write JSON atomically via temp file + rename.
 * @param {string} filePath - Target file path
 * @param {object} data - JSON-serializable data
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Provision a new mission workspace with Factory Droid-aligned bundle layout.
 *
 * @param {Object} options - Provisioning options
 * @param {string} options.rootPath - Root directory for missions (default: process.cwd())
 * @param {string} [options.missionId] - Optional UUID for the mission (auto-generated if not provided)
 * @param {string} [options.workingDirectory] - Target code workspace path
 * @returns {Object} Metadata object with {missionId, workspacePath, createdAt}
 * @throws {Error} With code WORKSPACE_EXISTS if workspace for UUID already exists
 */
function provisionWorkspace(options = {}) {
  const { rootPath = process.cwd(), missionId, workingDirectory = '' } = options;

  // Generate or use provided mission ID
  const id = missionId || crypto.randomUUID();

  // Construct workspace path
  const workspacePath = path.join(rootPath, 'missions', id);

  // Check if workspace already exists
  if (fs.existsSync(workspacePath)) {
    const error = new Error(`Workspace already exists for mission ID: ${id}`);
    error.code = 'WORKSPACE_EXISTS';
    error.details = { missionId: id, workspacePath };
    throw error;
  }

  // Create workspace directory with parent directories recursively
  fs.mkdirSync(workspacePath, { recursive: true });

  // Create required subdirectories
  for (const subdir of REQUIRED_SUBDIRS) {
    const subdirPath = path.join(workspacePath, subdir);
    fs.mkdirSync(subdirPath, { recursive: true });
  }

  // Create timestamp
  const createdAt = new Date().toISOString();

  // Write manifest.json (backward compat)
  const manifest = {
    missionId: id,
    createdAt,
    version: WORKSPACE_VERSION,
  };
  atomicWriteJSON(path.join(workspacePath, 'manifest.json'), manifest);

  // Write features.json — empty backlog
  atomicWriteJSON(path.join(workspacePath, 'features.json'), { features: [] });

  // Write state.json — initial orchestrator state
  atomicWriteJSON(path.join(workspacePath, 'state.json'), {
    missionId: id,
    baseSessionId: id,
    state: 'pending',
    workingDirectory,
    currentFeatureId: null,
    currentWorkerSessionId: null,
    currentWorkerPid: null,
    workerSessionIds: [],
    completedFeatures: 0,
    totalFeatures: 0,
    milestonesWithValidationPlanned: [],
    lastReviewedHandoffCount: 0,
    createdAt,
    updatedAt: createdAt,
  });

  // Write validation-state.json — empty assertion ledger
  atomicWriteJSON(path.join(workspacePath, 'validation-state.json'), { assertions: {} });

  // Write mission.md — template
  const missionMd = `<!-- Agent: workspace-provisioner | Mission: ${id} | Created: ${createdAt} -->
# Mission: ${id}

## Objectives
- [ ] Define mission objectives here

## Anti-Goals
- Items explicitly out of scope

## Milestones
1. milestone-name — Description

## Environment
- Language/Runtime:
- Build:
- Testing:

## Non-Functional Requirements
- Cross-platform compatibility
`;
  fs.writeFileSync(path.join(workspacePath, 'mission.md'), missionMd, 'utf8');

  // Write AGENTS.md — worker guidelines template
  const agentsMd = `<!-- Agent: workspace-provisioner | Mission: ${id} | Created: ${createdAt} -->
# Agent Guidelines — ${id}

## Mission Boundaries (NEVER VIOLATE)
- Define off-limits areas here

## Coding Conventions
- Follow project coding standards
- TDD: write tests before implementation

## Validation Guidance
- Primary gate: test commands
- Secondary: lint and format checks
`;
  fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsMd, 'utf8');

  // Write validation-contract.md — acceptance assertions template
  const validationContract = `<!-- Agent: workspace-provisioner | Mission: ${id} | Created: ${createdAt} -->
# Validation Contract

Add VAL-* assertions below. Each assertion defines a testable acceptance criterion.

Format:
\`\`\`
### VAL-AREA-NNN: Assertion Title
Description of what must be true.
Evidence: command or file that proves it
\`\`\`

## Assertions

`;
  fs.writeFileSync(path.join(workspacePath, 'validation-contract.md'), validationContract, 'utf8');

  // Write working_directory.txt
  fs.writeFileSync(path.join(workspacePath, 'working_directory.txt'), workingDirectory, 'utf8');

  // Write empty progress_log.jsonl
  fs.writeFileSync(path.join(workspacePath, 'progress_log.jsonl'), '', 'utf8');

  // Return metadata object
  return {
    missionId: id,
    workspacePath,
    createdAt,
  };
}

module.exports = {
  provisionWorkspace,
  WORKSPACE_VERSION,
  REQUIRED_SUBDIRS,
};
