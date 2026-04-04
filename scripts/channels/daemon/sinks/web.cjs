/**
 * web.cjs — Web widget sink
 *
 * "Sends" messages by pushing them to the WebSource's SSE clients.
 * The web widget receives responses via the SSE stream.
 */
'use strict';

class WebSink {
  constructor(webSource) {
    this.webSource = webSource;
  }

  async sendTyping() {
    // Web widget handles its own typing indicator client-side
  }

  // eslint-disable-next-line require-await
  async send(chatId, text, _opts = {}) {
    // Extract sessionId from chatId (format: web-<sessionId>)
    const sessionId = chatId.startsWith('web-') ? chatId.slice(4) : chatId;
    this.webSource.pushResponse(sessionId, text);
    return Date.now().toString();
  }
}

module.exports = { WebSink };
