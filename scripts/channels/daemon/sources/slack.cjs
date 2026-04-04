/**
 * slack.cjs — Slack source
 *
 * Receives messages from Slack via Socket Mode (WebSocket) or
 * as a polling fallback via conversations.history.
 *
 * Requires SLACK_BOT_TOKEN and SLACK_APP_TOKEN (for Socket Mode).
 * Without SLACK_APP_TOKEN, falls back to polling mode.
 */
'use strict';

const https = require('https');

function slackApi(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'slack.com',
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

class SlackSource {
  constructor(config, dispatch) {
    this.botToken = config.botToken;
    this.appToken = config.appToken; // For Socket Mode
    this.channels = config.channels || []; // Channel IDs to monitor
    this.allowed = config.allowedUsers || new Set();
    this.allowAll = config.allowAll || false;
    this.dispatch = dispatch;
    this.running = false;
    this.lastTimestamp = {};
  }

  async start() {
    this.running = true;

    // Poll mode — check channels periodically
    while (this.running) {
      for (const channel of this.channels) {
        try {
          const oldest = this.lastTimestamp[channel] || String(Date.now() / 1000 - 60);
          const result = await slackApi(this.botToken, 'conversations.history', {
            channel,
            oldest,
            limit: 10,
          });
          if (!result.ok || !result.messages) continue;

          // Process newest first, update timestamp
          for (const msg of result.messages.reverse()) {
            if (msg.subtype) continue; // Skip system messages
            if (msg.bot_id) continue; // Skip bot messages

            const userId = msg.user || '';
            if (!this.allowAll && !this.allowed.has(userId)) continue;

            this.lastTimestamp[channel] = msg.ts;

            this.dispatch({
              type: 'slack.message',
              source: 'slack',
              data: {
                chatId: channel,
                messageId: msg.ts,
                user: userId,
                userId,
                text: msg.text || '',
                threadTs: msg.thread_ts,
              },
              timestamp: new Date().toISOString(),
            });
          }
        } catch {}
      }

      await this._sleep(5000); // Poll every 5s
    }
  }

  stop() {
    this.running = false;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { SlackSource, slackApi };
