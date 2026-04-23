// Agent: nodejs-pro | Task: #S4 | Session: 2026-04-20
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ADAPTER_PATH = path.resolve(
  __dirname,
  '../../../.claude/lib/import/managed-agent-adapter.cjs'
);
const CLI_PATH = path.resolve(__dirname, '../../../.claude/tools/cli/claude-import.cjs');
const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../../.claude/schemas/agent-manifest.schema.json'
);

// ---------------------------------------------------------------------------
// Fixture: minimal Anthropic Managed Agent export JSON (public beta shape)
// Based on Anthropic blog + plan spec (DR-3: schema may change before GA)
// ---------------------------------------------------------------------------
const FIXTURE_MANAGED_AGENT = {
  id: 'agent_test123',
  name: 'Demo Support Agent',
  description: 'Handles customer support queries with access to knowledge base tools',
  model: 'claude-sonnet-4-6',
  tools: [
    { name: 'search_knowledge_base', description: 'Searches the internal KB', type: 'custom' },
    { name: 'create_ticket', description: 'Creates a support ticket', type: 'custom' },
    { name: 'computer_use', description: 'Browser automation', type: 'anthropic_builtin' },
  ],
  system_prompt: 'You are a helpful customer support agent.',
  memory: { type: 'conversation', persistence: 'session' },
  metadata: { created_at: '2026-04-01T00:00:00Z', version: '1' },
};

// Tools that have no local agent-studio equivalent (should trigger warning)
const FIXTURE_WITH_UNKNOWN_TOOLS = {
  ...FIXTURE_MANAGED_AGENT,
  id: 'agent_unknown',
  name: 'Agent With Unknown Tools',
  tools: [
    { name: 'search_knowledge_base', description: 'KB search', type: 'custom' },
    { name: 'anthropic_proprietary_tool', description: 'No local equivalent', type: 'managed_only' },
    { name: 'another_unknown_tool', description: 'Another missing tool', type: 'managed_only' },
  ],
};

// ---------------------------------------------------------------------------
// Test 1: adapter maps managed agent JSON → local agent .md + manifest
// ---------------------------------------------------------------------------
test('adapter: maps managed agent JSON to local agent frontmatter and manifest', () => {
  const adapter = require(ADAPTER_PATH);
  const result = adapter.convertManagedAgent(FIXTURE_MANAGED_AGENT);

  assert.ok(result, 'convertManagedAgent must return a result');
  assert.ok(result.agentFrontmatter, 'result must have agentFrontmatter');
  assert.ok(result.manifest, 'result must have manifest');
  assert.ok(result.agentMd, 'result must have agentMd string');

  // Frontmatter basics
  assert.strictEqual(result.agentFrontmatter.name, 'demo-support-agent', 'name must be slugified');
  assert.strictEqual(result.agentFrontmatter.description, FIXTURE_MANAGED_AGENT.description);

  // agentMd must be a non-empty string with frontmatter block
  assert.ok(typeof result.agentMd === 'string' && result.agentMd.length > 0);
  assert.ok(result.agentMd.includes('---'), 'agentMd must contain YAML frontmatter delimiters');
});

// ---------------------------------------------------------------------------
// Test 2: Anthropic schema fields map to agent-studio manifest fields
// ---------------------------------------------------------------------------
test('adapter: maps Anthropic schema fields to manifest capabilities, memory_tier, cost_envelope', () => {
  const adapter = require(ADAPTER_PATH);
  const result = adapter.convertManagedAgent(FIXTURE_MANAGED_AGENT);
  const { manifest } = result;

  // manifest_version
  assert.strictEqual(manifest.manifest_version, '1.0');

  // agent_id must be slugified
  assert.match(manifest.agent_id, /^[a-z][a-z0-9-]*$/, 'agent_id must be kebab-case');

  // agent_type for imported agents
  assert.strictEqual(manifest.agent_type, 'imported');

  // capabilities derived from tools
  assert.ok(Array.isArray(manifest.capabilities), 'capabilities must be array');

  // memory_tier derived from memory.persistence
  assert.ok(['STM', 'MTM', 'LTM', 'NONE'].includes(manifest.memory_tier));

  // cost_envelope derived from model
  assert.ok(manifest.cost_envelope, 'cost_envelope must exist');
  assert.ok(typeof manifest.cost_envelope.max_tokens_per_task === 'number');
  assert.ok(typeof manifest.cost_envelope.max_usd_per_session === 'number');
  assert.ok(typeof manifest.cost_envelope.preferred_model === 'string');

  // session_type
  assert.ok(['ephemeral', 'persistent', 'delegated'].includes(manifest.session_type));

  // a2a_interop
  assert.ok(manifest.a2a_interop, 'a2a_interop must exist');
  assert.ok(typeof manifest.a2a_interop.supports_mcp === 'boolean');
  assert.ok(typeof manifest.a2a_interop.supports_aip_tokens === 'boolean');
  assert.ok(typeof manifest.a2a_interop.supports_maf === 'boolean');
});

// ---------------------------------------------------------------------------
// Test 3: imported agent has valid Agent Manifest (schema-valid)
// ---------------------------------------------------------------------------
test('adapter: output manifest passes agent-manifest.schema.json validation', () => {
  const adapter = require(ADAPTER_PATH);
  const { manifest } = adapter.convertManagedAgent(FIXTURE_MANAGED_AGENT);

  // Load schema and validate using Ajv-style or simple structural check
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // Validate required fields per schema
  const required = schema.required || [];
  for (const field of required) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(manifest, field),
      `manifest missing required field: ${field}`
    );
  }

  // Validate manifest_version enum
  assert.ok(
    schema.properties.manifest_version.enum.includes(manifest.manifest_version),
    'manifest_version must be a valid enum value'
  );

  // Validate agent_type enum
  assert.ok(
    schema.properties.agent_type.enum.includes(manifest.agent_type),
    `agent_type '${manifest.agent_type}' must be a valid enum value`
  );

  // Validate memory_tier enum
  assert.ok(
    schema.properties.memory_tier.enum.includes(manifest.memory_tier),
    `memory_tier '${manifest.memory_tier}' must be a valid enum value`
  );
});

// ---------------------------------------------------------------------------
// Test 4: tools with no local equivalent → warning + skipped with note
// ---------------------------------------------------------------------------
test('adapter: unknown tools produce warnings in import report and are skipped', () => {
  const adapter = require(ADAPTER_PATH);
  const result = adapter.convertManagedAgent(FIXTURE_WITH_UNKNOWN_TOOLS);

  assert.ok(result.importReport, 'result must have importReport');
  assert.ok(Array.isArray(result.importReport.warnings), 'importReport.warnings must be array');
  assert.ok(
    result.importReport.warnings.length > 0,
    'Should have at least one warning for unknown tools'
  );

  // Warnings must mention the unrecognised tool names
  const warningText = result.importReport.warnings.join(' ');
  assert.match(warningText, /anthropic_proprietary_tool|managed_only|unknown/i,
    'Warning must reference the unrecognised tool type or name'
  );

  // The unknown tools must NOT appear as allowed capabilities in manifest
  const { manifest } = result;
  const allowedToolNames = manifest.capabilities
    .filter(c => c.allowed)
    .map(c => c.tool_name);
  assert.ok(
    !allowedToolNames.includes('anthropic_proprietary_tool'),
    'anthropic_proprietary_tool must not be in allowed capabilities'
  );
});

// ---------------------------------------------------------------------------
// Test 5: --dry-run flag prints the would-be agent file without writing
// ---------------------------------------------------------------------------
test('CLI: --dry-run prints agent content without writing files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-import-test-'));
  const fixtureFile = path.join(tmpDir, 'fixture.json');
  fs.writeFileSync(fixtureFile, JSON.stringify(FIXTURE_MANAGED_AGENT));

  const result = spawnSync(
    process.execPath,
    [CLI_PATH, '--fixture', fixtureFile, '--dry-run', '--output-dir', tmpDir],
    { encoding: 'utf8', timeout: 15000 }
  );

  assert.strictEqual(result.status, 0, `CLI dry-run failed: ${result.stderr}`);
  assert.match(result.stdout, /---/, 'dry-run output must include YAML frontmatter delimiters');
  assert.match(result.stdout, /DRY RUN|dry-run|would write/i, 'dry-run must indicate no write occurred');

  // Confirm no .md file was written
  const mdFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.md'));
  assert.strictEqual(mdFiles.length, 0, 'dry-run must NOT write any .md files');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test 6: --output-dir allows custom destination
// ---------------------------------------------------------------------------
test('CLI: --output-dir writes imported agent to specified directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-import-test-'));
  const customOutputDir = path.join(tmpDir, 'custom-agents');
  fs.mkdirSync(customOutputDir);
  const fixtureFile = path.join(tmpDir, 'fixture.json');
  fs.writeFileSync(fixtureFile, JSON.stringify(FIXTURE_MANAGED_AGENT));

  const result = spawnSync(
    process.execPath,
    [CLI_PATH, '--fixture', fixtureFile, '--output-dir', customOutputDir],
    { encoding: 'utf8', timeout: 15000 }
  );

  assert.strictEqual(result.status, 0, `CLI failed: ${result.stderr}`);

  // At least one .md file should be written in customOutputDir
  const mdFiles = fs.readdirSync(customOutputDir).filter(f => f.endsWith('.md'));
  assert.ok(mdFiles.length > 0, 'Must write at least one .md file to custom output dir');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test 7: missing API credentials → clear error pointing to env var
// ---------------------------------------------------------------------------
test('CLI: missing API credentials produce clear error pointing to env var', () => {
  // Remove the API key from env and try to fetch a real agent (no --fixture)
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, 'agent_nonexistent123'],
    {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_MANAGED_AGENTS_API_URL: 'http://localhost:0', // unreachable
      },
    }
  );

  assert.notStrictEqual(result.status, 0, 'CLI must exit non-zero when credentials are missing');
  const combinedOutput = (result.stdout || '') + (result.stderr || '');
  assert.match(
    combinedOutput,
    /ANTHROPIC_API_KEY|credentials|api.key/i,
    'Error must mention ANTHROPIC_API_KEY env var'
  );
});
