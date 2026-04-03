/**
 * renderer.cjs — Claude-powered response renderer with conversation memory
 *
 * KAIROS-style: maintains conversation context across interactions.
 * Each render includes recent chat history so Claude knows what
 * was discussed previously.
 */
'use strict';

const { execSync } = require('child_process');
const { TaskExecutor } = require('./executor.cjs');

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

  render(event) {
    const { text, user, chatId } = event.data;

    // Build context from conversation memory
    let context = '';
    if (this.memory && chatId) {
      context = this.memory.getContext(chatId);

      // Auto-detect context rot: if context is getting too large, compact before rendering.
      // KAIROS compacts at ~93% of context window. Our effective limit is ~6000 chars
      // for the context portion (MAX_CONTEXT_CHARS in memory.cjs). If we're over 80%,
      // force a compaction so the user never notices degradation.
      if (context.length > 4800) {
        this.memory._compactChat(chatId);
        context = this.memory.getContext(chatId); // Re-fetch after compaction
      }
    }

    // Record the user message
    if (this.memory && chatId) {
      this.memory.addMessage(chatId, 'user', text, user);
    }

    const parts = [this.persona];
    if (context) {
      parts.push(`\nRecent chat history:\n${context}`);
    }
    parts.push(`\nNew message from ${user}: ${text}`);

    const prompt = parts.join('\n').replace(/"/g, '\\"').replace(/\n/g, ' ');

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

      // Record assistant response
      if (this.memory && chatId) {
        this.memory.addMessage(chatId, 'assistant', response);
      }

      return response;
    } catch (err) {
      const stderr = err.stderr?.toString()?.trim() || '';
      const stdout = err.stdout?.toString()?.trim() || '';
      const detail = stderr || stdout || err.message || 'unknown';
      return `Error: ${detail.slice(0, 300)}`;
    }
  }

  /**
   * Render a proactive message (timer events, check-ins).
   * No user message — Claude generates based on context/prompt.
   */
  renderProactive(event) {
    const { prompt, chatIds } = event.data;
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
      return null; // Silently skip proactive messages on error
    }
  }
}

module.exports = { ClaudeRenderer };
