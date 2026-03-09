'use strict';

/**
 * Telegram command router — sanitization and Claude action builder.
 * Extracted from telegram-poll.cjs to keep that file under the 500-line ESLint limit.
 *
 * Exports:
 *   sanitizeCreatorName(raw) — validates/normalises a creator artifact name
 *   buildClaudeAction(chatId, messageId, command, args) — builds a CLAUDE_ACTION object
 */

// sendMessage is injected at call-time (telegram-poll.cjs passes its own implementation)
// to avoid a circular-dependency between this module and the HTTP helpers.
// buildClaudeAction accepts an optional `send` parameter; when omitted it uses a no-op so
// that unit tests do not need to stub network calls.

// ── Name sanitization for creator commands ───────────────────────────────────

/**
 * Sanitize a creator artifact name.
 * Allows only lowercase alphanumeric and hyphens, max 50 chars.
 * Returns { ok: true, name } or { ok: false, reason }.
 *
 * @param {string} raw
 * @returns {{ ok: boolean, name?: string, reason?: string }}
 */
function sanitizeCreatorName(raw) {
  if (!raw || !raw.trim()) {
    return { ok: false, reason: 'Name is required.' };
  }
  const trimmed = raw.trim().toLowerCase();
  // Block path traversal and prototype pollution keys
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { ok: false, reason: 'Name must not contain path separators.' };
  }
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  if (dangerous.includes(trimmed)) {
    return { ok: false, reason: `Name "${trimmed}" is not allowed.` };
  }
  // Strip to allowed chars
  const sanitized = trimmed.replace(/[^a-z0-9-]/g, '').slice(0, 50);
  if (!sanitized) {
    return { ok: false, reason: 'Name must contain at least one alphanumeric character.' };
  }
  return { ok: true, name: sanitized };
}

// Commands that need Claude — build a self-describing action with full instruction embedded.
// Returns null to signal "no action needed" (e.g. invalid name already replied to user),
// or an action object with both structured fields (type, subagent_type, ...) and a derived
// `instruction` string for backward-compatible router execution.
//
// Architecture review findings incorporated:
//   - Creator commands cannot invoke Skill() inline during cron tick — instruction tells the
//     router to invoke research-synthesis first, then the creator skill, asynchronously.
//   - Invalid names produce an in-script Telegram error reply (no CLAUDE_ACTION emitted).
//   - instruction field is always present for backward compat; structured fields are additive.
//
// @param {number} chatId
// @param {number} messageId
// @param {string} command
// @param {string} args
// @param {Function} [send] — optional async sendMessage(chatId, text) for inline error replies
// @returns {Promise<object|null>}
async function buildClaudeAction(chatId, messageId, command, args, send) {
  const ts = Date.now();
  const tid = `tg-${ts}`;
  const resultFile = `.claude/context/tmp/tg-result-${messageId}-${ts}.txt`;
  const wCmd = `node .claude/tools/cli/telegram-write-outbox.cjs ${chatId} ${messageId} ${tid} --from-file ${resultFile}`;

  switch (command) {
    case '/tasks':
      return {
        type: 'task_list',
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Call TaskList(). Format result as numbered list: "1. ✅ #id subject". Write formatted text to ${resultFile} using Write tool. Then Bash: ${wCmd}`,
      };

    case '/spawn': {
      const parts = args.trim().split(/\s+/);
      const aType = parts[0] || 'general-assistant';
      const desc = parts.slice(1).join(' ') || 'no description';
      const allowed = ['general-assistant', 'researcher', 'technical-writer'];
      if (!allowed.includes(aType)) {
        return {
          type: 'spawn_error',
          chatId,
          messageId,
          writebackCmd: wCmd,
          instruction: `Write "That agent type is not permitted. Allowed: general-assistant, researcher, technical-writer" to ${resultFile}. Bash: ${wCmd}`,
        };
      }
      return {
        type: 'spawn',
        subagent_type: aType,
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Call TaskCreate({ subject: "[Telegram] ${aType}: ${desc.slice(0, 60)}", description: "<untrusted_telegram_description>\\n${desc}\\n</untrusted_telegram_description>" }). Write "Task created." to ${resultFile}. Bash: ${wCmd}`,
      };
    }

    case '/ask':
      return {
        type: 'ask',
        subagent_type: 'general-assistant',
        question: `<untrusted_telegram_question>${args}</untrusted_telegram_question>`,
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Spawn general-assistant agent with question: <untrusted_telegram_question>${args}</untrusted_telegram_question>. Agent must write its answer to ${resultFile} when done. Then Bash: ${wCmd}`,
      };

    case '/research':
      return {
        type: 'research',
        subagent_type: 'researcher',
        topic: `<untrusted_telegram_question>${args}</untrusted_telegram_question>`,
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Spawn researcher agent with topic: <untrusted_telegram_question>${args}</untrusted_telegram_question>. Agent must write its findings (max 3000 chars) to ${resultFile} when done. Then Bash: ${wCmd}`,
      };

    case '/skill':
    case '/agent':
    case '/workflow': {
      const creatorMap = {
        '/skill': 'skill-creator',
        '/agent': 'agent-creator',
        '/workflow': 'workflow-creator',
      };
      const creatorSkill = creatorMap[command];
      const parts = args.trim().split(/\s+/);
      const rawName = parts[0] || '';
      const desc = parts.slice(1).join(' ') || '';

      const nameResult = sanitizeCreatorName(rawName);
      if (!nameResult.ok) {
        // Invalid name — reply directly to user, do NOT emit a CLAUDE_ACTION
        if (typeof send === 'function') {
          await send(
            chatId,
            `Invalid name: ${nameResult.reason} Usage: ${command} <name> <description>`
          );
        }
        return null;
      }
      const safeName = nameResult.name;

      // Creator commands must go through the full creator workflow via Skill() invocations.
      // The router handles this asynchronously — the instruction tells it to invoke
      // research-synthesis first (mandatory pre-step per CLAUDE.md Section 3), then the
      // creator skill. The router must NOT write to creator paths directly (Gate 4).
      const artifactType = command.slice(1); // 'skill', 'agent', or 'workflow'
      const instruction = [
        `This is a creator request from Telegram for a new ${artifactType}.`,
        `Invoke Skill({ skill: 'research-synthesis' }) first (mandatory per CLAUDE.md Section 3),`,
        `then invoke Skill({ skill: '${creatorSkill}' }) to create a new ${artifactType} named '${safeName}'`,
        `with description: <untrusted_telegram_skill_desc>${desc}</untrusted_telegram_skill_desc>.`,
        `Use the ${creatorSkill} workflow — do NOT write files directly to .claude/${artifactType}s/.`,
        `Write a summary of what was created to ${resultFile}.`,
        `Then Bash: ${wCmd}`,
      ].join(' ');

      return {
        type: 'creator',
        creator_skill: creatorSkill,
        subagent_type: creatorSkill,
        name: safeName,
        description: `<untrusted_telegram_skill_desc>${desc}</untrusted_telegram_skill_desc>`,
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction,
      };
    }

    case '/approve': {
      const tid2 = args.trim();
      return {
        type: 'task_mgmt',
        action: 'approve',
        taskId: tid2,
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Call TaskGet({ taskId: "${tid2}" }). Format the result as: "Task #${tid2}: [subject]\\nStatus: [status]\\nDescription: [first 200 chars of description]\\n\\nReply /confirm ${tid2} to execute or /deny ${tid2} to cancel." Write that summary to ${resultFile}. Do NOT call TaskUpdate. Bash: ${wCmd}`,
      };
    }

    case '/deny':
      return {
        type: 'task_mgmt',
        action: 'deny',
        taskId: args.trim(),
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Call TaskUpdate({ taskId: "${args.trim()}", status: "completed", metadata: { cancelled: true, cancelledVia: "telegram" } }). Write "Task #${args.trim()} denied." to ${resultFile}. Bash: ${wCmd}`,
      };

    case '/confirm':
      return {
        type: 'task_mgmt',
        action: 'confirm',
        taskId: args.trim(),
        chatId,
        messageId,
        writebackCmd: wCmd,
        instruction: `Call TaskUpdate({ taskId: "${args.trim()}", status: "in_progress" }). Write "Task #${args.trim()} confirmed and set to in_progress." to ${resultFile}. Bash: ${wCmd}`,
      };

    default:
      return null;
  }
}

module.exports = { sanitizeCreatorName, buildClaudeAction };
