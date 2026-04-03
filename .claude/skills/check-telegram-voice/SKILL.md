---
name: check-telegram-voice
description: Check voice message pipeline config — verify Whisper, ElevenLabs/OpenAI TTS keys and dependencies.
version: 3.0.0
trigger: when user says /check-telegram-voice, "check voice", "voice status"
invoked_by: user
user_invocable: true
tools: [Bash, Read, TaskUpdate]
agents: [developer, general-assistant]
category: 'External Integrations'
tags: [telegram, voice, tts, whisper, elevenlabs, speech-to-text, audio, channels]
best_practices:
  - Always download the attachment before attempting transcription
  - Guard ElevenLabs text length to 4000 chars to avoid API errors
  - Use fallback OpenAI TTS when ELEVENLABS_API_KEY is not set
  - Clean up temp files after the reply is sent
error_handling: strict
streaming: not-applicable
---

# Telegram Voice Pipeline

## Overview

This skill handles Telegram voice messages end-to-end:

1. **Detect** voice message via `attachment_file_id` in channel tag
2. **Download** OGG/Opus file via Telegram MCP tool
3. **Transcribe** with Whisper (`transcribe-anything`)
4. **Process** transcribed text as the user query — generate a text response
5. **Generate TTS** audio via ElevenLabs (fallback: OpenAI TTS) → MP3
6. **Reply** with the MP3 audio file via Telegram MCP tool

## When to Invoke

```javascript
Skill({ skill: 'telegram-voice-pipeline' });
```

Invoke when:

- A Telegram channel tag has an `attachment_file_id` attribute (voice or audio message)
- The channel agent needs to respond with audio rather than text
- Any step in the voice pipeline needs to be re-run after a failure

## Detection Pattern

Telegram voice messages arrive as channel tags:

```xml
<channel source="telegram" chat_id="123456" message_id="789" user="username" ts="1234567890" attachment_file_id="BQACAgIAAxkBAAIBc2...">
```

Key detection logic:

- `attachment_file_id` present → voice/audio message → invoke this skill
- `image_path` present → photo → use image handling instead
- Neither present → text message → normal text response

---

## Workflow

### Step 1: Download the Voice File

Call the Telegram MCP download tool with the `file_id` from the channel tag:

```javascript
// MCP tool call (agent uses this directly)
mcp__telegram - relay__download_attachment({ file_id: '<attachment_file_id>' });
// Returns: local file path, e.g. /tmp/voice_abc123.ogg
```

**Verify:** The returned path exists and is non-empty (> 1KB for a real voice message).

**Error handling:** If download fails, reply with a text message: "Sorry, I couldn't download your voice message. Please try again."

---

### Step 2: Transcribe with Whisper

Install `transcribe-anything` if not present:

```bash
pip install transcribe-anything
```

Run transcription:

```bash
transcribe-anything /tmp/voice_abc123.ogg --model medium --output_dir /tmp/tg_voice/
```

Read the transcript:

```bash
cat /tmp/tg_voice/voice_abc123.txt
```

**Model selection** (trade-off between speed and accuracy):

| Model      | Speed | Accuracy | Use when                       |
| ---------- | ----- | -------- | ------------------------------ |
| `tiny`     | ~2s   | Low      | Rapid prototyping only         |
| `small`    | ~5s   | Medium   | Short messages, speed priority |
| `medium`   | ~12s  | High     | Default — best balance         |
| `large-v3` | ~30s  | Best     | Long/complex messages          |

Override via env: `WHISPER_MODEL=small` (default: `medium`)

**Verify:** `/tmp/tg_voice/<filename>.txt` exists and is non-empty.

**Error handling:** If transcription fails or output is empty, reply: "I received your voice message but couldn't transcribe it. Could you try sending it again or type your message?"

---

### Step 3: Process Transcription as User Message

Use the transcribed text as the user input. Generate a text response using the agent's normal response logic.

```
transcribed_text = contents of /tmp/tg_voice/<filename>.txt
response_text = <agent's generated response to transcribed_text>
```

Guard max length for TTS: `response_text[:4000]` (ElevenLabs limit) or `response_text[:4096]` (OpenAI TTS limit).

---

### Step 4: Generate TTS Audio

#### Primary: ElevenLabs (requires `ELEVENLABS_API_KEY`)

```python
import os
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
audio = client.text_to_speech.convert(
    text=response_text[:4000],
    voice_id="JBFqnCBsd6RMkjVDRZzb",  # George — clear, neutral voice
    model_id="eleven_turbo_v2",
    output_format="mp3_44100_128",
)
output_path = "/tmp/tg_voice_response.mp3"
with open(output_path, "wb") as f:
    for chunk in audio:
        f.write(chunk)
print(f"TTS written to {output_path}")
```

Override voice via env: `ELEVENLABS_VOICE_ID=<voice_id>` (default: `JBFqnCBsd6RMkjVDRZzb`)

#### Fallback: OpenAI TTS (requires `OPENAI_API_KEY`, no `ELEVENLABS_API_KEY`)

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
with client.audio.speech.with_streaming_response.create(
    model="tts-1",
    voice="nova",
    input=response_text[:4096],
) as response:
    response.stream_to_file("/tmp/tg_voice_response.mp3")
print("TTS written to /tmp/tg_voice_response.mp3")
```

**Selection logic:**

```python
if os.environ.get("ELEVENLABS_API_KEY"):
    # Use ElevenLabs
else:
    # Use OpenAI TTS fallback
```

**Verify:** `/tmp/tg_voice_response.mp3` exists and is > 1KB.

**Error handling:** If TTS fails, send `response_text` as a plain text reply instead of audio.

---

### Step 5: Reply with Audio File

```javascript
// MCP tool call
mcp__telegram -
  relay__reply({
    chat_id: '<chat_id from channel tag>',
    text: response_text, // Also send the transcript so user can read it
    files: ['/tmp/tg_voice_response.mp3'],
  });
```

**Note:** Including `text` alongside the audio file gives the user both a readable transcript and the audio reply — useful for accessibility and noisy environments.

**Verify:** No error returned from the reply tool.

---

### Step 6: Cleanup Temp Files

After a successful reply, clean up to avoid disk accumulation:

```bash
rm -f /tmp/tg_voice_response.mp3
rm -rf /tmp/tg_voice/
```

---

## Environment Variables

| Variable              | Required               | Default                | Purpose                   |
| --------------------- | ---------------------- | ---------------------- | ------------------------- |
| `ELEVENLABS_API_KEY`  | NO (if OpenAI set)     | —                      | ElevenLabs TTS API key    |
| `ELEVENLABS_VOICE_ID` | NO                     | `JBFqnCBsd6RMkjVDRZzb` | ElevenLabs voice (George) |
| `OPENAI_API_KEY`      | NO (if ElevenLabs set) | —                      | OpenAI TTS fallback key   |
| `WHISPER_MODEL`       | NO                     | `medium`               | Whisper model size        |

At least one of `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` must be set for TTS to work.

---

## Full Pipeline Example

```
[Telegram] User sends 10-second voice message
   ↓
[Agent] Detects attachment_file_id in channel tag
   ↓
[MCP] download_attachment(file_id) → /tmp/voice_abc123.ogg
   ↓
[Bash] transcribe-anything /tmp/voice_abc123.ogg --model medium → "What is the weather like today?"
   ↓
[Agent] Generates response: "I don't have real-time weather data, but I can help you check..."
   ↓
[Python] ElevenLabs TTS → /tmp/tg_voice_response.mp3
   ↓
[MCP] reply(chat_id, text="I don't have...", files=["/tmp/tg_voice_response.mp3"])
   ↓
[Telegram] User receives text + audio reply
   ↓
[Bash] rm /tmp/tg_voice_response.mp3 && rm -rf /tmp/tg_voice/
```

Total time for 10-second voice message: ~15-25 seconds (download 1s + transcribe 12s + TTS 2s + reply 1s).

---

## Anti-Patterns

- **Never skip the download step** — `attachment_file_id` is not a file path, it must be resolved via the MCP tool
- **Never use `shell: true`** for subprocess calls in transcription — use array args with `shell: false`
- **Never skip the text fallback** — if TTS fails, always send the text response so the user gets an answer
- **Never process image attachments through this skill** — photos use `image_path`, not `attachment_file_id`; route them differently
- **Never leave temp files on disk** — clean up after every reply to prevent disk accumulation

---

## Related Skills

- `enable-telegram` — Start the channel daemon for background Telegram monitoring
- `transcription` — Whisper transcription workflow (used in Step 2)
- `tts-generation` — ElevenLabs and OpenAI TTS (used in Step 4)

## References

- Telegram MCP tools: `mcp__telegram-relay__download_attachment`, `mcp__telegram-relay__reply`
- `transcribe-anything`: <https://github.com/modal-labs/transcribe-anything>
- ElevenLabs Python SDK: <https://github.com/elevenlabs/elevenlabs-python>
- OpenAI TTS docs: <https://platform.openai.com/docs/guides/text-to-speech>

## Search Protocol

For code discovery and search tasks, follow this priority order:

1. `pnpm search:code "<query>"` (Primary intent-based search).
2. `ripgrep` (for exact keyword/regex matches).
3. semantic/structural search via code tools if available.

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
```

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
