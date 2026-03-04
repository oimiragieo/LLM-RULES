'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const QUEUE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
const SCRIPT_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'process-evolution-queue.cjs');

function cleanupQueue() {
    if (fs.existsSync(QUEUE_FILE)) {
        fs.unlinkSync(QUEUE_FILE);
    }
}

test('Evolution queue processor drains requests and triggers tasks', async () => {
    cleanupQueue();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify({ type: 'evolution_request', intent: 'test_evolution', timestamp: Date.now() }) + '\n', 'utf8');

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SCRIPT_PATH, '--run-once'], {
            cwd: PROJECT_ROOT,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        child.stdout.on('data', chunk => stdout += chunk);

        child.on('close', code => {
            try {
                assert.equal(code, 0);
                assert.ok(stdout.includes('Processing 1 evolution requests'));

                // Assert queue is emptied
                if (fs.existsSync(QUEUE_FILE)) {
                    const content = fs.readFileSync(QUEUE_FILE, 'utf8').trim();
                    assert.equal(content, '');
                }
                cleanupQueue();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
});
