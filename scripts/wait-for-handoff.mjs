#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// Script: wait-for-handoff.mjs
// Purpose: P2 - End-to-end handshake script that polls for `shift-change-ack.json`
// Output: Exits 0 on successful handoff, 1 on timeout/abort
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = process.argv.includes('--timeout') ? 
    parseInt(process.argv[process.argv.indexOf('--timeout') + 1], 10) * 1000 : 
    5 * 60 * 1000; // default 5 minutes

const runtimeDir = path.join(process.cwd(), '.claude/context/runtime');
const ackPath = path.join(runtimeDir, 'shift-change-ack.json');

console.log(`[wait-for-handoff] Polling every ${POLL_INTERVAL_MS/1000}s for context handoff ACK...`);
console.log(`[wait-for-handoff] Max wait configured to ${MAX_WAIT_MS/1000/60} minutes.`);

const startTime = Date.now();

// Clean up any stale ACK file first to ensure we catch a *fresh* handoff
if (fs.existsSync(ackPath)) {
  try {
    fs.unlinkSync(ackPath);
    console.log('[wait-for-handoff] Cleared old ACK file.');
  } catch (e) {
    console.warn('[wait-for-handoff] Could not clear old ACK file:', e.message);
  }
}

function poll() {
  if (Date.now() - startTime > MAX_WAIT_MS) {
    console.error(`\n[wait-for-handoff] ERROR: Timed out after ${MAX_WAIT_MS/1000}s waiting for handoff.`);
    process.exit(1);
  }

  if (fs.existsSync(ackPath)) {
    try {
      const ackContent = fs.readFileSync(ackPath, 'utf8');
      const ack = JSON.parse(ackContent);
      console.log(`\n[wait-for-handoff] SUCCESS: Context successfully claimed by session ${ack.claimedBy} at ${ack.timestamp}!`);
      
      // Cleanup the ACK so it doesn't linger
      fs.unlinkSync(ackPath);
      process.exit(0);
    } catch (error) {
      console.warn(`[wait-for-handoff] Found ACK but couldn't parse it: ${error.message}. Retrying...`);
    }
  }

  process.stdout.write('.');
  setTimeout(poll, POLL_INTERVAL_MS);
}

setTimeout(poll, POLL_INTERVAL_MS);
