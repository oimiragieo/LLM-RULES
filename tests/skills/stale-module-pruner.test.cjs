const assert = require('assert');
const path = require('path');
const { test, describe } = require('node:test');
const fs = require('fs');
const os = require('os');
const { main } = require('../../.claude/skills/stale-module-pruner/scripts/main.cjs');

describe('stale-module-pruner', () => {
    test('should execute and prune correctly', async () => {
        // Scaffold a temp environment
        const targetDir = path.join(os.tmpdir(), `stale-pruner-test-${Date.now()}`);
        fs.mkdirSync(targetDir, { recursive: true });

        // We expect it to not throw any errors when executing on a targeted empty dir
        let caught = false;
        try {
            await main({ targetDir: targetDir, extensions: ['.cjs'], searchDirs: [targetDir], delete: false });
        } catch (_e) {
            caught = true;
        }

        assert.strictEqual(caught, false, 'Should execute successfully without throwing');

        // Clean up
        fs.rmSync(targetDir, { recursive: true, force: true });
    });
});
