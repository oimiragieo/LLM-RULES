'use strict';

/**
 * Append one entry to the Telegram outbox.
 * Usage:
 *   node telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> <text...>
 *   node telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> --from-file <filepath>
 *
 * --from-file <filepath> reads the message text from the given per-request file path.
 * Each command invocation uses a unique file (tg-result-<messageId>-<ts>.txt) to prevent
 * concurrent write races when multiple commands execute simultaneously.
 *
 * Claude calls this after running a tool so it never has to manipulate JSON directly.
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // agent-studio root
const OUTBOX_FILE = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-outbox.json');

const [, , chatId, replyToMsgId, agentTaskId, ...restArgs] = process.argv;

// --from-file <filepath>: read text from a per-request file path (avoids bash quoting issues
// for multiline/special-char results and prevents concurrent write races).
let text;
if (restArgs[0] === '--from-file') {
  // Accept per-request file path as the argument following --from-file.
  // The path may be relative (resolved against cwd) or absolute.
  const filePath = restArgs[1];
  if (!filePath) {
    process.stderr.write('telegram-write-outbox: --from-file requires a file path argument\n');
    process.exit(1);
  }
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
  try {
    text = fs.readFileSync(resolvedPath, 'utf8').trim();
  } catch (_) {
    process.stderr.write(`telegram-write-outbox: --from-file: cannot read ${resolvedPath}\n`);
    process.exit(1);
  }
} else {
  text = restArgs.join(' ');
}

if (!chatId || !replyToMsgId || !agentTaskId || !text) {
  process.stderr.write(
    'Usage: telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> <text...>\n'
  );
  process.stderr.write(
    '       telegram-write-outbox.cjs <chatId> <replyToMsgId> <agentTaskId> --from-file <filepath>\n'
  );
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
  const parsed = safeParseJSON(raw);
  if (Array.isArray(parsed)) outbox = parsed;
} catch (_) {
  /* start fresh */
}

outbox.push({
  chatId: Number(chatId),
  replyToMessageId: Number(replyToMsgId),
  text: text.slice(0, 4096),
  createdAt: new Date().toISOString(),
  agentTaskId,
});

atomicWrite(OUTBOX_FILE, JSON.stringify(outbox, null, 2));
process.stdout.write(`outbox: appended entry for chat ${chatId}\n`);
