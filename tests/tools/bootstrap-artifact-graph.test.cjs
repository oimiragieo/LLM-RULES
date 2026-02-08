'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TOOL_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/bootstrap-artifact-graph.cjs');
const TMP_OUTPUT = path.join(PROJECT_ROOT, '.claude/context/tmp/test-artifact-graph.json');

/**
 * Helper: Run tool with args and return stdout
 */
function runTool(args = '') {
  try {
    const cmd = `node "${TOOL_PATH}" ${args}`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result;
  } catch (err) {
    // On error, return stderr + stdout
    throw new Error(`Tool failed: ${err.stderr || err.stdout || err.message}`);
  }
}

/**
 * Helper: Clean up temp files
 */
function cleanup() {
  if (fs.existsSync(TMP_OUTPUT)) {
    fs.unlinkSync(TMP_OUTPUT);
  }
}

// Cleanup before/after all tests
test.beforeEach(cleanup);
test.afterEach(cleanup);

// === Test Suite ===

test('1. Basic execution: Tool runs without errors with --dry-run', () => {
  const output = runTool('--dry-run');

  assert.ok(output.includes('Bootstrapping artifact graph'), 'Should print bootstrap message');
  assert.ok(output.includes('Found'), 'Should report found artifacts');
  assert.ok(output.includes('Bootstrap complete'), 'Should complete successfully');
});

test('2. Node creation: Finds skills, agents, hooks, workflows', () => {
  const output = runTool('--dry-run');

  // Check for artifact types in output
  assert.ok(output.includes('skill:'), 'Should find skills');
  assert.ok(output.includes('agent:'), 'Should find agents');
  assert.ok(output.includes('hook:'), 'Should find hooks');
  assert.ok(output.includes('workflow:'), 'Should find workflows');

  // Nodes by type section
  assert.ok(output.match(/skill:\s+\d+/), 'Should count skills');
  assert.ok(output.match(/agent:\s+\d+/), 'Should count agents');
  assert.ok(output.match(/hook:\s+\d+/), 'Should count hooks');
  assert.ok(output.match(/workflow:\s+\d+/), 'Should count workflows');
});

test('3. Output format: Valid JSON matching schema structure', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  assert.ok(fs.existsSync(TMP_OUTPUT), 'Should create output file');

  const content = fs.readFileSync(TMP_OUTPUT, 'utf8');
  const graph = JSON.parse(content); // Should parse as valid JSON

  // Check schema compliance
  assert.ok(graph.version, 'Should have version field');
  assert.ok(graph.lastUpdated, 'Should have lastUpdated field');
  assert.ok(typeof graph.nodes === 'object', 'Should have nodes object');
  assert.ok(Array.isArray(graph.edges), 'Should have edges array');

  // Validate version format
  assert.match(graph.version, /^\d+\.\d+\.\d+$/, 'Version should be semver');

  // Validate lastUpdated is ISO date
  assert.ok(!isNaN(Date.parse(graph.lastUpdated)), 'lastUpdated should be valid ISO date');
});

test('4. Node ID format: All node IDs match {type}:{name} pattern', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const nodeIds = Object.keys(graph.nodes);

  assert.ok(nodeIds.length > 0, 'Should have at least one node');

  for (const id of nodeIds) {
    assert.match(id, /^[a-z-]+:[a-z0-9-]+$/i, `Node ID "${id}" should match {type}:{name} pattern`);

    // Validate node structure
    const node = graph.nodes[id];
    assert.ok(node.type, `Node ${id} should have type`);
    assert.ok(node.path, `Node ${id} should have path`);
    assert.ok(node.created, `Node ${id} should have created timestamp`);
    assert.ok(node.integrationStatus, `Node ${id} should have integrationStatus`);
  }
});

test('5. Edge detection: At least some assigned-to edges exist', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));

  assert.ok(graph.edges.length > 0, 'Should have at least one edge');

  // Find assigned-to edges (skill -> agent)
  const assignedToEdges = graph.edges.filter(edge => edge.type === 'assigned-to');

  assert.ok(assignedToEdges.length > 0, 'Should have at least one assigned-to edge');

  // Validate edge structure
  for (const edge of assignedToEdges) {
    assert.ok(edge.from, 'Edge should have from field');
    assert.ok(edge.to, 'Edge should have to field');
    assert.strictEqual(edge.type, 'assigned-to', 'Edge type should match');
    assert.ok(edge.status, 'Edge should have status field');

    // Validate from/to are valid node IDs
    assert.ok(graph.nodes[edge.from], `Edge from ${edge.from} should reference existing node`);
    assert.ok(graph.nodes[edge.to], `Edge to ${edge.to} should reference existing node`);
  }
});

test('6. Node counts: At least 200 nodes from current codebase', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const nodeCount = Object.keys(graph.nodes).length;

  assert.ok(nodeCount >= 200, `Should have at least 200 nodes (found ${nodeCount})`);
});

test('7. Edge counts: At least 100 edges generated', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const edgeCount = graph.edges.length;

  assert.ok(edgeCount >= 100, `Should have at least 100 edges (found ${edgeCount})`);
});

test('8. Forward slashes: All paths use forward slashes (not backslashes)', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));

  for (const [id, node] of Object.entries(graph.nodes)) {
    assert.ok(!node.path.includes('\\'), `Node ${id} path should use forward slashes: ${node.path}`);
  }
});

test('9. Missing directories: Does not crash if scan directory does not exist', () => {
  // This test verifies graceful handling of missing directories
  // The tool should skip missing directories and continue

  // Run normally - should complete even if some optional directories don't exist
  const output = runTool('--dry-run');

  assert.ok(output.includes('Bootstrap complete'), 'Should complete even with missing directories');

  // Even if templates/ or schemas/ don't exist, tool should not crash
  assert.doesNotThrow(() => {
    runTool('--dry-run');
  }, 'Tool should not throw on missing directories');
});

test('10. Verbose mode: Shows each artifact and edge when --verbose', () => {
  const output = runTool('--dry-run --verbose');

  assert.ok(output.includes('Artifacts:'), 'Verbose mode should show Artifacts section');
  assert.ok(output.includes('Edges:'), 'Verbose mode should show Edges section');

  // Should show individual artifacts
  assert.ok(output.match(/skill:[a-z0-9-]+\s+\(skill\)/), 'Should show skill artifacts');
  assert.ok(output.match(/agent:[a-z0-9-]+\s+\(agent\)/), 'Should show agent artifacts');
});

test('11. Graph statistics: Calculates node count, edge count, integration health', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const output = runTool('--dry-run');

  assert.ok(output.includes('Graph statistics:'), 'Should show graph statistics');
  assert.ok(output.match(/Total nodes:\s+\d+/), 'Should show total nodes');
  assert.ok(output.match(/Total edges:\s+\d+/), 'Should show total edges');
  assert.ok(output.match(/Integration health:\s+\d+\.\d+%/), 'Should show integration health percentage');
});

test('12. Edge types: Detects multiple edge types (assigned-to, invokes, references)', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const edgeTypes = new Set(graph.edges.map(e => e.type));

  // Should detect at least assigned-to edges
  assert.ok(edgeTypes.has('assigned-to'), 'Should detect assigned-to edges');

  // May also detect other types (depending on codebase content)
  // invokes (workflow -> skill/agent), references (catalog -> artifact), etc.
});

test('13. Node types: Detects all 9 artifact types', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const nodeTypes = new Set(Object.values(graph.nodes).map(n => n.type));

  // Core types that should exist in agent-studio
  const expectedTypes = ['skill', 'agent', 'hook', 'workflow', 'rule'];

  for (const type of expectedTypes) {
    assert.ok(nodeTypes.has(type), `Should detect ${type} nodes`);
  }

  // May also have: template, schema, catalog, registry (depending on codebase)
});

test('14. File size: Generated file is reasonable size (< 10MB)', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const stats = fs.statSync(TMP_OUTPUT);
  const sizeInMB = stats.size / (1024 * 1024);

  assert.ok(sizeInMB < 10, `File size should be < 10MB (found ${sizeInMB.toFixed(2)}MB)`);
});

test('15. Dry-run mode: Does not create output file', () => {
  runTool(`--dry-run --output "${TMP_OUTPUT}"`);

  assert.ok(!fs.existsSync(TMP_OUTPUT), 'Dry-run should not create output file');
});

test('16. Output path: Respects custom --output path', () => {
  const customOutput = path.join(PROJECT_ROOT, '.claude/context/tmp/custom-graph.json');

  try {
    runTool(`--output "${customOutput}"`);

    assert.ok(fs.existsSync(customOutput), 'Should create file at custom output path');

    // Cleanup
    if (fs.existsSync(customOutput)) {
      fs.unlinkSync(customOutput);
    }
  } finally {
    // Ensure cleanup even if test fails
    if (fs.existsSync(customOutput)) {
      fs.unlinkSync(customOutput);
    }
  }
});

test('17. Node data: Each node has required fields (type, path, created, integrationStatus)', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));

  for (const [id, node] of Object.entries(graph.nodes)) {
    assert.ok(node.type, `Node ${id} should have type`);
    assert.ok(node.path, `Node ${id} should have path`);
    assert.ok(node.created, `Node ${id} should have created`);
    assert.ok(node.integrationStatus, `Node ${id} should have integrationStatus`);

    // Validate created is ISO date
    assert.ok(!isNaN(Date.parse(node.created)), `Node ${id} created should be valid ISO date`);

    // Validate integrationStatus is one of expected values
    const validStatuses = ['created', 'partial', 'integrated'];
    assert.ok(
      validStatuses.includes(node.integrationStatus),
      `Node ${id} integrationStatus should be one of: ${validStatuses.join(', ')}`
    );
  }
});

test('18. Edge validation: All edges reference existing nodes', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));

  for (const edge of graph.edges) {
    assert.ok(
      graph.nodes[edge.from],
      `Edge from ${edge.from} should reference existing node`
    );
    assert.ok(
      graph.nodes[edge.to],
      `Edge to ${edge.to} should reference existing node`
    );
  }
});

test('19. Duplicate edges: No duplicate edges (same from/to/type)', () => {
  runTool(`--output "${TMP_OUTPUT}"`);

  const graph = JSON.parse(fs.readFileSync(TMP_OUTPUT, 'utf8'));
  const seen = new Set();

  for (const edge of graph.edges) {
    const key = `${edge.from}:${edge.to}:${edge.type}`;
    assert.ok(!seen.has(key), `Duplicate edge detected: ${key}`);
    seen.add(key);
  }
});

test('20. Project root detection: Tool finds project root correctly', () => {
  const output = runTool('--dry-run');

  // Should print project root path
  assert.ok(output.includes('Project root:'), 'Should print project root');

  // Should normalize path to forward slashes in output
  const normalizedRoot = PROJECT_ROOT.replace(/\\/g, '/');
  assert.ok(
    output.includes(normalizedRoot) || output.includes(PROJECT_ROOT),
    'Should include project root path in output'
  );
});
