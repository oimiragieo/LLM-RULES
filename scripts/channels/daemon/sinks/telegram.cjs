/**
 * telegram.cjs — Telegram sink
 *
 * Sends messages back to Telegram via Bot API.
 * Supports streaming via sendMessageDraft (Bot API 9.5) with
 * editMessageText fallback for older API versions.
 */
'use strict';

const { telegramApi } = require('../sources/telegram.cjs');
const crypto = require('crypto');

const CURSOR = ' ▉';

class TelegramSink {
  constructor(token) {
    this.token = token;
    this._draftSupported = null; // null = unknown, true/false after first attempt
  }

  async sendTyping(chatId) {
    try {
      await telegramApi(this.token, 'sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });
    } catch {
      // Fire-and-forget
    }
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

  /**
   * Start a streaming response. Returns a StreamSession object.
   * Call session.update(text) to progressively update the draft.
   * Call session.finalize(text) to send the final message.
   */
  createStreamSession(chatId, opts = {}) {
    return new StreamSession(this, chatId, opts);
  }
}

/**
 * Manages a single streaming response to a chat.
 *
 * Strategy:
 *   1. Try sendMessageDraft (Bot API 9.5) — native streaming
 *   2. Fallback: sendMessage first, then editMessageText
 */
class StreamSession {
  constructor(sink, chatId, opts = {}) {
    this.sink = sink;
    this.chatId = chatId;
    this.replyTo = opts.replyTo;
    this.draftId = crypto.randomUUID();
    this.messageId = null; // Set after first send (fallback mode)
    this.lastText = '';
    this.lastUpdateTime = 0;
    this.minInterval = 500; // ms between updates
    this.useDraft = sink._draftSupported !== false; // try draft first
    this.finalized = false;
  }

  /**
   * Update the streaming message with accumulated text.
   * Rate-limited to minInterval ms between updates.
   */
  async update(text) {
    if (this.finalized) return;
    const now = Date.now();
    if (now - this.lastUpdateTime < this.minInterval) return;
    if (text === this.lastText) return;

    this.lastText = text;
    this.lastUpdateTime = now;
    const displayText = text + CURSOR;

    if (this.useDraft) {
      try {
        const result = await telegramApi(this.sink.token, 'sendMessageDraft', {
          chat_id: this.chatId,
          text: displayText,
          draft_id: this.draftId,
        });
        if (result.ok) {
          this.sink._draftSupported = true;
          return;
        }
        // API returned error — fall back
        this.useDraft = false;
        this.sink._draftSupported = false;
      } catch {
        this.useDraft = false;
        this.sink._draftSupported = false;
      }
    }

    // Fallback: sendMessage + editMessageText
    if (!this.messageId) {
      const result = await telegramApi(this.sink.token, 'sendMessage', {
        chat_id: this.chatId,
        text: displayText,
        reply_parameters: this.replyTo ? { message_id: Number(this.replyTo) } : undefined,
      });
      if (result.ok) {
        this.messageId = result.result?.message_id;
      }
    } else {
      try {
        await telegramApi(this.sink.token, 'editMessageText', {
          chat_id: this.chatId,
          message_id: this.messageId,
          text: displayText,
        });
      } catch {
        // Edit failed — might be rate limited, skip this update
      }
    }
  }

  /**
   * Finalize the streaming message — send final text without cursor.
   */
  async finalize(text) {
    if (this.finalized) return;
    this.finalized = true;

    if (this.useDraft && this.sink._draftSupported) {
      // Finalize draft with a real sendMessage
      const result = await telegramApi(this.sink.token, 'sendMessage', {
        chat_id: this.chatId,
        text,
        draft_id: this.draftId,
        reply_parameters: this.replyTo ? { message_id: Number(this.replyTo) } : undefined,
      });
      return result.ok ? result.result?.message_id : null;
    }

    // Fallback: final edit to remove cursor
    if (this.messageId) {
      try {
        await telegramApi(this.sink.token, 'editMessageText', {
          chat_id: this.chatId,
          message_id: this.messageId,
          text,
        });
      } catch {}
      return this.messageId;
    }

    // Never sent anything — just send directly
    return this.sink.send(this.chatId, text, { replyTo: this.replyTo });
  }
}

module.exports = { TelegramSink, StreamSession };
