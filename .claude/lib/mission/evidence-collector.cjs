'use strict';

/**
 * Mission Evidence Collector
 *
 * Runs verification steps from features.json and captures evidence
 * tied to VAL-* assertion IDs. Evidence files follow Factory Droid
 * naming: evidence/<milestone>/VAL-<AREA>-<NNN>-<slug>.txt
 *
 * Also provides a gate check: can a feature transition to completed
 * if required evidence files exist?
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * Slugify a VAL-* ID for use in filenames.
 * @param {string} valId - e.g. "VAL-MEM-001"
 * @returns {string} - e.g. "val-mem-001"
 */
function slugifyValId(valId) {
  return valId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Run a verification command and capture output.
 * @param {string} command - Shell command to execute
 * @param {string} workingDirectory - Directory to run in
 * @param {number} [timeoutMs=30000] - Timeout in milliseconds
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runVerificationStep(command, workingDirectory, timeoutMs = 30000) {
  try {
    const stdout = execSync(command, {
      cwd: workingDirectory,
      timeout: timeoutMs,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout || '', stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

/**
 * Collect evidence for a single feature.
 * Runs each verificationStep and writes evidence files for each fulfills VAL-* ID.
 *
 * @param {object} options
 * @param {object} options.feature - Feature object from features.json
 * @param {string} options.evidenceDir - Base evidence directory
 * @param {string} options.workingDirectory - Target repo path
 * @param {number} [options.timeoutMs=30000] - Per-step timeout
 * @returns {{ results: Array<{ command: string, exitCode: number, observation: string }>, evidenceFiles: string[] }}
 */
function collectFeatureEvidence(options) {
  const { feature, evidenceDir, workingDirectory, timeoutMs = 30000 } = options;
  const milestone = feature.milestone || 'default';
  const milestoneDir = path.join(evidenceDir, milestone);

  if (!fs.existsSync(milestoneDir)) {
    fs.mkdirSync(milestoneDir, { recursive: true });
  }

  const results = [];
  const evidenceFiles = [];
  const allOutput = [];

  // Run each verification step
  for (const step of feature.verificationSteps || []) {
    if (!step || !step.trim()) continue;

    const result = runVerificationStep(step, workingDirectory, timeoutMs);
    const observation = result.exitCode === 0 ? `PASS (exit 0)` : `FAIL (exit ${result.exitCode})`;

    results.push({
      command: step,
      exitCode: result.exitCode,
      observation,
    });

    allOutput.push(`=== Command: ${step} ===`);
    allOutput.push(`Exit Code: ${result.exitCode}`);
    if (result.stdout) allOutput.push(`--- stdout ---\n${result.stdout}`);
    if (result.stderr) allOutput.push(`--- stderr ---\n${result.stderr}`);
    allOutput.push('');
  }

  // Write evidence files for each fulfilled VAL-* assertion
  const combinedOutput = allOutput.join('\n');
  for (const valId of feature.fulfills || []) {
    const slug = slugifyValId(valId);
    const featureSlug = (feature.id || 'unknown').replace(/[^a-z0-9-]/g, '-');
    const filename = `${slug}-${featureSlug}.txt`;
    const filePath = path.join(milestoneDir, filename);

    const content = [
      `Evidence for ${valId}`,
      `Feature: ${feature.id}`,
      `Milestone: ${milestone}`,
      `Collected: ${new Date().toISOString()}`,
      `---`,
      combinedOutput,
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
    evidenceFiles.push(filePath);
  }

  return { results, evidenceFiles };
}

/**
 * Check if all required evidence files exist for a feature.
 * Used as a gate before transitioning from validating → completed.
 *
 * @param {object} feature - Feature object from features.json
 * @param {string} evidenceDir - Base evidence directory
 * @returns {{ hasEvidence: boolean, missing: string[] }}
 */
function checkEvidenceExists(feature, evidenceDir) {
  const milestone = feature.milestone || 'default';
  const milestoneDir = path.join(evidenceDir, milestone);
  const missing = [];

  for (const valId of feature.fulfills || []) {
    const slug = slugifyValId(valId);
    const featureSlug = (feature.id || 'unknown').replace(/[^a-z0-9-]/g, '-');
    const filename = `${slug}-${featureSlug}.txt`;
    const filePath = path.join(milestoneDir, filename);

    if (!fs.existsSync(filePath)) {
      missing.push(valId);
    }
  }

  return {
    hasEvidence: missing.length === 0,
    missing,
  };
}

/**
 * Collect evidence for all features in a mission.
 *
 * @param {object} options
 * @param {string} options.featuresPath - Path to features.json
 * @param {string} options.evidenceDir - Base evidence directory
 * @param {string} options.workingDirectory - Target repo path
 * @param {string} [options.milestone] - Optional milestone filter
 * @returns {{ featureResults: object[], totalEvidence: number }}
 */
function collectMissionEvidence(options) {
  const { featuresPath, evidenceDir, workingDirectory, milestone } = options;

  const content = fs.readFileSync(featuresPath, 'utf8');
  const { features } = JSON.parse(content);

  const featureResults = [];
  let totalEvidence = 0;

  for (const feature of features) {
    if (milestone && feature.milestone !== milestone) continue;
    if (feature.status !== 'completed' && feature.status !== 'validating') continue;

    const result = collectFeatureEvidence({
      feature,
      evidenceDir,
      workingDirectory,
    });

    featureResults.push({
      featureId: feature.id,
      milestone: feature.milestone,
      ...result,
    });

    totalEvidence += result.evidenceFiles.length;
  }

  return { featureResults, totalEvidence };
}

module.exports = {
  collectFeatureEvidence,
  collectMissionEvidence,
  checkEvidenceExists,
  runVerificationStep,
  slugifyValId,
};
