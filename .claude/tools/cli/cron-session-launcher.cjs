#!/usr/bin/env node
/**
 * Cron Session Launcher
 * Spins up a persistent, detached Claude CLI background session for cron execution.
 * Respects CRON_SUBPROCESS_MODE (shadow|active) and handles PID locking.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const PID_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'cron-runner.pid');
const MAX_LOCK_RETRIES = 5;
const INITIAL_BACKOFF_MS = 100;

function logFatal(msg) {
    console.error(`[cron-launcher] FATAL: ${msg}`);
    process.exit(1);
}

function acquireLockSync() {
    let retries = 0;
    let backoff = INITIAL_BACKOFF_MS;

    while (retries < MAX_LOCK_RETRIES) {
        try {
            // 'wx' flag throws if file already exists
            const fd = fs.openSync(PID_FILE, 'wx');
            fs.writeSync(fd, String(process.pid));
            fs.closeSync(fd);
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }

            // Check if the process holding the lock is still alive (Windows compatible check)
            try {
                const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
                if (existingPid && !isNaN(existingPid)) {
                    // process.kill(pid, 0) throws ESRCH if process doesn't exist.
                    // On Windows, it throws generic Error if process doesn't exist.
                    try {
                        process.kill(existingPid, 0);

                        // It's still alive => another instance is definitely running
                        console.log(`[cron-launcher] Found running cron-runner instance (PID ${existingPid}). Exiting.`);
                        process.exit(0);
                    } catch (_e) {
                        // Process doesn't exist, stale lock file. We can delete it and retry immediately.
                        try {
                            fs.unlinkSync(PID_FILE);
                            continue; // Retry without sleeping
                        } catch (_unlinkErr) {
                            // Failed to unlink, maybe someone else grabbed it. Fall through to sleep.
                        }
                    }
                }
            } catch (_readErr) {
                // Failed to read PID file, fall through to sleep
            }

            const sleepMs = backoff + Math.floor(Math.random() * backoff);
            // Wait synchronously (simple sleep hack)
            const start = Date.now();
            while (Date.now() - start < sleepMs) {
                // block
            }
            retries++;
            backoff *= 2;
        }
    }

    logFatal(`Failed to acquire lock ${PID_FILE} after ${MAX_LOCK_RETRIES} retries.`);
}

function releaseLockSync() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (_err) {
        // Ignore cleanup errors
    }
}

function main() {
    // 1. Validate Credentials
    if (!process.env.ANTHROPIC_API_KEY) {
        logFatal('ANTHROPIC_API_KEY environment variable is required to start the cron-runner session.');
    }

    // 2. Deployment Flag
    const mode = process.env.CRON_SUBPROCESS_MODE || 'active';
    if (mode !== 'active' && mode !== 'shadow') {
        logFatal(`Invalid CRON_SUBPROCESS_MODE "${mode}". Must be "active" or "shadow".`);
    }

    console.log(`[cron-launcher] Starting in mode: ${mode}`);

    // 3. Acquire lock to prevent multiple runners
    acquireLockSync();

    // Register cleanup
    process.on('exit', releaseLockSync);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));

    // Determine how to run claude
    // Ensure we use the workspace's local Claude CLI if available, or fallback to npx
    const claudeCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const claudeArgs = ['@anthropic-ai/claude-code', '--compact', '-p', 'You are the cron-runner orchestrator. Your only job is to run the cron-runner skill to drain queue items.'];

    // 4. Detached spawn
    console.log(`[cron-launcher] Spawning persistent Claude CLI session...`);

    // Build child env outside spawn call to avoid template literals inside spawn() args
    // (SEC-011: no string interpolation inside spawn() argument list)
    const sessionId = 'cron-runner-' + Date.now();
    const childEnv = Object.assign({}, process.env, {
        CRON_SUBPROCESS_MODE: mode,
        CLAUDE_SESSION_ID: sessionId
    });

    try {
        // We launch claude in detached mode so it outlives this launcher
        // We must pass env to it. We keep stdout/stderr ignored to prevent hang.
        const child = spawn(claudeCmd, claudeArgs, {
            shell: false, // array args — no shell injection vector
            cwd: PROJECT_ROOT,
            detached: true,
            stdio: 'ignore', // Must ignore stdio to truly detach on Windows natively
            windowsHide: true,
            env: childEnv
        });

        child.on('error', (err) => {
            console.error(`[cron-launcher] Failed to spawn child process: ${err.message}`);
            releaseLockSync();
            process.exit(1);
        });

        // Write the new child PID into the lockfile so the lock belongs to the background task!
        if (child.pid) {
            fs.writeFileSync(PID_FILE, String(child.pid));
            // Removing our own cleanup listener since we gave the lock to the child
            process.removeListener('exit', releaseLockSync);
            console.log(`[cron-launcher] Successfully spawned completely detached cron-runner (PID ${child.pid}).`);
        }

        // Unref so the Node process can exit immediately
        child.unref();
        process.exit(0);

    } catch (err) {
        logFatal(`Spawn exception: ${err.message}`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    acquireLockSync,
    releaseLockSync,
    PID_FILE
};
