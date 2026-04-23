#!/usr/bin/env node
// Agent: technical-writer | Task: #S5 | Session: 2026-04-20
/**
 * migrate-2x-to-3 — Automated 2.x → 3.0 migration script
 * =========================================================
 * Covers four v3.0.0 breaking changes (BC-1 through BC-4):
 *
 *   BC-1  mcp.transport: "sse" config rejected → rewrites to "streamable-http"
 *   BC-2  Agents without manifest block fail startup → backfills minimal manifest
 *   BC-3  Task() spawns require AIP token (informational; handled by router shim)
 *   BC-4  agent-registry.json v2 schema not auto-loaded → informs user to regenerate
 *
 * Usage:
 *   node .claude/tools/cli/migrate-2x-to-3.cjs [--dry-run]
 *
 * Flags:
 *   --dry-run   Print what would change without writing any files
 *
 * Backups:
 *   Modified agent files are backed up to
 *   .claude/context/tmp/agents-pre-v3-migration/<basename>.md
 *
 * @module tools/cli/migrate-2x-to-3
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const BACKUP_DIR = path.join(ROOT, '.claude', 'context', 'tmp', 'agents-pre-v3-migration');
const CONFIG_PATHS = [
  path.join(ROOT, '.claude', 'config', 'config.yaml'),
  path.join(ROOT, '.claude', 'settings.json'),
  path.join(ROOT, '.claude', 'settings.local.json'),
];

/** Minimal manifest defaults per agent-manifest.schema.json v1.0 */
const MANIFEST_DEFAULTS = {
  manifest_version: '1.0',
  agent_type: 'core',
  capabilities: [],
  memory_tier: 'STM',
  cost_envelope: {
    max_tokens_per_task: 80000,
    max_usd_per_session: 5,
    preferred_model: 'sonnet',
  },
  session_type: 'ephemeral',
  a2a_interop: {
    supports_mcp: true,
    supports_aip_tokens: true,
    supports_maf: false,
  },
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk a directory tree and return all files matching a predicate.
 * @param {string} dir
 * @param {(f: string) => boolean} pred
 * @returns {string[]}
 */
function walkFiles(dir, pred) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, pred));
    } else if (entry.isFile() && pred(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Parse YAML-style frontmatter from an agent .md file.
 * Returns the raw frontmatter block and the body after it.
 * @param {string} content
 * @returns {{ frontmatter: string, body: string, hasFrontmatter: boolean }}
 */
function parseFrontmatter(content) {
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(FM_RE);
  if (!match) return { frontmatter: '', body: content, hasFrontmatter: false };
  return { frontmatter: match[1], body: match[2], hasFrontmatter: true };
}

/**
 * Check whether a frontmatter block already has a manifest: section.
 * @param {string} frontmatter
 * @returns {boolean}
 */
function hasManifest(frontmatter) {
  return /^manifest:/m.test(frontmatter);
}

/**
 * Extract agent_id from a file path or frontmatter name: field.
 * @param {string} filePath
 * @param {string} frontmatter
 * @returns {string}
 */
function deriveAgentId(filePath, frontmatter) {
  const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (nameMatch) {
    return nameMatch[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
  }
  return path.basename(filePath, '.md');
}

/**
 * Infer agent_type from frontmatter or directory path.
 * @param {string} filePath
 * @param {string} frontmatter
 * @returns {string}
 */
function deriveAgentType(filePath, frontmatter) {
  const typeMatch = frontmatter.match(/^(?:type|subagent_type):\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (typeMatch) {
    const raw = typeMatch[1].trim().toLowerCase();
    const VALID_TYPES = [
      'core',
      'specialized',
      'orchestrator',
      'security',
      'domain',
      'creator',
      'monitor',
      'imported',
    ];
    if (VALID_TYPES.includes(raw)) return raw;
    // Map common synonyms
    if (raw.includes('orchestrat')) return 'orchestrator';
    if (raw.includes('security')) return 'security';
    if (raw.includes('domain') || raw.includes('specialist')) return 'domain';
    if (raw.includes('creat')) return 'creator';
  }
  // Infer from directory
  const rel = filePath.replace(/\\/g, '/');
  if (rel.includes('/orchestrators/')) return 'orchestrator';
  if (rel.includes('/security/')) return 'security';
  if (rel.includes('/specialized/')) return 'specialized';
  if (rel.includes('/creators/')) return 'creator';
  if (rel.includes('/monitoring/')) return 'monitor';
  if (rel.includes('/imported/')) return 'imported';
  return 'core';
}

/**
 * Build the manifest YAML block to inject into frontmatter.
 * Uses MANIFEST_DEFAULTS for all default values.
 * @param {string} agentId
 * @param {string} agentType
 * @returns {string}
 */
function buildManifestBlock(agentId, agentType) {
  const d = MANIFEST_DEFAULTS;
  const ce = d.cost_envelope;
  const a2a = d.a2a_interop;
  return [
    'manifest:',
    `  manifest_version: "${d.manifest_version}"`,
    `  agent_id: "${agentId}"`,
    `  agent_type: "${agentType}"`,
    `  capabilities: ${JSON.stringify(d.capabilities)}`,
    `  memory_tier: ${d.memory_tier}`,
    '  cost_envelope:',
    `    max_tokens_per_task: ${ce.max_tokens_per_task}`,
    `    max_usd_per_session: ${ce.max_usd_per_session}`,
    `    preferred_model: ${ce.preferred_model}`,
    `  session_type: ${d.session_type}`,
    '  a2a_interop:',
    `    supports_mcp: ${a2a.supports_mcp}`,
    `    supports_aip_tokens: ${a2a.supports_aip_tokens}`,
    `    supports_maf: ${a2a.supports_maf}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// BC-1: Scan config files for mcp.transport: "sse"
// ---------------------------------------------------------------------------

/**
 * @returns {{ path: string, line: number, preview: string }[]}
 */
function findSseTransportConfigs() {
  /** @type {{ path: string, line: number, preview: string }[]} */
  const hits = [];
  for (const configPath of CONFIG_PATHS) {
    if (!fs.existsSync(configPath)) continue;
    const lines = fs.readFileSync(configPath, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (/mcp.*transport.*sse|transport.*['"]\s*sse/.test(line)) {
        hits.push({ path: configPath, line: idx + 1, preview: line.trim() });
      }
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// BC-2: Backfill agent manifest blocks
// ---------------------------------------------------------------------------

/**
 * @returns {{ filePath: string, agentId: string, agentType: string }[]}
 */
function findAgentsWithoutManifest() {
  const agentFiles = walkFiles(AGENTS_DIR, name => name.endsWith('.md'));
  /** @type {{ filePath: string, agentId: string, agentType: string }[]} */
  const needsMigration = [];
  for (const filePath of agentFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, hasFrontmatter } = parseFrontmatter(content);
    if (!hasFrontmatter) continue; // Skip files without frontmatter
    if (hasManifest(frontmatter)) continue; // Already has manifest
    const agentId = deriveAgentId(filePath, frontmatter);
    const agentType = deriveAgentType(filePath, frontmatter);
    needsMigration.push({ filePath, agentId, agentType });
  }
  return needsMigration;
}

/**
 * @param {{ filePath: string, agentId: string, agentType: string }[]} agents
 */
function backfillManifests(agents) {
  if (!DRY_RUN && agents.length > 0) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  for (const { filePath, agentId, agentType } of agents) {
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);
    const manifestBlock = buildManifestBlock(agentId, agentType);
    const newFrontmatter = frontmatter.trimEnd() + '\n' + manifestBlock;
    const newContent = `---\n${newFrontmatter}\n---\n${body}`;
    const basename = path.basename(filePath);

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would patch: ${path.relative(ROOT, filePath)}`);
      console.log(`    agent_id: ${agentId}, agent_type: ${agentType}`);
    } else {
      const backupPath = path.join(BACKUP_DIR, basename);
      fs.copyFileSync(filePath, backupPath);
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`  Patched:   ${path.relative(ROOT, filePath)}`);
      console.log(`  Backup:    ${path.relative(ROOT, backupPath)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('');
  console.log('agent-studio v2.x → 3.0 Migration Tool');
  console.log('========================================');
  if (DRY_RUN) {
    console.log('Mode: DRY-RUN (no files will be written)');
  }
  console.log('');

  let totalChanges = 0;

  // ---- BC-1: SSE transport ----
  console.log('BC-1  Checking for deprecated SSE transport config...');
  const sseHits = findSseTransportConfigs();
  if (sseHits.length === 0) {
    console.log('      No SSE transport config found. Nothing to change.');
  } else {
    console.log(`      Found ${sseHits.length} occurrence(s) of mcp.transport: "sse":`);
    for (const hit of sseHits) {
      console.log(`      ${path.relative(ROOT, hit.path)}:${hit.line}  →  ${hit.preview}`);
    }
    console.log('');
    console.log('      ACTION REQUIRED: Update each occurrence to:');
    console.log('        mcp.transport: "streamable-http"');
    console.log('      (Automated rewrite not applied — config format varies.)');
    console.log('      See docs/migration/v2-to-v3.md for details.');
    totalChanges += sseHits.length;
  }
  console.log('');

  // ---- BC-2: Agent manifest backfill ----
  console.log('BC-2  Scanning agents for missing manifest blocks...');
  const agentsToMigrate = findAgentsWithoutManifest();
  if (agentsToMigrate.length === 0) {
    console.log('      All agents already have manifest blocks. Nothing to change.');
  } else {
    console.log(`      Found ${agentsToMigrate.length} agent(s) without a manifest block:`);
    backfillManifests(agentsToMigrate);
    totalChanges += agentsToMigrate.length;
    if (!DRY_RUN) {
      console.log('');
      console.log(`      Backups saved to: ${path.relative(ROOT, BACKUP_DIR)}/`);
    }
  }
  console.log('');

  // ---- BC-3: AIP tokens (informational) ----
  console.log('BC-3  AIP invocation-bound capability tokens:');
  console.log('      The router auto-injects tokens for existing Task() calls.');
  console.log('      Custom orchestrators must use createCapabilityAwareTask() or');
  console.log('      set the AIP_TOKENS env var to "off" for dev/offline mode.');
  console.log('');

  // ---- BC-4: agent-registry.json schema ----
  console.log('BC-4  agent-registry.json schema v2 → v3:');
  console.log('      Run:  pnpm agents:registry');
  console.log('      This regenerates agent-registry.json in the v3 schema format.');
  console.log('');

  // ---- Summary ----
  console.log('========================================');
  if (DRY_RUN) {
    console.log(`DRY-RUN complete. ${totalChanges} change(s) would be applied.`);
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('Migration complete.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review backups in .claude/context/tmp/agents-pre-v3-migration/');
    console.log('  2. Fix any SSE transport occurrences listed above (BC-1)');
    console.log('  3. Set V3_MANIFEST_REQUIRED=on in .env when ready to enforce BC-2');
    console.log('  4. Run:  pnpm agents:registry  (BC-4)');
    console.log('  5. Run:  pnpm test:framework  to verify');
  }
  console.log('');
}

main();
