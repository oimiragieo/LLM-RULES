#!/usr/bin/env node
/**
 * Setup Runner — Shared Utility for Skill Dependency Checks
 * ==========================================================
 *
 * Provides `checkDependency` and `runSetupCheck` for verifying that
 * external tools required by a skill are available on the host system.
 *
 * Dependencies are declared in each skill's `manifest.json`:
 *   { "setup": { "dependencies": [ { "tool": "node", "type": "runtime", "optional": false } ] } }
 *
 * Security: uses execFileSync with shell: false (array args) — no shell injection possible.
 *
 * @module setup-runner
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Check whether a single external tool is available and meets a minimum version.
 *
 * Uses `execFileSync` with `shell: false` (SE-02 / security.md requirement).
 *
 * @param {Object} dep - Dependency descriptor
 * @param {string} dep.tool - Executable name (e.g. 'node', 'pnpm', 'docker')
 * @param {string} [dep.minVersion] - Optional semver floor (e.g. '22.0.0')
 * @param {string} [dep.type] - 'runtime' | 'tool' | 'service' (informational only)
 * @returns {{ available: boolean, version: string|null, meetsMin: boolean }}
 */
function checkDependency(dep) {
  if (!dep || typeof dep.tool !== 'string' || dep.tool.trim() === '') {
    return { available: false, version: null, meetsMin: false };
  }

  try {
    // shell: false — no metacharacter injection possible
    const raw = execFileSync(dep.tool, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      shell: false,
    }).trim();

    const meetsMin = dep.minVersion ? _versionSatisfies(raw, dep.minVersion) : true;
    return { available: true, version: raw, meetsMin };
  } catch (_err) {
    return { available: false, version: null, meetsMin: false };
  }
}

/**
 * Run a full setup check for a skill directory.
 *
 * Reads `manifest.json` from `skillDir`, checks each dependency in
 * `setup.dependencies`, and returns a structured readiness report.
 *
 * @param {string} skillDir - Absolute path to the skill directory
 * @returns {{ ready: boolean, missing: string[], warnings: string[] }}
 */
function runSetupCheck(skillDir) {
  const manifestPath = path.join(skillDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return {
      ready: true,
      missing: [],
      warnings: ['No manifest.json found — skipping dependency check'],
    };
  }

  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch (err) {
    return {
      ready: false,
      missing: [],
      warnings: [`Failed to parse manifest.json: ${err.message}`],
    };
  }

  const deps = manifest && manifest.setup && Array.isArray(manifest.setup.dependencies)
    ? manifest.setup.dependencies
    : [];

  const missing = [];
  const warnings = [];

  for (const dep of deps) {
    const result = checkDependency(dep);

    if (!result.available) {
      if (dep.optional) {
        warnings.push(`Optional tool not found: ${dep.tool}`);
      } else {
        missing.push(`Required tool not found: ${dep.tool}`);
      }
    } else if (!result.meetsMin && dep.minVersion) {
      const msg = `Tool ${dep.tool} found (${result.version}) but does not meet minimum ${dep.minVersion}`;
      if (dep.optional) {
        warnings.push(msg);
      } else {
        missing.push(msg);
      }
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Naive version comparison: parse first semver-like token from stdout and compare.
 * Returns true if actual >= minimum.
 *
 * @param {string} versionOutput - Raw stdout from `tool --version`
 * @param {string} minVersion - Semver floor string e.g. '22.0.0'
 * @returns {boolean}
 */
function _versionSatisfies(versionOutput, minVersion) {
  try {
    const match = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
    const minMatch = minVersion.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match || !minMatch) return true; // Can't compare — assume OK

    const [, aMaj, aMin, aPatch] = match.map(Number);
    const [, bMaj, bMin, bPatch] = minMatch.map(Number);

    if (aMaj !== bMaj) return aMaj > bMaj;
    if (aMin !== bMin) return aMin > bMin;
    return aPatch >= bPatch;
  } catch (_e) {
    return true; // Can't parse — assume OK
  }
}

module.exports = { checkDependency, runSetupCheck };
