#!/usr/bin/env node
/* eslint-disable max-lines */
/**
 * Post-Creation Integration Hook (Phase 1.5 - Task #7)
 * =====================================================
 *
 * Detects when creator skills complete and queues integration analysis.
 *
 * Logic:
 * 1. Intercept TaskUpdate where status === "completed"
 * 2. Check if this is a creator completion (metadata.creatorType OR subject pattern)
 * 3. Extract artifact ID from metadata
 * 4. Quick integration check using artifact-graph.cjs
 * 5. If gaps found, append to integration-queue.jsonl
 * 6. Always return { allow: true } (advisory mode)
 *
 * Performance budget: < 100ms (synchronous graph operations)
 *
 * Trigger: PostToolUse on TaskUpdate
 * Mode: Advisory (never blocks)
 *
 * @module post-creation-integration
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  getToolName,
  getToolInput,
  formatResult: formatHookResult,
} = require('../../lib/utils/hook-input.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { DEFAULT_ARTIFACT_GRAPH_PATH } = require('../../lib/workflow/artifact-graph.cjs');
const { INTEGRATION_QUEUE_PATH } = require('../../lib/utils/path-constants.cjs');

const GRAPH_PATH = DEFAULT_ARTIFACT_GRAPH_PATH;
const QUEUE_PATH = INTEGRATION_QUEUE_PATH;
const MAX_QUEUE_LINES = 500;
const MAX_QUEUE_ENTRY_BYTES = 10 * 1024; // 10KB per JSONL line
const ENFORCEMENT_MODE = process.env.INTEGRATION_ENFORCEMENT || 'warn';
const MAX_IMPACT_ITEMS = 25;
const MAX_IMPACT_TEXT_CHARS = 240;
const QUALITY_PLACEHOLDER_PATTERNS = [/\bTODO\b/i, /\bTBD\b/i, /\bFIXME\b/i];
const QUALITY_RULES = Object.freeze({
  skill: {
    minLines: 50,
    requiredSections: [
      { pattern: /<identity>|##\s*identity/i, name: 'identity' },
      { pattern: /<capabilities>|##\s*capabilities/i, name: 'capabilities' },
      { pattern: /<instructions>|##\s*instructions/i, name: 'instructions' },
      { pattern: /##\s*Memory Protocol/i, name: 'Memory Protocol' },
    ],
  },
  agent: {
    minLines: 30,
    requiredSections: [
      { pattern: /##\s*Core Persona/i, name: 'Core Persona' },
      { pattern: /##\s*Workflow/i, name: 'Workflow' },
      { pattern: /##\s*Memory Protocol/i, name: 'Memory Protocol' },
    ],
  },
});

function stripFrontmatter(content) {
  return String(content || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function stripFencedCodeBlocks(content) {
  return String(content || '').replace(/```[\s\S]*?```/g, '');
}

function findQualityPlaceholders(content) {
  const issues = [];
  const lines = stripFencedCodeBlocks(stripFrontmatter(content)).split('\n');

  lines.forEach((line, index) => {
    QUALITY_PLACEHOLDER_PATTERNS.forEach(pattern => {
      if (pattern.test(line)) {
        issues.push(`Placeholder "${pattern.source.replace(/\\b/g, '')}" found on line ${index + 1}`);
      }
    });
  });

  return issues;
}

function validateArtifactQuality(artifactType, artifactPath) {
  const rules = QUALITY_RULES[artifactType];
  if (!rules) {
    return {
      valid: true,
      issues: [],
      lineCount: 0,
      artifactType,
      skipped: true,
      reason: `No quality rules configured for ${artifactType}`,
    };
  }

  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return {
      valid: false,
      issues: [`Artifact file not found: ${artifactPath}`],
      lineCount: 0,
      artifactType,
    };
  }

  const content = fs.readFileSync(artifactPath, 'utf8');
  const lineCount = content.split('\n').length;
  const issues = [...findQualityPlaceholders(content)];

  if (lineCount < rules.minLines) {
    issues.push(
      `${artifactType} content must be at least ${rules.minLines} lines (found ${lineCount}).`
    );
  }

  for (const section of rules.requiredSections) {
    if (!section.pattern.test(content)) {
      issues.push(`Missing required section: ${section.name}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    lineCount,
    artifactType,
    artifactPath,
  };
}

/**
 * Check if TaskUpdate represents a creator completion
 * @param {Object} hookData - Parsed hook input data
 * @returns {Object} { match: boolean, creatorType?: string }
 */
function isCreatorCompletion(hookData) {
  const toolInput = getToolInput(hookData);

  // Must be completed status
  if (toolInput.status !== 'completed') {
    return { match: false };
  }

  // Method 1: Check metadata for creator type
  if (toolInput.metadata?.creatorType) {
    return { match: true, creatorType: toolInput.metadata.creatorType };
  }

  // Method 2: Pattern match on task subject/description
  const text = (toolInput.metadata?.summary || '') + ' ' + (toolInput.metadata?.subject || '');

  const creatorPatterns = [
    { pattern: /creat(e|ed|ing)\s+(new\s+)?skill/i, type: 'skill' },
    { pattern: /creat(e|ed|ing)\s+(new\s+)?agent/i, type: 'agent' },
    { pattern: /creat(e|ed|ing)\s+(new\s+)?hook/i, type: 'hook' },
    { pattern: /creat(e|ed|ing)\s+(new\s+)?workflow/i, type: 'workflow' },
    { pattern: /creat(e|ed|ing)\s+(new\s+)?template/i, type: 'template' },
    { pattern: /creat(e|ed|ing)\s+(new\s+)?schema/i, type: 'schema' },
    {
      pattern:
        /skill-creator|agent-creator|hook-creator|workflow-creator|template-creator|schema-creator/i,
      type: 'unknown',
    },
  ];

  for (const { pattern, type } of creatorPatterns) {
    if (pattern.test(text)) {
      return { match: true, creatorType: type };
    }
  }

  return { match: false };
}

/**
 * Quick integration check using artifact-graph.cjs
 * @param {string} artifactId - Artifact ID
 * @param {string} graphPath - Path to graph file
 * @returns {Object} { gaps: string[], status: string, score?: number }
 */
function quickIntegrationCheck(artifactId, graphPath) {
  try {
    // Check if graph file exists
    if (!fs.existsSync(graphPath)) {
      return { gaps: ['graph-unavailable'], status: 'unknown' };
    }

    const { ArtifactGraph } = require('../../lib/workflow/artifact-graph.cjs');
    const graph = new ArtifactGraph(graphPath);

    // Check if node exists in graph
    const node = graph.getNode(artifactId);
    if (!node) {
      return { gaps: ['not-in-graph'], status: 'unknown' };
    }

    const result = graph.isFullyIntegrated(artifactId);
    if (!result) {
      return { gaps: ['not-in-graph'], status: 'unknown' };
    }

    return {
      gaps: result.missing || [],
      status: result.integrated ? 'fully-integrated' : 'partially-integrated',
      score: result.score,
    };
  } catch (_err) {
    // Graceful degradation if graph not available
    return { gaps: ['graph-unavailable'], status: 'unknown' };
  }
}

/**
 * Run ecosystem impact analysis using ecosystem-impact-analyzer.cjs
 * @param {string} creatorType - Type of creator (skill, agent, hook, etc.)
 * @param {string} artifactPath - Path to created artifact
 * @returns {Object|null} Impact analysis report or null if unavailable
 */
function runEcosystemImpactAnalysis(creatorType, artifactPath) {
  try {
    const impactAnalyzer = require('../../lib/creators/ecosystem-impact-analyzer.cjs');
    const report = impactAnalyzer.analyzeImpact(creatorType, artifactPath);
    return report;
  } catch (_err) {
    // Graceful degradation if analyzer not available
    return null;
  }
}

/**
 * Run ecosystem impact analysis with timeout observability.
 * Returns a timedOut flag so callers can record degraded behavior.
 *
 * @param {string} creatorType
 * @param {string} artifactPath
 * @param {Object} [options]
 * @param {Function} [options.analyzer] - Override analyzer implementation for tests
 * @param {number} [options.timeoutMs] - Timeout budget in milliseconds
 * @param {Function} [options.log] - Logger function (defaults to stderr)
 * @returns {Promise<{report: Object|null, timedOut: boolean}>}
 */
async function runEcosystemImpactAnalysisWithTimeout(creatorType, artifactPath, options = {}) {
  const timeoutMs = Number(
    options.timeoutMs || process.env.POST_CREATION_INTEGRATION_TIMEOUT_MS || 5000
  );
  const analyzer = options.analyzer || runEcosystemImpactAnalysis;
  const log =
    typeof options.log === 'function'
      ? options.log
      : message => process.stderr.write(`[post-creation-integration] ${message}\n`);

  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  let timer = null;
  try {
    const report = await Promise.race([
      Promise.resolve(analyzer(creatorType, artifactPath)),
      new Promise(resolve => {
        timer = setTimeout(() => resolve('__TIMEOUT__'), timeout);
      }),
    ]);
    if (report === '__TIMEOUT__') {
      log(`Skipped due to timeout (${timeout}ms): ecosystem impact analysis`);
      return { report: null, timedOut: true };
    }
    return { report: report || null, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extract artifact ID from task metadata
 * @param {Object} hookData - Hook input data
 * @param {string} creatorType - Type of creator
 * @returns {string} Artifact ID
 */
function extractArtifactId(hookData, creatorType) {
  const toolInput = getToolInput(hookData);

  // Method 1: Explicit artifactId in metadata
  if (toolInput.metadata?.artifactId) {
    return toolInput.metadata.artifactId;
  }

  // Method 2: Construct from metadata
  const artifactName = toolInput.metadata?.artifactName || 'unknown';
  return `${creatorType}:${artifactName}`;
}

/**
 * Append entry to integration queue with impact report
 * @param {string} artifactId - Artifact ID
 * @param {string} creatorType - Creator type
 * @param {string[]} gaps - Missing integrations
 * @param {Object|null} impactReport - Ecosystem impact analysis report
 */
function appendToQueueWithImpact(artifactId, creatorType, gaps, impactReport) {
  const sanitizedImpact = sanitizeImpactReport(impactReport);
  const entry = {
    timestamp: new Date().toISOString(),
    artifactId,
    creatorType,
    changeType: 'created',
    source: 'post-creation-integration.cjs',
    gaps,
    priority: 'P1',
    processed: false,
    impactReport: sanitizedImpact.impactReport,
  };
  if (sanitizedImpact.impactReportInvalid) {
    entry.impactReportInvalid = true;
  }
  if (sanitizedImpact.impactReportSanitized) {
    entry.impactReportSanitized = true;
  }

  // Ensure queue directory exists
  const queueDir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  // Append to queue
  const serialized = serializeQueueEntryWithCap(entry);
  fs.appendFileSync(QUEUE_PATH, serialized + '\n', 'utf8');

  // Rotate if needed
  rotateQueue();
}

/**
 * Rotate queue if it exceeds MAX_QUEUE_LINES
 * Trims oldest 100 processed entries
 */
function rotateQueue() {
  try {
    if (!fs.existsSync(QUEUE_PATH)) {
      return;
    }

    const content = fs.readFileSync(QUEUE_PATH, 'utf8');
    const lines = content
      .trim()
      .split('\n')
      .filter(line => line.trim());

    if (lines.length <= MAX_QUEUE_LINES) {
      return; // No rotation needed
    }

    // Parse all entries
    const entries = lines.map(line => safeParseJSON(line, null)).filter(Boolean);

    // Keep: all unprocessed + most recent processed (up to limit)
    const unprocessed = entries.filter(e => !e.processed);
    const processed = entries.filter(e => e.processed);

    // If rotation would delete unprocessed entries, skip rotation
    if (unprocessed.length > MAX_QUEUE_LINES) {
      return; // All entries are unprocessed, don't rotate
    }

    // Keep most recent processed (trimming from oldest)
    const trimCount = Math.min(100, processed.length);
    const keptProcessed = processed.slice(trimCount);

    // Combine and write
    const kept = [...unprocessed, ...keptProcessed];
    const newContent = kept.map(e => JSON.stringify(e)).join('\n') + '\n';

    fs.writeFileSync(QUEUE_PATH, newContent, 'utf8');
  } catch (err) {
    // Fail silently - rotation is optimization, not critical
    process.stderr.write(`[post-creation-integration] Queue rotation failed: ${err.message}\n`);
  }
}

function clipText(value, maxChars = MAX_IMPACT_TEXT_CHARS) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars - 3) + '...';
}

function sanitizeImpactItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const safe = {
    id: clipText(item.id, 120),
    status: clipText(item.status, 40),
    description: clipText(item.description, MAX_IMPACT_TEXT_CHARS),
  };

  if (!safe.id && !safe.status && !safe.description) {
    return null;
  }

  return safe;
}

function sanitizeImpactReport(impactReport) {
  if (impactReport == null) {
    return {
      impactReport: null,
      impactReportInvalid: false,
      impactReportSanitized: false,
    };
  }

  if (typeof impactReport !== 'object' || Array.isArray(impactReport)) {
    return {
      impactReport: null,
      impactReportInvalid: true,
      impactReportSanitized: true,
    };
  }

  const mustHaveRaw = Array.isArray(impactReport.mustHave) ? impactReport.mustHave : [];
  const shouldHaveRaw = Array.isArray(impactReport.shouldHave) ? impactReport.shouldHave : [];

  const mustHave = mustHaveRaw.map(sanitizeImpactItem).filter(Boolean).slice(0, MAX_IMPACT_ITEMS);
  const shouldHave = shouldHaveRaw
    .map(sanitizeImpactItem)
    .filter(Boolean)
    .slice(0, MAX_IMPACT_ITEMS);

  const safeReport = {
    mustHave,
    shouldHave,
    mustHaveCount: mustHaveRaw.length,
    shouldHaveCount: shouldHaveRaw.length,
  };

  const score = Number(impactReport.score);
  if (Number.isFinite(score)) {
    safeReport.score = score;
  }

  const status = clipText(impactReport.status, 80);
  if (status) {
    safeReport.status = status;
  }

  const wasSanitized =
    mustHave.length !== mustHaveRaw.length ||
    shouldHave.length !== shouldHaveRaw.length ||
    Object.keys(impactReport).length > Object.keys(safeReport).length;

  return {
    impactReport: safeReport,
    impactReportInvalid: false,
    impactReportSanitized: wasSanitized,
  };
}

function serializeQueueEntryWithCap(entry) {
  const initialSerialized = JSON.stringify(entry);
  if (Buffer.byteLength(initialSerialized, 'utf8') <= MAX_QUEUE_ENTRY_BYTES) {
    return initialSerialized;
  }

  // First fallback: compact impact report to summary counters.
  const compact = { ...entry };
  if (compact.impactReport) {
    const mustHaveCount = Number(compact.impactReport.mustHaveCount) || 0;
    const shouldHaveCount = Number(compact.impactReport.shouldHaveCount) || 0;
    compact.impactReport = {
      mustHaveCount,
      shouldHaveCount,
      truncated: true,
    };
    compact.impactReportTruncated = true;
  }

  let serialized = JSON.stringify(compact);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_QUEUE_ENTRY_BYTES) {
    return serialized;
  }

  // Second fallback: omit impact report entirely.
  compact.impactReport = null;
  compact.impactReportOmitted = true;
  serialized = JSON.stringify(compact);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_QUEUE_ENTRY_BYTES) {
    return serialized;
  }

  // Final fallback: minimal shape with clipped values.
  const minimal = {
    timestamp: entry.timestamp || new Date().toISOString(),
    artifactId: clipText(entry.artifactId, 128) || 'unknown',
    creatorType: clipText(entry.creatorType, 64) || 'unknown',
    changeType: clipText(entry.changeType, 32) || 'created',
    source: 'post-creation-integration.cjs',
    gaps: Array.isArray(entry.gaps) ? entry.gaps.map(g => clipText(g, 80)).slice(0, 10) : [],
    priority: clipText(entry.priority, 8) || 'P1',
    processed: Boolean(entry.processed),
    impactReport: null,
    impactReportOmitted: true,
    entryTruncated: true,
  };

  serialized = JSON.stringify(minimal);
  while (Buffer.byteLength(serialized, 'utf8') > MAX_QUEUE_ENTRY_BYTES && minimal.gaps.length > 0) {
    minimal.gaps.pop();
    serialized = JSON.stringify(minimal);
  }

  return serialized;
}

/**
 * Process creator completion and queue integration check
 * @param {Object} hookData - Parsed hook input data
 * @returns {Promise<Object>} Result object
 */
async function processCreatorCompletion(hookData) {
  const toolName = getToolName(hookData);
  const toolInput = getToolInput(hookData);

  // This hook is registered for PostToolUse TaskUpdate only.
  // Write/Edit handlers were removed (dead code) since this hook
  // never receives Write or Edit events per settings.json registration.
  if (toolName !== 'TaskUpdate') {
    process.stderr.write('[post-creation-integration] Not a TaskUpdate, passing through\n');
    process.stdout.write(formatHookResult({ allow: true }));
    return { result: { allow: true } };
  }

  // Check if this is a creator completion
  const detection = isCreatorCompletion(hookData);
  if (!detection.match) {
    // Not a creator completion, allow and exit
    process.stdout.write(formatHookResult({ allow: true }));
    return { result: { allow: true } };
  }

  // Extract artifact ID
  const artifactId = extractArtifactId(hookData, detection.creatorType);

  // Guard: skip queue write if artifact ID is unresolvable (unknown:unknown pattern).
  // This prevents noise entries from TaskUpdate completions that match creator
  // patterns but carry no artifact metadata.
  const idParts = artifactId.split(':');
  const hasUnknownId =
    artifactId === 'unknown:unknown' ||
    (idParts.length === 2 && idParts[0] === 'unknown' && idParts[1] === 'unknown');
  if (hasUnknownId) {
    process.stderr.write(
      `[post-creation-integration] Skipping queue write: artifactId resolved to "${artifactId}" (no artifact metadata in task completion). Detected creatorType="${detection.creatorType}". Ensure creator tasks include metadata.artifactId or metadata.artifactName.\n`
    );
    process.stdout.write(formatHookResult({ allow: true }));
    return { result: { allow: true } };
  }

  // Extract artifact path from metadata
  const artifactPath = toolInput.metadata?.artifactPath || artifactId;
  const qualityValidation =
    detection.creatorType === 'skill' || detection.creatorType === 'agent'
      ? validateArtifactQuality(detection.creatorType, artifactPath)
      : { valid: true, issues: [], skipped: true };

  // Quick integration check (artifact-graph)
  const check = quickIntegrationCheck(artifactId, GRAPH_PATH);

  // Run ecosystem impact analysis
  const impactResult = await runEcosystemImpactAnalysisWithTimeout(
    detection.creatorType,
    artifactPath
  );
  const impactReport = impactResult.report;

  // Log to stderr
  process.stderr.write(
    `[post-creation-integration] Detected ${detection.creatorType} completion: ${artifactId}\n`
  );
  process.stderr.write(
    `[post-creation-integration] Integration status: ${check.status}, gaps: ${check.gaps.join(', ')}\n`
  );
  if (!qualityValidation.valid) {
    process.stderr.write(
      `[post-creation-integration] Quality validation failed: ${qualityValidation.issues.join(' | ')}\n`
    );
  }

  if (impactReport) {
    const mustHavePending = impactReport.mustHave.filter(item => item.status === 'pending');
    process.stderr.write(
      `[post-creation-integration] Ecosystem impact: ${mustHavePending.length}/${impactReport.mustHave.length} mustHave items pending\n`
    );
  }

  // Queue if gaps found
  if (check.gaps.length > 0 && check.status !== 'fully-integrated') {
    // Include impact report in queue entry
    appendToQueueWithImpact(artifactId, detection.creatorType, check.gaps, impactReport);
    process.stderr.write('[post-creation-integration] Queued for integration analysis\n');

    // C-003 FIX: Auto-spawn artifact-integrator at threshold
    const INTEGRATION_BATCH_SIZE = Number(process.env.INTEGRATION_BATCH_SIZE || 5);
    try {
      const {
        getQueueSize,
        spawnArtifactIntegrator,
      } = require('../../lib/workflow/artifact-integrator-spawner.cjs');
      const queueSize = getQueueSize(QUEUE_PATH);

      if (queueSize >= INTEGRATION_BATCH_SIZE) {
        process.stderr.write(
          `[post-creation-integration] Queue size ${queueSize} ≥ threshold ${INTEGRATION_BATCH_SIZE}, auto-spawning artifact-integrator\n`
        );
        spawnArtifactIntegrator({
          mode: 'batch',
          maxEntries: queueSize,
          background: true,
        }).catch(err => {
          process.stderr.write(
            `[post-creation-integration] Failed to auto-spawn artifact-integrator: ${err.message}\n`
          );
        });
      }
    } catch (spawnErr) {
      process.stderr.write(
        `[post-creation-integration] Auto-spawn failed (non-blocking): ${spawnErr.message}\n`
      );
    }
  }

  // Determine if we should block based on enforcement mode
  const hasMustHaveGaps = check.gaps.length > 0 && check.status !== 'fully-integrated';
  const hasQualityIssues = qualityValidation.valid === false;
  const shouldBlock = ENFORCEMENT_MODE === 'block' && (hasMustHaveGaps || hasQualityIssues);

  const messageParts = [];
  if (check.gaps.length > 0) {
    messageParts.push(
      `Artifact ${artifactId} has ${check.gaps.length} missing integration(s): ${check.gaps.join(', ')}. Queued for integration analysis.`
    );
  } else {
    messageParts.push(`Artifact ${artifactId} appears fully integrated.`);
  }
  if (hasQualityIssues) {
    messageParts.push(
      `Quality validation failed: ${qualityValidation.issues.join(' | ')}`
    );
  }
  const message = `${hasMustHaveGaps || hasQualityIssues ? '⚠️' : '✅'} ${messageParts.join(' ')}`;

  if (shouldBlock) {
    process.stdout.write(formatHookResult({ allow: false, message: `BLOCKED: ${message}` }));
    return { result: { allow: false, message: `BLOCKED: ${message}` } };
  }

  // Allow by default (warn mode)
  process.stdout.write(formatHookResult({ allow: true, message }));
  return { result: { allow: true, message, qualityValidation } };
}

/**
 * Parse hook input from stdin
 * @returns {Promise<Object>} Parsed hook data
 */
async function parseHookInputAsync() {
  const { parseHookInputAsync: unifiedParser } = require('../../lib/utils/hook-input.cjs');
  return unifiedParser({ timeout: 300 });
}

/**
 * Main hook entry point (when run as script)
 */
async function main() {
  try {
    const hookData = await parseHookInputAsync();
    if (!hookData) {
      process.exit(0);
    }
    await processCreatorCompletion(hookData);
  } catch (error) {
    process.stderr.write(`Post-creation integration error: ${error.message}\n`);
    process.stdout.write(formatHookResult({ allow: true }));
    process.exit(0); // Fail open - don't block on errors
  }
}

module.exports = {
  isCreatorCompletion,
  quickIntegrationCheck,
  runEcosystemImpactAnalysis,
  runEcosystemImpactAnalysisWithTimeout,
  validateArtifactQuality,
  extractArtifactId,
  sanitizeImpactReport,
  serializeQueueEntryWithCap,
  appendToQueueWithImpact,
  rotateQueue,
  processCreatorCompletion,
  parseHookInputAsync,
  main,
  QUEUE_PATH,
  GRAPH_PATH,
  MAX_QUEUE_ENTRY_BYTES,
};

if (require.main === module) {
  main();
}
