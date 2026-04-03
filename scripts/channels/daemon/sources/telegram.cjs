/**
 * telegram.cjs — Telegram source
 *
 * Long-polls the Telegram Bot API and emits events to the dispatcher.
 * Like clawhip's source/git.rs but for Telegram.
 */
'use strict';

const https = require('https');

function telegramApi(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: data ? 'POST' : 'GET',
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            resolve({ ok: false });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(35000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

class TelegramSource {
  constructor(config, dispatch) {
    this.token = config.token;
    this.allowed = config.allowedUsers;
    this.allowAll = config.allowAll;
    this.dispatch = dispatch;
    this.lastUpdateId = 0;
    this.running = false;
  }

  async start() {
    this.running = true;

    // Register bot command menu (like OpenClaw's set_my_commands)
    try {
      await telegramApi(this.token, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Welcome & command list' },
          { command: 'help', description: 'Show all commands' },
          { command: 'status', description: 'Daemon stats & uptime' },
          { command: 'memory', description: 'What I remember about you' },
          { command: 'tasks', description: 'Recent task history' },
          { command: 'dream', description: 'Consolidate learnings' },
          { command: 'history', description: 'Recent conversations' },
          { command: 'new', description: 'Start fresh conversation' },
          { command: 'compress', description: 'Compact chat memory' },
          { command: 'forget', description: 'Clear all my data' },
          { command: 'model', description: 'Current AI model' },
          { command: 'ping', description: 'Check if alive' },
        ],
      });
    } catch {}

    // Clear competing connections
    try {
      await telegramApi(this.token, 'getUpdates?timeout=0');
    } catch {}

    while (this.running) {
      try {
        const data = await telegramApi(
          this.token,
          `getUpdates?offset=${this.lastUpdateId}&timeout=30`
        );
        if (!data.ok || !data.result) {
          await this._sleep(5000);
          continue;
        }

        for (const update of data.result) {
          this.lastUpdateId = update.update_id + 1;
          if (!update.message) continue;

          const senderId = String(update.message.from?.id || '');
          const senderUsername = update.message.from?.username || '';
          if (!this.allowAll && !this.allowed.has(senderId) && !this.allowed.has(senderUsername))
            continue;

          let text = update.message.text || '';
          let attachmentFileId = null;
          let attachmentType = null;

          // Handle voice/audio messages
          if (update.message.voice) {
            attachmentFileId = update.message.voice.file_id;
            attachmentType = 'voice';
            if (!text) text = '[Voice message]';
          } else if (update.message.audio) {
            attachmentFileId = update.message.audio.file_id;
            attachmentType = 'audio';
            if (!text) text = '[Audio message]';
          } else if (update.message.document) {
            attachmentFileId = update.message.document.file_id;
            attachmentType = 'document';
            if (!text) text = `[Document: ${update.message.document.file_name || 'file'}]`;
          } else if (update.message.photo && update.message.photo.length > 0) {
            const best = update.message.photo[update.message.photo.length - 1];
            attachmentFileId = best.file_id;
            attachmentType = 'photo';
            if (!text) text = '[Photo]';
          }

          if (!text && !attachmentFileId) continue;

          const chatId = String(update.message.chat?.id || '');
          const msgData = {
            chatId,
            messageId: update.message.message_id,
            user: senderUsername || senderId,
            userId: senderId,
            text,
            attachmentFileId,
            attachmentType,
          };

          // Route / commands to the command handler
          if (text.startsWith('/') && this.onCommand) {
            const handled = await this.onCommand(msgData);
            if (handled) continue; // Command handled, don't dispatch to Claude
          }

          this.dispatch({
            type: 'telegram.message',
            source: 'telegram',
            data: msgData,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        if (this.running) await this._sleep(5000);
      }
    }
  }

  stop() {
    this.running = false;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { TelegramSource, telegramApi };
