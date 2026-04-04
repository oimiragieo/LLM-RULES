/**
 * discord.cjs — Discord sink
 *
 * Sends messages to Discord channels via REST API.
 */
'use strict';

const { discordApi } = require('../sources/discord.cjs');

class DiscordSink {
  constructor(token) {
    this.token = token;
  }

  async sendTyping(chatId) {
    try {
      await discordApi(this.token, 'POST', `/channels/${chatId}/typing`);
    } catch {
      /* ignored */
    }
  }

  async send(chatId, text, opts = {}) {
    const { replyTo } = opts;
    const body = {
      content: text.slice(0, 2000), // Discord 2000 char limit
      message_reference: replyTo ? { message_id: replyTo } : undefined,
    };
    const result = await discordApi(this.token, 'POST', `/channels/${chatId}/messages`, body);
    return result.id || null;
  }
}

module.exports = { DiscordSink };
