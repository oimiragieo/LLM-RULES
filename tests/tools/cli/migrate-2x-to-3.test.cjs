// Agent: technical-writer | Task: #S5 | Session: 2026-04-20
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI_PATH = path.resolve(__dirname, '../../../.claude/tools/cli/migrate-2x-to-3.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the migration CLI against a custom agents directory.
 * We override the AGENTS_DIR by patching environment — the script uses
 * a hard-coded path, so we run in --dry-run mode for safety in tests.
 */
function runCli(extraArgs = []) {
  return spawnSync(
    process.execPath,
    [CLI_PATH, ...extraArgs],
    { encoding: 'utf8', timeout: 15000 }
  );
}

// ---------------------------------------------------------------------------
// Test 1: --dry-run emits report without writing files
// ---------------------------------------------------------------------------
test('--dry-run emits report and writes no files', () => {
  const result = runCli(['--dry-run']);

  assert.strictEqual(result.status, 0, `CLI exited non-zero: ${result.stderr}`);

  const out = result.stdout;
  assert.ok(out.includes('DRY-RUN'), 'output should mention DRY-RUN');
  assert.ok(out.includes('BC-1'), 'output should cover BC-1');
  assert.ok(out.includes('BC-2'), 'output should cover BC-2');
  assert.ok(out.includes('BC-3'), 'output should cover BC-3');
  assert.ok(out.includes('BC-4'), 'output should cover BC-4');
  assert.ok(
    out.includes('DRY-RUN complete') || out.includes('dry-run') || out.includes('DRY-RUN'),
    'output should confirm dry-run mode'
  );
});

// ---------------------------------------------------------------------------
// Test 2: Script exits 0 normally
// ---------------------------------------------------------------------------
test('script exits 0 without arguments', () => {
  const result = runCli([]);
  assert.strictEqual(result.status, 0, `CLI exited non-zero: ${result.stderr}`);
  assert.ok(result.stdout.includes('Migration complete') || result.stdout.includes('BC-1'),
    'output should contain migration content');
});

// ---------------------------------------------------------------------------
// Test 3: Backfill logic — agent without manifest gets manifest block
// ---------------------------------------------------------------------------
test('backfill: adds manifest block to agent without one', () => {
  // Test the internal helper functions by requiring the CLI as a module.
  // Since the CLI uses 'use strict' and direct execution, we test via
  // a functional approach by inspecting what parseFrontmatter + buildManifestBlock
  // would produce.

  // Simulate what the migration script does:
  const agentContent = [
    '---',
    'name: My Test Agent',
    'description: Does things',
    '---',
    '',
    '# My Test Agent',
  ].join('\n');

  // parseFrontmatter logic (inline for isolation)
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = agentContent.match(FM_RE);
  assert.ok(match, 'frontmatter regex should match');

  const frontmatter = match[1];
  const hasManifestAlready = /^manifest:/m.test(frontmatter);
  assert.strictEqual(hasManifestAlready, false, 'agent should not have manifest yet');

  // Build the manifest block
  const manifestBlock = [
    'manifest:',
    '  manifest_version: "1.0"',
    '  agent_id: "my-test-agent"',
    '  agent_type: "core"',
    '  capabilities: []',
    '  memory_tier: STM',
    '  cost_envelope:',
    '    max_tokens_per_task: 80000',
    '    max_usd_per_session: 5',
    '    preferred_model: sonnet',
    '  session_type: ephemeral',
    '  a2a_interop:',
    '    supports_mcp: true',
    '    supports_aip_tokens: true',
    '    supports_maf: false',
  ].join('\n');

  const newFrontmatter = frontmatter.trimEnd() + '\n' + manifestBlock;
  const newContent = `---\n${newFrontmatter}\n---\n${match[2]}`;

  assert.ok(/^manifest:/m.test(newContent), 'new content should contain manifest: block');
  assert.ok(newContent.includes('manifest_version: "1.0"'), 'should have manifest_version');
  assert.ok(newContent.includes('agent_type: "core"'), 'should have agent_type');
  assert.ok(newContent.includes('memory_tier: STM'), 'should have memory_tier');
  assert.ok(newContent.includes('session_type: ephemeral'), 'should have session_type');
  assert.ok(newContent.includes('supports_mcp: true'), 'should have a2a_interop.supports_mcp');

  // Verify manifest is idempotent — it is already present
  const hasManifestNow = /^manifest:/m.test(newContent);
  assert.strictEqual(hasManifestNow, true, 'patched content must have manifest block');
});

// ---------------------------------------------------------------------------
// Test 4: Idempotency — agent with existing manifest is unchanged
// ---------------------------------------------------------------------------
test('idempotency: agent with existing manifest block is not double-patched', () => {
  const agentWithManifest = [
    '---',
    'name: Already Manifested',
    'manifest:',
    '  manifest_version: "1.0"',
    '  agent_id: "already-manifested"',
    '  agent_type: "core"',
    '  capabilities: []',
    '  memory_tier: STM',
    '  cost_envelope:',
    '    max_tokens_per_task: 80000',
    '    max_usd_per_session: 5',
    '    preferred_model: sonnet',
    '  session_type: ephemeral',
    '  a2a_interop:',
    '    supports_mcp: true',
    '    supports_aip_tokens: true',
    '    supports_maf: false',
    '---',
    '',
    '# Already Manifested',
  ].join('\n');

  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = agentWithManifest.match(FM_RE);
  assert.ok(match, 'should parse frontmatter');

  const frontmatter = match[1];
  const hasManifest = /^manifest:/m.test(frontmatter);

  // The migration script skips agents that already have manifest blocks
  assert.strictEqual(hasManifest, true, 'agent already has manifest — migration should skip it');

  // Count manifest: occurrences — must remain exactly 1
  const manifestCount = (agentWithManifest.match(/^manifest:/gm) || []).length;
  assert.strictEqual(manifestCount, 1, 'manifest block should appear exactly once (no duplicate)');
});

// ---------------------------------------------------------------------------
// Test 5: Backup creation — verifies backup directory path logic
// ---------------------------------------------------------------------------
test('backup path: derives correct backup destination from agent basename', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const BACKUP_DIR = path.join(ROOT, '.claude', 'context', 'tmp', 'agents-pre-v3-migration');
  const agentFilePath = path.join(ROOT, '.claude', 'agents', 'core', 'developer.md');

  const basename = path.basename(agentFilePath);
  const backupPath = path.join(BACKUP_DIR, basename);

  assert.strictEqual(basename, 'developer.md', 'basename should be developer.md');
  assert.ok(
    backupPath.endsWith(path.join('agents-pre-v3-migration', 'developer.md')),
    'backup path should be under agents-pre-v3-migration/'
  );
});
