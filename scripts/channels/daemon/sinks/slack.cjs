/**
 * slack.cjs — Slack sink
 *
 * Sends messages to Slack via chat.postMessage API or incoming webhook.
 */
'use strict';

const { slackApi } = require('../sources/slack.cjs');
const https = require('https');

class SlackSink {
  constructor(config) {
    this.botToken = config.botToken;
    this.webhookUrl = config.webhookUrl; // Optional: for incoming webhook mode
  }

  async sendTyping(chatId) {
    // Slack doesn't have a typing indicator API for bots
  }

  async send(chatId, text, opts = {}) {
    const { replyTo } = opts;

    // Webhook mode (simpler, no bot token needed)
    if (this.webhookUrl) {
      return this._sendViaWebhook(text);
    }

    // Bot token mode
    const body = {
      channel: chatId,
      text,
      thread_ts: replyTo || undefined,
    };
    const result = await slackApi(this.botToken, 'chat.postMessage', body);
    return result.ok ? result.ts : null;
  }

  async _sendViaWebhook(text) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl);
      const data = JSON.stringify({ text });
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(res.statusCode === 200 ? 'ok' : null));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = { SlackSink };
