#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_RELATIVE_PATH = path.join('.claude', 'context', 'runtime', 'evolution-requests.jsonl');
const REGISTRY_RELATIVE_PATH = path.join('.claude', 'context', 'agent-registry.json');

// Enterprise bundle validation/scaffolding
let validateEnterpriseBundle;
let scaffoldMissingComponents;
try {
  ({ validateEnterpriseBundle } = require('../../lib/creators/enterprise-bundle-validator.cjs'));
  ({ scaffoldMissingComponents } = require('../../lib/creators/enterprise-bundle-scaffolder.cjs'));
} catch {
  // Graceful degradation if modules not yet available
  validateEnterpriseBundle = null;
  scaffoldMissingComponents = null;
}

// Cascade entry writer
let writeCascadeEntries;
try {
  ({ writeCascadeEntries } = require('../../lib/creators/cascade-entry-writer.cjs'));
} catch {
  writeCascadeEntries = null;
}

// ---------------------------------------------------------------------------
// Frontmatter Parsing
// ---------------------------------------------------------------------------

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Returns an object with extracted key-value pairs.
 *
 * @param {string} content - Full SKILL.md content
 * @returns {{ tools: string[], description: string }}
 */
function parseFrontmatter(content) {
  const result = { tools: [], description: '' };
  if (!content || typeof content !== 'string') return result;

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return result;

  const fmBlock = fmMatch[1];

  // Extract tools array: tools: [Read, Write, Bash]
  const toolsMatch = fmBlock.match(/^tools:\s*\[([^\]]*)\]/m);
  if (toolsMatch) {
    result.tools = toolsMatch[1]
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  // Extract description
  const descMatch = fmBlock.match(/^description:\s*(.+)$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Similarity Heuristic
// ---------------------------------------------------------------------------

/**
 * Simple word-set Jaccard similarity between two strings.
 * Returns a number between 0 (completely different) and 1 (identical).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function wordSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

// Domain-change threshold: if Jaccard similarity is below this, we flag domain change.
const DOMAIN_CHANGE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Read evolution requests from the JSONL queue file.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Array<Object>} Parsed request objects
 */
function readEvolutionRequests(projectRoot) {
  const queuePath = path.join(projectRoot, QUEUE_RELATIVE_PATH);
  if (!fs.existsSync(queuePath)) return [];

  const raw = fs.readFileSync(queuePath, 'utf8');
  if (!raw.trim()) return [];

  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return safeParseJSON(line, null, null, null);
      } catch {
        return null;
      }
    })
    .filter(entry => entry && typeof entry === 'object');
}

/**
 * Filter requests to only stale_skill trigger entries.
 *
 * @param {Array<Object>} requests
 * @returns {Array<Object>}
 */
function filterStaleSkillRequests(requests) {
  return requests.filter(r => String(r.trigger || '') === 'stale_skill');
}

/**
 * Detect changes between before and after SKILL.md content.
 *
 * @param {string} beforeContent - SKILL.md content before update
 * @param {string} afterContent  - SKILL.md content after update
 * @returns {{ toolsChanged: boolean, domainChanged: boolean, newTools: string[], removedTools: string[] }}
 */
function detectChanges(beforeContent, afterContent) {
  const before = parseFrontmatter(beforeContent);
  const after = parseFrontmatter(afterContent);

  // Tool diff
  const beforeSet = new Set(before.tools);
  const afterSet = new Set(after.tools);

  const newTools = after.tools.filter(t => !beforeSet.has(t));
  const removedTools = before.tools.filter(t => !afterSet.has(t));
  const toolsChanged = newTools.length > 0 || removedTools.length > 0;

  // Domain change detection via description similarity
  const similarity = wordSimilarity(before.description, after.description);
  const domainChanged = similarity < DOMAIN_CHANGE_THRESHOLD;

  return { toolsChanged, domainChanged, newTools, removedTools };
}

/**
 * Find all agents that have a given skill assigned in the agent registry.
 *
 * @param {string} skillName - The skill name to search for
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {string[]} Array of agent names
 */
function findAssignedAgents(skillName, projectRoot) {
  const registryPath = path.join(projectRoot, REGISTRY_RELATIVE_PATH);
  if (!fs.existsSync(registryPath)) return [];

  let registry;
  try {
    registry = safeParseJSON(fs.readFileSync(registryPath, 'utf8'), null, null, null);
  } catch {
    return [];
  }

  if (!registry || !registry.agents) return [];

  const agents = [];
  for (const [agentName, agentData] of Object.entries(registry.agents)) {
    const capabilities = agentData.capabilities || [];
    for (const cap of capabilities) {
      const skills = cap.skills || [];
      if (skills.includes(skillName)) {
        agents.push(agentName);
        break; // No need to check other capabilities for this agent
      }
    }
  }

  return agents;
}

/**
 * Extract skill name from a request.
 *
 * @param {Object} request
 * @returns {string}
 */
function extractSkillName(request) {
  if (request.targetArtifact && request.targetArtifact.name) {
    return String(request.targetArtifact.name).trim();
  }
  return '';
}

/**
 * Mark processed entries in the JSONL queue file.
 *
 * @param {string} projectRoot
 * @param {Set<string>} processedIds - Set of request ids that were processed
 */
function markProcessedEntries(projectRoot, processedIds) {
  const queuePath = path.join(projectRoot, QUEUE_RELATIVE_PATH);
  if (!fs.existsSync(queuePath)) return;

  const raw = fs.readFileSync(queuePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const timestamp = new Date().toISOString();

  const updated = lines.map(line => {
    try {
      const entry = safeParseJSON(line, null, null, null);
      if (entry && processedIds.has(entry.id)) {
        entry.processedAt = timestamp;
        entry.status = 'processed';
        return JSON.stringify(entry);
      }
      return line;
    } catch {
      return line;
    }
  });

  fs.writeFileSync(queuePath, updated.join('\n') + '\n', 'utf8');
}

/**
 * Run post-update integration steps for a skill.
 * These are the mandatory steps that the skill-updater's 11-step pipeline requires.
 *
 * @param {string} skillName
 * @param {string} projectRoot
 * @param {boolean} dryRun
 * @returns {{ steps: string[], errors: string[] }}
 */
function runPostUpdateIntegration(skillName, projectRoot, dryRun = false) {
  const steps = [];
  const errors = [];
  const { spawnSync } = require('node:child_process');

  // Step 1: Update skill catalog (regenerate skill index)
  try {
    if (!dryRun) {
      const result = spawnSync(
        process.execPath,
        [path.join(projectRoot, '.claude/tools/cli/generate-skill-index.cjs')],
        { cwd: projectRoot, encoding: 'utf8', timeout: 30000, shell: false, windowsHide: true }
      );
      if (result.status === 0) {
        steps.push('skill-index regenerated');
      } else {
        errors.push(`skill-index: exit ${result.status}`);
      }
    } else {
      steps.push('skill-index regeneration (dry-run skipped)');
    }
  } catch (err) {
    errors.push(`skill-index: ${err.message}`);
  }

  // Step 2: Record to learnings.md
  try {
    const learningsPath = path.join(projectRoot, '.claude', 'context', 'memory', 'learnings.md');
    if (!dryRun) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const entry = `\n## Skill Updated: ${skillName} (${timestamp})\n- Skill \`${skillName}\` was reviewed and updated by the skill-updater pipeline.\n`;
      fs.appendFileSync(learningsPath, entry, 'utf8');
      steps.push('learnings.md updated');
    } else {
      steps.push('learnings.md update (dry-run skipped)');
    }
  } catch (err) {
    errors.push(`learnings: ${err.message}`);
  }

  // Step 3: Queue integration check
  try {
    const queuePath = path.join(
      projectRoot,
      '.claude',
      'context',
      'runtime',
      'integration-queue.jsonl'
    );
    if (!dryRun) {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        artifactType: 'skill',
        artifactName: skillName,
        artifactPath: `.claude/skills/${skillName}/SKILL.md`,
        action: 'updated',
        source: 'skill-updater-pipeline',
      });
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.appendFileSync(queuePath, entry + '\n', 'utf8');
      steps.push('integration-queue.jsonl entry added');
    } else {
      steps.push('integration-queue entry (dry-run skipped)');
    }
  } catch (err) {
    errors.push(`integration-queue: ${err.message}`);
  }

  // Step 4: Update BM25 index for the changed skill file
  try {
    if (!dryRun) {
      const { VectorStore } = require('../../lib/code-indexing/vector-store.cjs');
      const { updateFileInBM25 } = require('../../lib/code-indexing/bm25-incremental.cjs');
      const vs = new VectorStore({ projectRoot, embeddingMode: 'off' });
      vs.loadBM25Index();
      if (vs.bm25Index) {
        const skillPath = path.join(projectRoot, '.claude', 'skills', skillName, 'SKILL.md');
        updateFileInBM25(skillPath, vs.bm25Index, projectRoot);
        vs.saveBM25Index();
        steps.push('BM25 index updated');
      }
    } else {
      steps.push('BM25 index update (dry-run skipped)');
    }
  } catch (err) {
    // Non-fatal — BM25 update is best-effort
    errors.push(`BM25: ${err.message}`);
  }

  return { steps, errors };
}

/**
 * Run the skill update orchestrator.
 *
 * Reads evolution-requests.jsonl (or targets a single skill),
 * processes stale skills, detects changes, and builds cascade list.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, do not mark entries as processed
 * @param {number}  [options.max=Infinity] - Max number of skills to process
 * @param {string|null} [options.skill=null] - Single skill name to update (skip JSONL)
 * @param {boolean} [options.json=false] - Machine-readable output
 * @returns {{ processed: number, failed: number, agentCascades: Array<Object>, integration: Object, summary: string }}
 */
function runSkillUpdates(projectRoot, options = {}) {
  const { dryRun = false, max = Infinity, skill = null } = options;

  let requests;

  if (skill) {
    // Single-skill mode: synthesize a request
    requests = [
      {
        id: `manual_${skill}_${Date.now()}`,
        trigger: 'stale_skill',
        targetArtifact: { name: skill },
        status: 'proposed',
      },
    ];
  } else {
    // Read from JSONL and filter
    const allRequests = readEvolutionRequests(projectRoot);
    requests = filterStaleSkillRequests(allRequests);
  }

  // Apply max limit
  const batch = requests.slice(0, max);

  let processed = 0;
  let failed = 0;
  const agentCascades = [];
  const allIntegration = [];
  const processedIds = new Set();

  for (const request of batch) {
    const skillName = extractSkillName(request);
    if (!skillName) {
      failed++;
      continue;
    }

    // Read current SKILL.md (before)
    const skillMdPath = path.join(projectRoot, '.claude', 'skills', skillName, 'SKILL.md');
    let beforeContent = '';
    try {
      if (fs.existsSync(skillMdPath)) {
        beforeContent = fs.readFileSync(skillMdPath, 'utf8');
      }
    } catch {
      // Skill not found — not a fatal error for orchestrator planning
    }

    // In orchestrator/CLI mode, the actual skill-updater invocation happens
    // when an agent runs this via Skill({ skill: 'skill-updater' }).
    // For now, we read the same content as "after" (no changes in dry/standalone mode).
    const afterContent = beforeContent;

    // Detect changes (in real mode, afterContent would differ after skill-updater runs)
    const changes = detectChanges(beforeContent, afterContent);

    // Find assigned agents for cascade recommendations
    const assignedAgents = findAssignedAgents(skillName, projectRoot);

    // Always include cascade recommendations for agents assigned to this skill
    for (const agentName of assignedAgents) {
      agentCascades.push({
        agent: agentName,
        skill: skillName,
        reason: changes.toolsChanged
          ? `Tool changes detected in skill "${skillName}"`
          : changes.domainChanged
            ? `Domain change detected in skill "${skillName}"`
            : `Skill "${skillName}" updated — agent "${agentName}" uses this skill`,
      });
    }

    // Run post-update integration steps
    const integration = runPostUpdateIntegration(skillName, projectRoot, dryRun);

    // Enterprise bundle check + scaffold
    let bundleResult = null;
    if (validateEnterpriseBundle && scaffoldMissingComponents) {
      const bundle = validateEnterpriseBundle(skillName, projectRoot);
      if (!bundle.complete && !dryRun) {
        const scaffold = scaffoldMissingComponents(skillName, projectRoot);
        bundleResult = {
          before: bundle.score,
          scaffolded: scaffold.created,
          skipped: scaffold.skipped,
        };
        integration.steps.push(
          `enterprise bundle scaffolded (${scaffold.created.length} components)`
        );
      } else if (!bundle.complete && dryRun) {
        bundleResult = { before: bundle.score, missing: bundle.missing };
        integration.steps.push(`enterprise bundle incomplete: ${bundle.score} (dry-run skipped)`);
      } else {
        bundleResult = { before: bundle.score, complete: true };
        integration.steps.push(`enterprise bundle complete: ${bundle.score}`);
      }
    }

    processed++;
    if (request.id) {
      processedIds.add(request.id);
    }

    // Collect integration results
    allIntegration.push({ skill: skillName, bundle: bundleResult, ...integration });
  }

  // Propagate cascades to evolution queue
  let cascadeResult = null;
  if (agentCascades.length > 0 && writeCascadeEntries) {
    try {
      cascadeResult = writeCascadeEntries(agentCascades, projectRoot, { dryRun });
    } catch {
      // Graceful degradation — cascade writing is non-blocking
    }
  }

  // Mark processed entries in the JSONL (unless dry-run)
  if (!dryRun && processedIds.size > 0) {
    markProcessedEntries(projectRoot, processedIds);
  }

  const summaryText = `Processed ${processed} skill(s), ${failed} failed, ${agentCascades.length} agent cascade(s)${dryRun ? ' [DRY RUN]' : ''}`;

  return {
    processed,
    failed,
    agentCascades,
    cascadeResult,
    integration: allIntegration,
    summary: summaryText,
  };
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function main() {
  // Resolve project root
  let projectRoot;
  try {
    const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
    projectRoot = PROJECT_ROOT;
  } catch {
    projectRoot = process.cwd();
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');

  let max = Infinity;
  const maxIdx = args.indexOf('--max');
  if (maxIdx !== -1 && args[maxIdx + 1]) {
    max = parseInt(args[maxIdx + 1], 10) || Infinity;
  }

  let skill = null;
  const skillIdx = args.indexOf('--skill');
  if (skillIdx !== -1 && args[skillIdx + 1]) {
    skill = args[skillIdx + 1];
  }

  const result = runSkillUpdates(projectRoot, { dryRun, max, skill, json: jsonOutput });

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(result.summary + '\n');
    if (result.agentCascades.length > 0) {
      process.stdout.write('\nAgent cascades:\n');
      for (const cascade of result.agentCascades) {
        process.stdout.write(`  - ${cascade.agent} (skill: ${cascade.skill}): ${cascade.reason}\n`);
      }
    }
  }

  process.exitCode = result.failed > 0 ? 1 : 0;
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

module.exports = {
  readEvolutionRequests,
  filterStaleSkillRequests,
  detectChanges,
  findAssignedAgents,
  runSkillUpdates,
  runPostUpdateIntegration,
  parseFrontmatter,
  extractSkillName,
  markProcessedEntries,
};
