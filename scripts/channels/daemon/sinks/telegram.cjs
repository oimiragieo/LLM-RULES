/**
 * telegram.cjs — Telegram sink
 *
 * Sends messages back to Telegram via Bot API.
 * Like clawhip's sink/discord.rs but for Telegram.
 */
'use strict';

const { telegramApi } = require('../sources/telegram.cjs');

class TelegramSink {
  constructor(token) {
    this.token = token;
  }

  async send(chatId, text, opts = {}) {
    const { replyTo, format } = opts;
    const body = {
      chat_id: chatId,
      text,
      reply_parameters: replyTo ? { message_id: Number(replyTo) } : undefined,
      parse_mode: format === 'markdown' ? 'MarkdownV2' : undefined,
    };
    const result = await telegramApi(this.token, 'sendMessage', body);
    return result.ok ? result.result?.message_id : null;
  }
}

module.exports = { TelegramSink };
