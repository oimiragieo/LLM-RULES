#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');
const { Task } = require('../lib/tools/task-tools.cjs');

const QUEUE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
const LOCK_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'evolution-processor.lock');
const POLL_INTERVAL_MS = 60000;

function acquireLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const stats = fs.statSync(LOCK_FILE);
            if (Date.now() - stats.mtimeMs > 5 * 60 * 1000) {
                // Stale lock
                fs.unlinkSync(LOCK_FILE);
            } else {
                return false;
            }
        }
        fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf8');
        return true;
    } catch (_e) {
        return false;
    }
}

function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
    } catch (_e) {
      // ignore lock release errors
    }
}

async function processQueue() {
    if (!fs.existsSync(QUEUE_FILE)) {
        return;
    }

    if (!acquireLock()) {
        console.log('[Evolution Processor] Another instance is running or locked.');
        return;
    }

    try {
        const content = fs.readFileSync(QUEUE_FILE, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        if (lines.length > 0) {
            console.log(`[Evolution Processor] Processing ${lines.length} evolution requests...`);

            const requests = [];
            for (const line of lines) {
                try {
                    requests.push(JSON.parse(line));
                } catch (_e) {
                    // skip malformed JSON lines
                }
            }

            // We drain it down immediately so we don't block
            fs.writeFileSync(QUEUE_FILE, '', 'utf8');

            // Dispatch to evolution-orchestrator
            for (const req of requests) {
                console.log(`[Evolution Processor] Dispatching orchestrator for request intent: ${req.intent || 'unknown'}`);
                try {
                    await Task({
                        subagent_type: 'evolution-orchestrator',
                        description: `Automated evolution trigger: ${req.intent || 'Periodic processing'}`,
                        prompt: `Execute EVOLVE phase. Review reflection logs and memory for actionable insights: ${JSON.stringify(req)}`,
                        allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'skill-tool']
                    });
                } catch (taskErr) {
                    console.error(`[Evolution Processor] Orchestrator launch failed:`, taskErr);
                }
            }
        }
    } catch (err) {
        console.error('[Evolution Processor] Error:', err);
    } finally {
        releaseLock();
    }
}

async function main() {
    const isRunOnce = process.argv.includes('--run-once');

    if (isRunOnce) {
        await processQueue();
        process.exit(0);
    } else {
        console.log('[Evolution Processor] Starting daemon mode...');
        await processQueue(); // Run immediately once
        setInterval(async () => {
            await processQueue();
        }, POLL_INTERVAL_MS);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    processQueue
};
