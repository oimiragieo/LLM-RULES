const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '../../../.claude/tools/cli/document-query.cjs');

test('document-query returns matching paragraph for query', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-doc-'));
  const docPath = path.join(tmpDir, 'doc.txt');
  fs.writeFileSync(
    docPath,
    'First paragraph about alpha.\n\nSecond paragraph about beta and gamma.',
    'utf8'
  );

  const result = spawnSync('node', [CLI_PATH, '--document', docPath, '--query', 'beta'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Score'), 'Should include a scored snippet');
  assert.ok(result.stdout.includes('beta'), 'Should include matching paragraph text');
});
