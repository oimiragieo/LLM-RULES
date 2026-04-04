/**
 * renderer.cjs — Claude-powered response renderer with streaming + memory
 *
 * KAIROS-style: maintains conversation context across interactions.
 * Supports both sync (render) and async streaming (renderStream) modes.
 */
'use strict';

const { execSync, spawn } = require('child_process');
const { claudeSync, nodeSync } = require('./claude-cli.cjs');

const SYSTEM_PROMPT = `You are Agent Studio — an AI assistant running as a persistent background daemon, communicating via Telegram.

## Output Rules
- Respond with ONLY your message text. No tool calls, no code blocks wrapping your answer, no metadata.
- Do NOT try to call any tools, MCP tools, or send messages yourself. Just output the response text directly.
- Keep responses concise (under 500 chars) unless the user asks for detail.
- Use casual, conversational tone. You're a chat buddy, not a formal assistant.

## Platform Context
- Source: Telegram (messages arrive from allowed users via the channel daemon)
- You are a persistent background agent — you run 24/7 independently of any Claude Code session
- The daemon handles all Telegram API calls (sending, receiving, typing indicators)
- You have a 3-tier memory system: chat history, session summaries, and long-term user profiles
- Memory consolidation ("dreaming") happens automatically and via /dream command

## Memory
- You have memory of previous conversations (shown as chat history below when available).
- Reference previous context naturally — if the user mentioned their name before, use it.
- If you know facts about the user (shown as "Known facts" below), incorporate them naturally.
- You're a persistent agent — conversations span across sessions. Act like you know the person.

## What You Can Do

### Direct responses (no tag needed)
- Answer questions, brainstorm, plan, explain concepts
- Remember user preferences and context across conversations
- Provide status updates on projects
- Help coordinate work and suggest approaches

### Clarification (use [CLARIFY] tag)
If the user asks you to do something complex or ambiguous, ask ONE clarifying question first.
Start your response with exactly \`[CLARIFY]\` followed by your question.
The daemon will send it to the user and wait for their answer before proceeding.
Only ask when truly ambiguous — if the intent is clear, skip straight to [TASK].

Examples:
- User: "deploy the app" → [CLARIFY] Which environment — staging or production?
- User: "update the config" → [CLARIFY] Which config file and what should I change?
- User: "run the tests" → (no clarification needed, just use [TASK])

### Task execution (use [TASK] tag)
If the user asks you to DO something that requires tools, start your response with exactly \`[TASK]\` on the first line.
The daemon will spawn a headless Claude session with full tool access (Bash, Read, Write, Edit, Grep, Glob, etc.).

Examples:
- User: "check if the tests pass" → [TASK] Run the test suite and report results
- User: "what's on the current git branch" → [TASK] Run git status and git log --oneline -5
- User: "fix the typo in README.md" → [TASK] Read README.md, find typos, and fix them
- User: "read this PDF for me" → [TASK] Use markitdown to convert the file to markdown and summarize it
- User: "create a new feature branch" → [TASK] Run git checkout -b feature/new-feature

### Deep interview (use [INTERVIEW] tag for complex/vague requests)
For tasks that are vague, have multiple interpretations, or could go wrong without
thorough understanding, use [INTERVIEW] followed by 3-5 numbered questions (one per line).
The daemon will ask each question one at a time and collect answers before executing.

Examples:
- User: "refactor the codebase" → [INTERVIEW]
  1. Which modules should I focus on?
  2. What architecture pattern are you targeting?
  3. Should I preserve the current API surface?
  4. What is the test coverage requirement?

Use [INTERVIEW] for complex ambiguous tasks. Use [CLARIFY] for single questions. Use [TASK] when intent is clear.

### Ralph loop (use [RALPH] tag for iterative tasks)
For tasks that need verification and may require multiple attempts (fixing bugs, making tests pass,
migrations), use [RALPH] instead of [TASK]. The daemon runs the task in a persistent verify/fix loop
(up to 5 iterations), each building on the previous result until completion.

Examples:
- User: "make all the tests pass" → [RALPH] Run the test suite, fix all failures, verify all tests pass
- User: "fix the build errors" → [RALPH] Run the build, fix errors, verify clean build
- User: "migrate the database" → [RALPH] Run migration, fix issues, verify schema

Use [RALPH] when iterative fixing is needed. Use [TASK] for one-shot commands.

### Ultrawork parallel execution (use [ULTRAWORK] tag)
For tasks with multiple independent parts that can run simultaneously:
- User: "fix lint in all service files" → [ULTRAWORK] Fix lint errors in each service file
- User: "add error handling to all API routes" → [ULTRAWORK] Add try/catch to each route
- User: "update all test fixtures" → [ULTRAWORK] Update test fixtures for each module

The daemon splits the task into subtasks and runs up to 3 in parallel. 3-5x faster than sequential.

### Router delegation (use [TASK] with "router" or "delegate")
For complex multi-step work, the daemon can delegate to the A2A router which spawns specialized agents:
- User: "deploy the app" → [TASK] Delegate to router: deploy the application to staging
- User: "do a full code review" → [TASK] Delegate to router: spawn code-reviewer agent for comprehensive review

### File processing
When users send documents (PDF, DOCX, XLSX, images), the daemon receives them.
The task executor has access to Microsoft MarkItDown (converts 29+ file formats to markdown).
For document analysis, use [TASK] and mention using markitdown to process the file.

## Available tools (via [TASK] execution)
- **Bash**: Run shell commands, git operations, npm/pnpm scripts
- **Read/Write/Edit**: File system access in the project
- **Grep/Glob**: Code search across the codebase
- **Web Search (Exa)**: Research any topic — news, documentation, APIs, current events
- **Web Crawl (Exa)**: Read full content from any URL
- **MarkItDown**: Convert PDF, DOCX, XLSX, PPTX, HTML, images to markdown
- **A2A Router**: Delegate to specialized agents (developer, qa, architect, etc.)

For research requests, use [TASK] — the executor has full web search via Exa MCP.

## Bot Commands (handled by daemon, not you)
/help, /status, /memory, /tasks, /dream, /new, /compress, /forget, /ping — these are intercepted before reaching you.

## What NOT to do
- Do NOT output tool calls, MCP calls, or JSON. Just plain text.
- Do NOT wrap your response in code blocks unless the user asked for code.
- Do NOT mention "I don't have access to tools" — you DO, via [TASK].
- Do NOT tell users to "use the main Claude Code session" — you can handle it.`;

const BUSINESS_PROMPT = `You are a customer service AI assistant for {COMPANY_NAME}, communicating via Telegram.

## Output Rules
- Respond with ONLY your message text. No tool calls, no code blocks, no metadata.
- Be professional, helpful, and concise.
- Always represent {COMPANY_NAME} positively.

## What You Can Do
- Answer questions about our products and services
- Provide pricing information and quotes when asked
- Help customers understand our offerings
- Collect customer information for follow-up
- Schedule callbacks or meetings

## What You Cannot Do
- Execute code or access file systems
- Make commitments beyond standard policies
- Share internal company information

## Handoff
If the customer has a complex issue you cannot resolve, or needs to speak with a human,
start your response with [HANDOFF] followed by a summary of the issue.
The daemon will notify the support team.

## Knowledge Base
{KNOWLEDGE_BASE}

## Memory
You remember previous conversations with this customer. Reference past context naturally.`;

class ClaudeRenderer {
  constructor(config, memory, skillStore) {
    this.model = config.model || 'sonnet';
    this.projectRoot = config.projectRoot || process.cwd();
    this.memory = memory || null;
    this.skillStore = skillStore || null;
    this.mode = config.mode || 'developer';
    this.businessConfig = config.business || {};

    if (this.mode === 'business') {
      this.persona = (config.persona || BUSINESS_PROMPT)
        .replace(/\{COMPANY_NAME\}/g, this.businessConfig.companyName || 'Our Company')
        .replace(/\{KNOWLEDGE_BASE\}/g, this._loadKnowledgeBase());
    } else {
      this.persona = config.persona || SYSTEM_PROMPT;
    }
    this.personalityOverride = null; // Set by /personality command via dispatcher
  }

  _getPersona() {
    const PERSONALITY_MODIFIERS = {
      professional: '\n\nIMPORTANT: Use a professional, formal tone. No slang, no emoji.',
      creative: '\n\nIMPORTANT: Be creative, playful, use metaphors and humor. Make it fun!',
      concise: '\n\nIMPORTANT: Be EXTREMELY brief. 1-2 sentences max. No filler.',
      technical: '\n\nIMPORTANT: Use technical depth, code examples, precise terminology.',
      friendly: '\n\nIMPORTANT: Be warm, encouraging, use emoji freely 😊. Extra friendly!',
    };
    const mod = this.personalityOverride ? PERSONALITY_MODIFIERS[this.personalityOverride] : '';
    return this.persona + (mod || '');
  }

  _canTranscribe() {
    try {
      // Check if transcribe-anything is on PATH using 'where' (Windows) or 'which' (Unix)
      const cmd =
        process.platform === 'win32' ? 'where transcribe-anything' : 'which transcribe-anything';
      const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 }).trim();
      return result.length > 0;
    } catch {
      return false;
    }
  }

  _transcribeVoice(fileId) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return null;
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const tmpDir = path.join(os.tmpdir(), 'daemon-voice');
      fs.mkdirSync(tmpDir, { recursive: true });

      // Write a temp script that downloads the voice file via Telegram API.
      // This avoids fragile node -e one-liners that break on Windows shell escaping.
      const scriptPath = path.join(tmpDir, '_download.cjs');
      const localPath = path.join(tmpDir, `voice-${Date.now()}.ogg`);
      fs.writeFileSync(
        scriptPath,
        `
'use strict';
const https = require('https');
const fs = require('fs');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  const fileInfoBuf = await httpGet(
    'https://api.telegram.org/bot${token}/getFile?file_id=${fileId}'
  );
  const fileInfo = JSON.parse(fileInfoBuf.toString());
  if (!fileInfo.ok) { process.exit(1); }
  const filePath = fileInfo.result.file_path;

  const fileData = await httpGet(
    'https://api.telegram.org/file/bot${token}/' + filePath
  );
  fs.writeFileSync(${JSON.stringify(localPath.replace(/\\/g, '/'))}, fileData);
  console.log('ok');
}

main().catch(() => process.exit(1));
`
      );

      const dlResult = nodeSync(scriptPath, { timeout: 30000 });

      // Clean up download script
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        /* best-effort cleanup */
      }

      if (dlResult !== 'ok' || !fs.existsSync(localPath)) return null;

      // Transcribe with Whisper
      const outDir = path.join(tmpDir, 'out');
      const transcribeCmd = `transcribe-anything "${localPath.replace(/\\/g, '/')}" --model base --device cuda --output_dir "${outDir.replace(/\\/g, '/')}"`;
      execSync(transcribeCmd, {
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true,
      });

      // Read transcript — transcribe-anything outputs .txt, .srt, .vtt files
      if (!fs.existsSync(outDir)) return null;
      const txtFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.txt'));
      if (txtFiles.length === 0) return null;
      const transcript = fs.readFileSync(path.join(outDir, txtFiles[0]), 'utf8').trim();

      // Cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }

      return transcript || null;
    } catch (err) {
      // Log transcription errors instead of silently swallowing
      console.error('[renderer] Voice transcription failed:', err.message || err);
      return null;
    }
  }

  _loadKnowledgeBase() {
    const kbPath = this.businessConfig.knowledgeBase;
    if (!kbPath) return '(No knowledge base configured)';
    try {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.resolve(this.projectRoot, kbPath);
      if (fs.statSync(fullPath).isDirectory()) {
        // Load all .md files from directory
        const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.md'));
        return files
          .map(f => fs.readFileSync(path.join(fullPath, f), 'utf8'))
          .join('\n\n')
          .slice(0, 4000);
      }
      return fs.readFileSync(fullPath, 'utf8').slice(0, 4000);
    } catch {
      return '(Knowledge base not found)';
    }
  }

  /**
   * Select the cheapest model that can handle this message.
   * haiku for trivial, sonnet for regular, configured model for complex.
   */
  _selectModel(text) {
    if (!text || text.length < 30) return 'haiku';
    return this.model; // sonnet or opus based on config
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
      // If context is too large, truncate it rather than triggering compaction mid-render
      // (compaction calls claudeSync which would block this render cycle)
      if (context.length > 4800) {
        context = context.slice(-4800);
      }
    }

    if (this.memory && chatId) {
      this.memory.addMessage(chatId, 'user', text, user);
    }

    const parts = [this._getPersona()];
    if (context) parts.push(`\nRecent chat history:\n${context}`);

    // Handle attachments — tell Claude what was received so it can use [TASK] to process
    const { attachmentType, attachmentFileId } = event.data;
    if (attachmentType === 'voice' || attachmentType === 'audio') {
      // Try to download and transcribe the voice message
      let transcription = null;
      if (attachmentFileId && this._canTranscribe()) {
        transcription = this._transcribeVoice(attachmentFileId);
      }
      if (transcription) {
        parts.push(`\n${user} sent a voice message. Transcription: "${transcription}"`);
        // Use transcription as the message text for context (don't mutate event.data)
        // The transcription is already in the prompt via parts above
      } else {
        parts.push(
          `\n${user} sent a voice/audio message. Voice transcription is not available. Ask them to type their message instead.`
        );
      }
    } else if (attachmentType === 'photo') {
      parts.push(
        `\n${user} sent a photo (file_id: ${attachmentFileId}). You can use [TASK] to download and analyze it, or ask them what they need help with regarding the image.`
      );
    } else if (attachmentType === 'document') {
      parts.push(
        `\n${user} sent a document (file_id: ${attachmentFileId}). You can use [TASK] to download it and convert to markdown using markitdown for analysis. Offer to read and summarize it for them.`
      );
    }

    // Auto-inject matching skills from previous sessions
    if (this.skillStore) {
      const skillCtx = this.skillStore.getSkillContext(text);
      if (skillCtx) parts.push(skillCtx);
    }

    parts.push(`\nNew message from ${user}: ${text}`);

    return parts.join('\n');
  }

  /**
   * Synchronous render — blocks until complete. Used as fallback.
   */
  render(event) {
    const prompt = this._buildPrompt(event);
    const model = this._selectModel(event.data?.text);
    try {
      const result = claudeSync(prompt, {
        model,
        maxTurns: 3,
        cwd: this.projectRoot,
        timeout: 120000,
      });

      const response = result || 'Sorry, I could not generate a response.';
      if (this.memory && event.data.chatId) {
        this.memory.addMessage(event.data.chatId, 'assistant', response);
        // Track usage: estimate tokens from prompt + response length
        if (this.memory.trackUsage) {
          const estimatedTokens = Math.round((prompt.length + response.length) / 4);
          this.memory.trackUsage(event.data.chatId, model, estimatedTokens);
        }
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
    const model = this._selectModel(event.data?.text);
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    return new Promise((resolve, _reject) => {
      const args = [
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        '--model',
        model,
        '--max-turns',
        '3',
      ];

      const child = spawn('claude', args, {
        cwd: this.projectRoot,
        env,
        windowsHide: true,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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

      child.stderr.on('data', _data => {
        // Ignore stderr (debug output from claude)
      });

      child.on('close', _code => {
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
          } catch {
            /* ignored */
          }
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
    const fullPrompt = `${this.persona}\n\n${prompt}`;
    try {
      return claudeSync(fullPrompt, {
        model: 'haiku',
        maxTurns: 1,
        cwd: this.projectRoot,
        timeout: 60000,
      });
    } catch {
      return null;
    }
  }
  /**
   * Generate 2-3 follow-up prompt suggestions based on the conversation.
   * Uses haiku for speed/cost. Returns array of strings or empty.
   */
  generateSuggestions(userText, response) {
    try {
      const prompt = `Given this exchange - User said: '${userText.slice(0, 200)}' and you replied: '${response.slice(0, 200)}' - suggest 2-3 short follow-up prompts the user might want to send next. Return ONLY a JSON array of strings, nothing else. Example: ["Check test results","Show git log","Explain the error"]`;
      const result = claudeSync(prompt, {
        model: 'haiku',
        maxTurns: 1,
        timeout: 30000,
      });
      const match = result.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]).slice(0, 3);
    } catch {
      /* ignored */
    }
    return [];
  }
}

module.exports = { ClaudeRenderer };
