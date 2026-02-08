#!/usr/bin/env node
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

// Resolve project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const GRAPH_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'artifact-graph.json');
const QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'integration-queue.jsonl'
);
const MAX_QUEUE_LINES = 500;
const ENFORCEMENT_MODE = process.env.INTEGRATION_ENFORCEMENT || 'warn';

/**
 * Check if TaskUpdate represents a creator completion
 * @param {Object} hookData - Parsed hook input data
 * @returns {Object} { match: boolean, creatorType?: string }
 */
function isCreatorCompletion(hookData) {
  const toolInput = hookData?.toolUse?.input || {};

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
 * Extract artifact ID from task metadata
 * @param {Object} hookData - Hook input data
 * @param {string} creatorType - Type of creator
 * @returns {string} Artifact ID
 */
function extractArtifactId(hookData, creatorType) {
  const toolInput = hookData?.toolUse?.input || {};

  // Method 1: Explicit artifactId in metadata
  if (toolInput.metadata?.artifactId) {
    return toolInput.metadata.artifactId;
  }

  // Method 2: Construct from metadata
  const artifactName = toolInput.metadata?.artifactName || 'unknown';
  return `${creatorType}:${artifactName}`;
}

/**
 * Append entry to integration queue
 * @param {string} artifactId - Artifact ID
 * @param {string} creatorType - Creator type
 * @param {string[]} gaps - Missing integrations
 */
function appendToQueue(artifactId, creatorType, gaps) {
  const entry = {
    timestamp: new Date().toISOString(),
    artifactId,
    creatorType,
    changeType: 'created',
    source: 'post-creation-integration.cjs',
    gaps,
    priority: 'P1',
    processed: false,
  };

  // Ensure queue directory exists
  const queueDir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  // Append to queue
  fs.appendFileSync(QUEUE_PATH, JSON.stringify(entry) + '\n', 'utf8');

  // Rotate if needed
  rotateQueue();
}

/**
 * Append entry to integration queue with impact report
 * @param {string} artifactId - Artifact ID
 * @param {string} creatorType - Creator type
 * @param {string[]} gaps - Missing integrations
 * @param {Object|null} impactReport - Ecosystem impact analysis report
 */
function appendToQueueWithImpact(artifactId, creatorType, gaps, impactReport) {
  const entry = {
    timestamp: new Date().toISOString(),
    artifactId,
    creatorType,
    changeType: 'created',
    source: 'post-creation-integration.cjs',
    gaps,
    priority: 'P1',
    processed: false,
    impactReport: impactReport || null,
  };

  // Ensure queue directory exists
  const queueDir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  // Append to queue
  fs.appendFileSync(QUEUE_PATH, JSON.stringify(entry) + '\n', 'utf8');

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
    const entries = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

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

/**
 * Format hook result
 * @param {Object} result - Result object
 * @returns {string} JSON string
 */
function formatResult(result) {
  return JSON.stringify(result);
}

/**
 * Process creator completion and queue integration check
 * @param {Object} hookData - Parsed hook input data
 * @returns {Promise<Object>} Result object
 */
async function processCreatorCompletion(hookData) {
  const toolName = hookData?.toolUse?.tool;
  const _toolInput = hookData?.toolUse?.input || {};

  // Only process TaskUpdate
  if (toolName !== 'TaskUpdate') {
    process.stderr.write('[post-creation-integration] Not a TaskUpdate, passing through\n');
    process.stdout.write(formatResult({ allow: true }));
    return { result: { allow: true } };
  }

  // Check if this is a creator completion
  const detection = isCreatorCompletion(hookData);
  if (!detection.match) {
    // Not a creator completion, allow and exit
    process.stdout.write(formatResult({ allow: true }));
    return { result: { allow: true } };
  }

  // Extract artifact ID
  const artifactId = extractArtifactId(hookData, detection.creatorType);

  // Extract artifact path from metadata
  const artifactPath = _toolInput.metadata?.artifactPath || artifactId;

  // Quick integration check (artifact-graph)
  const check = quickIntegrationCheck(artifactId, GRAPH_PATH);

  // Run ecosystem impact analysis
  const impactReport = runEcosystemImpactAnalysis(detection.creatorType, artifactPath);

  // Log to stderr
  process.stderr.write(
    `[post-creation-integration] Detected ${detection.creatorType} completion: ${artifactId}\n`
  );
  process.stderr.write(
    `[post-creation-integration] Integration status: ${check.status}, gaps: ${check.gaps.join(', ')}\n`
  );

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
  }

  // Determine if we should block based on enforcement mode
  const hasMustHaveGaps = check.gaps.length > 0 && check.status !== 'fully-integrated';
  const shouldBlock = ENFORCEMENT_MODE === 'block' && hasMustHaveGaps;

  const message =
    check.gaps.length > 0
      ? `⚠️ Artifact ${artifactId} has ${check.gaps.length} missing integration(s): ${check.gaps.join(', ')}. Queued for integration analysis.`
      : `✅ Artifact ${artifactId} appears fully integrated.`;

  if (shouldBlock) {
    process.stdout.write(formatResult({ allow: false, message: `BLOCKED: ${message}` }));
    return { result: { allow: false, message: `BLOCKED: ${message}` } };
  }

  // Allow by default (warn mode)
  process.stdout.write(formatResult({ allow: true, message }));
  return { result: { allow: true, message } };
}

/**
 * Parse hook input from stdin
 * @returns {Promise<Object>} Parsed hook data
 */
async function parseHookInputAsync() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse hook input: ${err.message}`));
      }
    });

    process.stdin.on('error', reject);
  });
}

/**
 * Main hook entry point (when run as script)
 */
async function main() {
  try {
    const hookData = await parseHookInputAsync();
    await processCreatorCompletion(hookData);
  } catch (error) {
    process.stderr.write(`Post-creation integration error: ${error.message}\n`);
    process.stdout.write(formatResult({ allow: true }));
    process.exit(0); // Fail open - don't block on errors
  }
}

// Export for testing
module.exports = {
  isCreatorCompletion,
  quickIntegrationCheck,
  extractArtifactId,
  appendToQueue,
  appendToQueueWithImpact,
  runEcosystemImpactAnalysis,
  rotateQueue,
  processCreatorCompletion,
  GRAPH_PATH,
  QUEUE_PATH,
};

// Run as script
if (require.main === module) {
  main();
}
