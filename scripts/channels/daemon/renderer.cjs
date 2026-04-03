/**
 * renderer.cjs — Claude-powered response renderer with streaming + memory
 *
 * KAIROS-style: maintains conversation context across interactions.
 * Supports both sync (render) and async streaming (renderStream) modes.
 */
'use strict';

const { execSync, execFile } = require('child_process');

const SYSTEM_PROMPT = `You are Agent Studio — an AI assistant running as a persistent background daemon, communicating via Telegram.

## Output Rules
- Respond with ONLY your message text. No tool calls, no code blocks wrapping your answer, no metadata.
- Do NOT try to call any tools, MCP tools, or send messages yourself. Just output the response text directly.
- Keep responses concise (under 500 chars) unless the user asks for detail.
- Use casual, conversational tone. You're a chat buddy, not a formal assistant.

## Platform Context
- Source: Telegram (messages arrive from allowed users)
- You do NOT have access to Telegram APIs — the daemon handles sending your response.
- You do NOT have access to the filesystem, code tools, or bash. You only generate text responses.
- If the user asks you to do something that requires tools (file editing, running code, git), tell them to use the main Claude Code session for that and offer to help plan the approach.

## Memory
- You have memory of previous conversations (shown as chat history below when available).
- Reference previous context naturally — if the user mentioned their name before, use it.
- If you know facts about the user (shown as "Known facts" below), incorporate them naturally.
- You're a persistent agent — conversations span across sessions. Act like you know the person.

## Capabilities
- Answer questions, brainstorm, plan, explain code concepts, review approaches
- Remember user preferences and context across conversations
- Provide status updates on the agent-studio project when asked

## Task Execution
If the user asks you to DO something (run code, edit files, check git status, run tests, etc.), you CAN do it!
Start your response with exactly \`[TASK]\` on the first line, followed by the task description.
The daemon will detect this tag and spawn a headless Claude session with full tool access to execute it.

Examples:
- User: "check if the tests pass" → respond: [TASK] Run the test suite and report results
- User: "what's on the current git branch" → respond: [TASK] Run git status and git log --oneline -5
- User: "fix the typo in README.md" → respond: [TASK] Read README.md, find typos, and fix them

For simple questions that don't need tools (chat, brainstorm, explain), just respond normally without the [TASK] tag.`;

class ClaudeRenderer {
  constructor(config, memory) {
    this.model = config.model || 'sonnet';
    this.projectRoot = config.projectRoot || process.cwd();
    this.memory = memory || null;
    this.persona = config.persona || SYSTEM_PROMPT;
  }

  /**
   * Build the prompt from event + memory context.
   * Shared between sync and async render paths.
   */
  _buildPrompt(event) {
    const { text, user, chatId } = event.data;

    let context = '';
    if (this.memory && chatId) {
      context = this.memory.getContext(chatId);
      if (context.length > 4800) {
        this.memory._compactChat(chatId);
        context = this.memory.getContext(chatId);
      }
    }

    if (this.memory && chatId) {
      this.memory.addMessage(chatId, 'user', text, user);
    }

    const parts = [this.persona];
    if (context) parts.push(`\nRecent chat history:\n${context}`);

    // Handle attachments
    const { attachmentType, attachmentFileId } = event.data;
    if (attachmentType === 'voice' || attachmentType === 'audio') {
      parts.push(
        `\n${user} sent a voice/audio message. You cannot listen to it directly. Tell them you received their voice message but can only process text right now. Ask them to type their message instead, or suggest they enable the voice pipeline (/check-telegram-voice) for voice transcription support.`
      );
    } else if (attachmentType === 'photo') {
      parts.push(
        `\n${user} sent a photo. You cannot see images. Acknowledge you received it and ask them to describe what they need help with.`
      );
    } else if (attachmentType === 'document') {
      parts.push(
        `\n${user} sent a document. You cannot read files directly. Acknowledge receipt and ask what they need help with regarding the document.`
      );
    }

    parts.push(`\nNew message from ${user}: ${text}`);

    return parts.join('\n').replace(/"/g, '\\"').replace(/\n/g, ' ');
  }

  /**
   * Synchronous render — blocks until complete. Used as fallback.
   */
  render(event) {
    const prompt = this._buildPrompt(event);
    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const result = execSync(
        `claude -p "${prompt}" --dangerously-skip-permissions --model ${this.model} --max-turns 3`,
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 120000,
          env,
          windowsHide: true,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      const response = result || 'Sorry, I could not generate a response.';
      if (this.memory && event.data.chatId) {
        this.memory.addMessage(event.data.chatId, 'assistant', response);
      }
      return response;
    } catch (err) {
      const stderr = err.stderr?.toString()?.trim() || '';
      const stdout = err.stdout?.toString()?.trim() || '';
      return `Error: ${(stderr || stdout || err.message || 'unknown').slice(0, 300)}`;
    }
  }

  /**
   * Async streaming render — calls onChunk as text accumulates.
   * Returns the full response when complete.
   *
   * @param {Object} event — the event to render
   * @param {Function} onChunk — called with (accumulatedText) periodically
   * @returns {Promise<string>} — the full response
   */
  renderStream(event, onChunk) {
    const prompt = this._buildPrompt(event);
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    return new Promise((resolve, reject) => {
      // Use shell=true on Windows for .cmd wrappers
      const child = execFile(
        process.platform === 'win32' ? 'cmd' : 'claude',
        process.platform === 'win32'
          ? [
              '/c',
              `claude -p "${prompt}" --dangerously-skip-permissions --model ${this.model} --max-turns 3`,
            ]
          : [
              '-p',
              prompt,
              '--dangerously-skip-permissions',
              '--model',
              this.model,
              '--max-turns',
              '3',
            ],
        {
          cwd: this.projectRoot,
          env,
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 1024 * 1024, // 1MB
        },
        (error, stdout, stderr) => {
          // This fires when the process exits — we use it as final fallback
          // but normally resolve from the stream handler below
        }
      );

      let accumulated = '';
      let lastChunkTime = 0;
      let resolved = false;

      child.stdout.on('data', data => {
        accumulated += data.toString();
        const now = Date.now();
        // Rate-limit chunk callbacks to avoid flooding Telegram API
        if (now - lastChunkTime >= 500 && onChunk) {
          onChunk(accumulated);
          lastChunkTime = now;
        }
      });

      child.stderr.on('data', data => {
        // Ignore stderr (debug output from claude)
      });

      child.on('close', code => {
        if (resolved) return;
        resolved = true;
        const response = accumulated.trim() || 'Sorry, I could not generate a response.';

        // Record in memory
        if (this.memory && event.data.chatId) {
          this.memory.addMessage(event.data.chatId, 'assistant', response);
        }

        resolve(response);
      });

      child.on('error', err => {
        if (resolved) return;
        resolved = true;
        resolve(`Error: ${err.message?.slice(0, 300)}`);
      });

      // Safety timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            child.kill();
          } catch {}
          const response = accumulated.trim() || 'Response timed out.';
          if (this.memory && event.data.chatId) {
            this.memory.addMessage(event.data.chatId, 'assistant', response);
          }
          resolve(response);
        }
      }, 125000);
    });
  }

  /**
   * Render a proactive message (timer events, check-ins).
   */
  renderProactive(event) {
    const { prompt } = event.data;
    const fullPrompt = `${this.persona}\n\n${prompt}`.replace(/"/g, '\\"').replace(/\n/g, ' ');
    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      return execSync(
        `claude -p "${fullPrompt}" --dangerously-skip-permissions --model ${this.model} --max-turns 1`,
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 60000,
          env,
          windowsHide: true,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();
    } catch {
      return null;
    }
  }
}

module.exports = { ClaudeRenderer };
