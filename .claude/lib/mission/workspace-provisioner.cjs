'use strict';

/**
 * Mission Workspace Provisioner
 *
 * Creates UUID-based isolated workspace directories for missions.
 * Each workspace has the structure: missions/<uuid>/ with subdirectories:
 * - artifacts/
 * - handoffs/
 * - logs/
 * - state/
 *
 * Also writes a manifest.json with mission metadata.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Current version of the workspace format
const WORKSPACE_VERSION = '1.0.0';

// Required subdirectories for each workspace
const REQUIRED_SUBDIRS = ['artifacts', 'handoffs', 'logs', 'state'];

/**
 * Provision a new mission workspace.
 *
 * @param {Object} options - Provisioning options
 * @param {string} options.rootPath - Root directory for missions (default: process.cwd())
 * @param {string} [options.missionId] - Optional UUID for the mission (auto-generated if not provided)
 * @returns {Object} Metadata object with {missionId, workspacePath, createdAt}
 * @throws {Error} With code WORKSPACE_EXISTS if workspace for UUID already exists
 */
function provisionWorkspace(options = {}) {
  const { rootPath = process.cwd(), missionId } = options;

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

  // Write manifest.json
  const manifest = {
    missionId: id,
    createdAt,
    version: WORKSPACE_VERSION,
  };

  const manifestPath = path.join(workspacePath, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

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
