#!/usr/bin/env node
// Agent: nodejs-pro | Task: #S4 | Session: 2026-04-20
// @ts-check
/**
 * claude-import CLI
 * =================
 * One-way import of Anthropic Managed Agents → agent-studio local agents.
 *
 * Usage:
 *   node claude-import.cjs <managed-agent-id>           # Fetch from API
 *   node claude-import.cjs --fixture <file.json>        # Use local fixture (testing)
 *   node claude-import.cjs --dry-run ...                # Print without writing
 *   node claude-import.cjs --output-dir <path> ...      # Custom destination
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY                  Required for live API calls
 *   ANTHROPIC_MANAGED_AGENTS_API_URL   Override API base URL (default: public beta URL)
 *
 * DR-3 NOTE: API schema is public beta (2026-04-08+). See managed-agent-adapter.cjs header.
 *
 * @module tools/cli/claude-import
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { convertManagedAgent } = require('../../lib/import/managed-agent-adapter.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_API_URL =
  process.env.ANTHROPIC_MANAGED_AGENTS_API_URL || 'https://api.anthropic.com/v1/agents';

// ---------------------------------------------------------------------------
// Argument parsing (no external deps)
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {{ agentId: string|null, fixtureFile: string|null, dryRun: boolean, outputDir: string|null, help: boolean }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  /** @type {{ agentId: string|null, fixtureFile: string|null, dryRun: boolean, outputDir: string|null, help: boolean }} */
  const result = {
    agentId: null,
    fixtureFile: null,
    dryRun: false,
    outputDir: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--fixture') {
      result.fixtureFile = args[++i];
    } else if (arg === '--output-dir') {
      result.outputDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (!arg.startsWith('-')) {
      result.agentId = arg;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// HTTP fetch helper (no external deps, works with http/https)
// ---------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<object>}
 */
function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'GET',
        headers: headers || {},
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timed out after 10s'));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Credential check
// ---------------------------------------------------------------------------

/**
 * @param {string|undefined} apiKey
 * @returns {void}
 */
function checkCredentials(apiKey) {
  if (!apiKey) {
    process.stderr.write(
      '[claude-import] Error: ANTHROPIC_API_KEY environment variable is not set.\n' +
        'Set it before running:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
        'Or add it to your .env file.\n'
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fetch managed agent from API
// ---------------------------------------------------------------------------

/**
 * @param {string} agentId
 * @returns {Promise<object>}
 */
async function fetchManagedAgent(agentId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  checkCredentials(apiKey);
  // After checkCredentials, apiKey is guaranteed non-null (process.exit(1) otherwise)
  const resolvedKey = /** @type {string} */ (apiKey);

  const url = `${DEFAULT_API_URL}/${encodeURIComponent(agentId)}/export`;

  process.stderr.write(`[claude-import] Fetching: ${url}\n`);

  const data = await fetchJson(url, {
    'x-api-key': resolvedKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-beta': 'managed-agents-2026-04-08',
  });

  return data;
}

// ---------------------------------------------------------------------------
// Write output files
// ---------------------------------------------------------------------------

/**
 * @param {string} agentId
 * @param {string} agentMd
 * @param {object} manifest
 * @param {string} outputDir
 * @param {boolean} dryRun
 * @returns {void}
 */
function writeAgentFiles(agentId, agentMd, manifest, outputDir, dryRun) {
  const agentFile = path.join(outputDir, `${agentId}.md`);
  const manifestFile = path.join(outputDir, `${agentId}.manifest.json`);

  if (dryRun) {
    process.stdout.write('\n=== DRY RUN — would write the following files ===\n\n');
    process.stdout.write(`[File: ${agentFile}]\n`);
    process.stdout.write(agentMd + '\n');
    process.stdout.write(`\n[File: ${manifestFile}]\n`);
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
    return;
  }

  // Ensure output dir exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(agentFile, agentMd, 'utf8');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  process.stdout.write(`[claude-import] Written: ${agentFile}\n`);
  process.stdout.write(`[claude-import] Written: ${manifestFile}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      'Usage: node claude-import.cjs [options] <managed-agent-id>\n\n' +
        'Options:\n' +
        '  --dry-run              Print the would-be agent file without writing\n' +
        '  --fixture <file>       Use a local JSON fixture instead of the API\n' +
        '  --output-dir <path>    Custom output directory (default: .claude/agents/imported/)\n' +
        '  -h, --help             Show this help\n\n' +
        'Environment variables:\n' +
        '  ANTHROPIC_API_KEY                  Required for live API calls\n' +
        '  ANTHROPIC_MANAGED_AGENTS_API_URL   Override API base URL\n'
    );
    process.exit(0);
  }

  // Determine output directory
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.resolve(__dirname, '../../../.claude/agents/imported');

  let managedAgentJson;

  if (args.fixtureFile) {
    // Load from fixture (for testing and dry-run without API)
    const fixturePath = path.resolve(args.fixtureFile);
    if (!fs.existsSync(fixturePath)) {
      process.stderr.write(`[claude-import] Error: Fixture file not found: ${fixturePath}\n`);
      process.exit(1);
    }
    managedAgentJson = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } else if (args.agentId) {
    // Fetch from Anthropic Managed Agents API
    try {
      managedAgentJson = await fetchManagedAgent(args.agentId);
    } catch (err) {
      process.stderr.write(`[claude-import] Error fetching agent: ${err.message}\n`);
      if (!process.env.ANTHROPIC_API_KEY) {
        process.stderr.write(
          '[claude-import] Hint: ANTHROPIC_API_KEY is not set.\n' +
            '  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n'
        );
      }
      process.exit(1);
    }
  } else {
    process.stderr.write(
      '[claude-import] Error: provide a managed-agent-id or --fixture <file>\n' +
        'Run with --help for usage.\n'
    );
    process.exit(1);
  }

  // Convert
  const { agentFrontmatter, manifest, agentMd, importReport } =
    convertManagedAgent(managedAgentJson);
  const agentId = agentFrontmatter.name;

  // Report warnings
  if (importReport.warnings.length > 0) {
    process.stderr.write('\n[claude-import] Import warnings:\n');
    for (const w of importReport.warnings) {
      process.stderr.write(`  WARN: ${w}\n`);
    }
    process.stderr.write('\n');
  }

  // Write (or dry-run print)
  writeAgentFiles(agentId, agentMd, manifest, outputDir, args.dryRun);

  // Summary
  if (!args.dryRun) {
    process.stdout.write(
      `\n[claude-import] Import complete.\n` +
        `  Agent ID : ${agentId}\n` +
        `  Tools    : ${importReport.mappedTools.length} mapped, ${importReport.skippedTools.length} skipped\n` +
        `  Warnings : ${importReport.warnings.length}\n`
    );
    if (importReport.skippedTools.length > 0) {
      process.stdout.write(`  Skipped  : ${importReport.skippedTools.join(', ')}\n`);
    }
  }
}

main().catch(err => {
  process.stderr.write(`[claude-import] Unexpected error: ${err.message}\n`);
  process.exit(1);
});
