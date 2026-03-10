'use strict';
/**
 * spawn-token-guard.cjs — PreToolUse(Task) hook
 * Estimates spawn prompt token count and triggers compression warning
 * at 80K tokens, blocks at 120K to prevent "Prompt is too long" failures.
 *
 * OpenClaw ContextEngine pattern: auto-compression at threshold (research 2026-03-10)
 */
const fs = require('fs');
const path = require('path');

const WARN_THRESHOLD = 80_000; // tokens — write compression-reminder.txt
const BLOCK_THRESHOLD = 120_000; // tokens — block spawn

const RUNTIME_DIR = path.join(__dirname, '../../context/runtime');
const COMPRESSION_REMINDER = path.join(RUNTIME_DIR, 'compression-reminder.txt');

// Rough token estimator: ~4 chars per token
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const toolName = input?.tool_name || '';

    if (toolName !== 'Task') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const prompt = input?.tool_input?.prompt || '';
    const tokens = estimateTokens(prompt);

    if (tokens >= BLOCK_THRESHOLD) {
      process.stdout.write(
        JSON.stringify({
          allow: false,
          message: `spawn-token-guard: BLOCKED — spawn prompt ~${tokens.toLocaleString()} tokens exceeds ${BLOCK_THRESHOLD.toLocaleString()} hard limit. Run context compression first (token-saver-context-compression skill).`,
        })
      );
      process.exit(0);
    }

    if (tokens >= WARN_THRESHOLD) {
      try {
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        const msg = `Spawn prompt estimated at ~${tokens.toLocaleString()} tokens (>${WARN_THRESHOLD.toLocaleString()}). Trigger context compression before next spawn.\n`;
        fs.writeFileSync(COMPRESSION_REMINDER, msg);
      } catch (_) {
        /* advisory only — do not block on write failure */
      }
      process.stdout.write(
        JSON.stringify({
          allow: true,
          message: `spawn-token-guard: WARN — spawn prompt ~${tokens.toLocaleString()} tokens. compression-reminder.txt written.`,
        })
      );
      process.exit(0);
    }

    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  } catch (_e) {
    // Fail open — advisory hook must not break workflow
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  }
});
