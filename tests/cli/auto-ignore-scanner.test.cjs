const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

test('auto-ignore-scanner CLI generates valid .claudeignore rules for massive files', async (_t) => {
  // Setup temporary workspace
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-ignore-test-'));
  const scannerPath = path.resolve(__dirname, '../../.claude/tools/cli/auto-ignore-scanner.cjs');
  const existingIgnorePath = path.join(tmpDir, '.claudeignore');
  
  // Create a 2KB "safe" file (approx ~500 tokens)
  const safeFile = path.join(tmpDir, 'safe-config.json');
  fs.writeFileSync(safeFile, 'a'.repeat(2048));
  
  // Create a 400KB "massive" file (approx ~100K tokens, threshold is 80K tokens / 320KB)
  const massiveFile = path.join(tmpDir, 'bloated-log.json');
  fs.writeFileSync(massiveFile, 'a'.repeat(400 * 1024));

  // Seed an existing .claudeignore to test non-destructive appending
  fs.writeFileSync(existingIgnorePath, 'node_modules/\n.env\n');

  // Act: Run scanner
  const result = spawnSync(process.execPath, [scannerPath, tmpDir], { encoding: 'utf8' });
  
  // Assert Output
  assert.strictEqual(result.status, 0, `Scanner failed: ${result.stderr}`);
  assert.match(result.stdout, /Found 1 massive files/, 'Should detect exactly one bloated file');
  assert.doesNotMatch(result.stdout, /safe-config\.json/, 'Should ignore the 2KB safe file');
  
  // Assert .claudeignore mutations
  const ignoreContent = fs.readFileSync(existingIgnorePath, 'utf8');
  assert.match(ignoreContent, /node_modules\//, 'Should preserve existing rules');
  assert.match(ignoreContent, /\.env/, 'Should preserve existing rules');
  
  // The path depends on OS (Windows \ vs Linux /), our script forces `/` for claudeignore
  assert.match(ignoreContent, /\/bloated-log\.json/, 'Should correctly escape the massive file rule directly in root');
  assert.match(ignoreContent, /# --- AUTO-IGNORE: MASSIVE FILES START ---/, 'Header should exist');

  // Verify Idempotency (Running again shouldn't duplicate rules endlessly)
  spawnSync(process.execPath, [scannerPath, tmpDir], { encoding: 'utf8' });
  const retryIgnoreContent = fs.readFileSync(existingIgnorePath, 'utf8');
  const countMatches = (retryIgnoreContent.match(/\/bloated-log\.json/g) || []).length;
  assert.strictEqual(countMatches, 1, 'Script should be idempotent and not blindly duplicate rules');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
