'use strict';

/**
 * Append one entry to the Telegram outbox.
 * Usage:
 *   node telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> <text...>
 *   node telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> --from-file
 *
 * --from-file reads the message text from .claude/context/tmp/tg-pending-result.txt
 * (avoids bash quoting issues for multiline/special-char results).
 *
 * Claude calls this after running a tool so it never has to manipulate JSON directly.
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..', '..', '..'); // agent-studio root
const OUTBOX_FILE = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-outbox.json');

const [,, chatId, replyToMsgId, agentTaskId, ...restArgs] = process.argv;

// --from-file: read text from a fixed temp path (avoids bash quoting issues for multiline results)
const TMP_RESULT = path.join(ROOT, '.claude', 'context', 'tmp', 'tg-pending-result.txt');
let text;
if (restArgs[0] === '--from-file') {
  try {
    text = fs.readFileSync(TMP_RESULT, 'utf8').trim();
  } catch (_) {
    process.stderr.write(`telegram-write-outbox: --from-file: cannot read ${TMP_RESULT}\n`);
    process.exit(1);
  }
} else {
  text = restArgs.join(' ');
}

if (!chatId || !replyToMsgId || !agentTaskId || !text) {
  process.stderr.write('Usage: telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> <text...>\n');
  process.stderr.write('       telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> --from-file\n');
  process.exit(1);
}

function atomicWrite(target, content) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = target + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

let outbox = [];
try {
  const raw = fs.readFileSync(OUTBOX_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) outbox = parsed;
} catch (_) { /* start fresh */ }

outbox.push({
  chatId: Number(chatId),
  replyToMessageId: Number(replyToMsgId),
  text: text.slice(0, 4096),
  createdAt: new Date().toISOString(),
  agentTaskId,
});

atomicWrite(OUTBOX_FILE, JSON.stringify(outbox, null, 2));
process.stdout.write(`outbox: appended entry for chat ${chatId}\n`);
