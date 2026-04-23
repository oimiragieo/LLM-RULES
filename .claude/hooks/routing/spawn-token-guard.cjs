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
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// D8: Configurable Context Thresholds — read from env with fallback to hardcoded defaults
const DEFAULT_WARN = 80_000;
const DEFAULT_BLOCK = 120_000;

function parseThreshold(envVal, fallback) {
  if (!envVal) return fallback;
  const n = parseInt(envVal, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WARN_THRESHOLD = parseThreshold(process.env.CONTEXT_THRESHOLD_WARN, DEFAULT_WARN);
const BLOCK_THRESHOLD = parseThreshold(process.env.CONTEXT_THRESHOLD_BLOCK, DEFAULT_BLOCK);

// Spawn-budget pre-flight (S3): projected context = skills + memory + prompt
// Default warn at 50K tokens; hard block at WARN_BUDGET * 1.6 (~80K for default)
const DEFAULT_SPAWN_BUDGET = 50_000;
const SPAWN_BUDGET_HARD_MULTIPLIER = 1.6;

const SPAWN_BUDGET_WARN = parseThreshold(
  process.env.SPAWN_BUDGET_DEFAULT_CONTEXT,
  DEFAULT_SPAWN_BUDGET
);
const SPAWN_BUDGET_HARD_LIMIT = Math.floor(SPAWN_BUDGET_WARN * SPAWN_BUDGET_HARD_MULTIPLIER);
const SPAWN_BUDGET_HARD_MODE = (process.env.SPAWN_BUDGET_HARD || '').toLowerCase() === 'on';

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
    const input = safeParseJSON(Buffer.concat(chunks).toString());
    const toolName = input?.tool_name || '';

    if (toolName !== 'Task') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const prompt = input?.tool_input?.prompt || '';
    const tokens = estimateTokens(prompt);

    if (tokens >= BLOCK_THRESHOLD) {
      process.stderr.write(
        `spawn-token-guard: BLOCKED — spawn prompt ~${tokens.toLocaleString()} tokens exceeds ${BLOCK_THRESHOLD.toLocaleString()} hard limit. Run context compression first (context-compressor skill).\n`
      );
      process.stderr.write(`DEGRADE: reason=context_too_large threshold=${BLOCK_THRESHOLD}\n`);
      process.exit(4);
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

    // -----------------------------------------------------------------------
    // Spawn-budget pre-flight: projected context = skills + memory + prompt
    // Only fires when _spawn_budget_meta is present (backward compatible).
    // -----------------------------------------------------------------------
    try {
      const meta = input?.tool_input?._spawn_budget_meta;
      if (meta && typeof meta === 'object') {
        const skillsChars = Number(meta.skills_context_chars) || 0;
        const memoryChars = Number(meta.memory_payload_chars) || 0;
        const totalChars = prompt.length + skillsChars + memoryChars;
        const projectedTokens = Math.floor(totalChars / 4);

        if (projectedTokens >= SPAWN_BUDGET_WARN) {
          const warningMsg = `CONTEXT BUDGET WARNING: projected ~${projectedTokens.toLocaleString()} tokens (skills + memory + prompt)`;

          if (projectedTokens >= SPAWN_BUDGET_HARD_LIMIT && SPAWN_BUDGET_HARD_MODE) {
            process.stderr.write(
              `spawn-token-guard: BLOCKED — ${warningMsg}. Reduce skill/memory payload before spawning.\n`
            );
            process.stderr.write(
              `DEGRADE: reason=projected_budget_exceeded threshold=${SPAWN_BUDGET_HARD_LIMIT}\n`
            );
            process.exit(4);
          }

          // Warn (soft): allow but surface the message
          process.stdout.write(JSON.stringify({ allow: true, message: warningMsg }));
          process.exit(0);
        }
      }
    } catch (_budgetErr) {
      // Fail open — projected-context check must never block workflow
    }

    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  } catch (_e) {
    // Fail open — advisory hook must not break workflow
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  }
});
