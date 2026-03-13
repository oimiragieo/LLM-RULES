---
name: tts-generation
description: AI text-to-speech generation using OpenAI TTS, ElevenLabs, and Google TTS backends. Converts text to audio files with voice selection, speed control, and format options.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebFetch]
agents: [developer, ai-ml-expert]
category: "AI/ML"
tags: [tts, text-to-speech, audio, openai, elevenlabs, google-tts, voice]
best_practices:
  - Choose model tier based on latency vs quality requirements (tts-1 for speed, tts-1-hd for quality)
  - Cache generated audio files to avoid re-generating identical text
  - Handle API rate limits with exponential backoff
  - Validate text length before API call (OpenAI max 4096 chars per request)
error_handling: strict
---

# TTS Generation

## Overview

Generate speech audio from text using AI backends.

- **OpenAI TTS** — `tts-1` (low latency) / `tts-1-hd` (studio quality), 6 voices, 57 languages
- **ElevenLabs** — `eleven_turbo_v2` / `eleven_multilingual_v2`, cloneable voices, 29 languages
- **Google TTS** — `gTTS` Python library, 40+ languages, free tier

## Backend Comparison

| Feature    | OpenAI TTS          | ElevenLabs          | Google TTS     |
| ---------- | ------------------- | ------------------- | -------------- |
| Quality    | High                | Highest             | Medium         |
| Latency    | Low (tts-1)         | Medium              | Low            |
| Cost       | ~$15/1M chars       | ~$22/1M chars       | Free (limited) |
| Voices     | 6 preset            | Cloneable           | 40+ languages  |
| Max chars  | 4096/request        | Unlimited           | ~5000/request  |
| Streaming  | Yes                 | Yes                 | No             |

## Quick Start

### OpenAI TTS (Recommended)

```python
from pathlib import Path
from openai import OpenAI

client = OpenAI()

response = client.audio.speech.with_streaming_response.create(
    model="tts-1-hd",  # tts-1 for speed, tts-1-hd for quality
    voice="nova",       # alloy | echo | fable | onyx | nova | shimmer
    input="Hello world",
    speed=1.0,          # 0.25 to 4.0
)
response.stream_to_file(Path("output.mp3"))
```

### ElevenLabs

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key="YOUR_API_KEY")
audio = client.text_to_speech.convert(
    voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel
    model_id="eleven_turbo_v2",
    text="Hello world",
    output_format="mp3_44100_128",
)
with open("output.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```

### Google TTS (Free)

```python
from gtts import gTTS
gTTS(text="Hello world", lang="en", slow=False).save("output.mp3")
```

## Long-Text Chunking

For text exceeding limits, split at sentence boundaries and concatenate with `pydub`. Pattern: iterate sentences, accumulate into `current` until `max_chars` (4000), flush to `chunks` on overflow.

## Output Formats

`mp3` (general), `opus` (streaming), `flac` (lossless archival), `wav` (editing), `pcm` (raw pipeline).

## Installation

```bash
pip install openai elevenlabs gtts pydub
export OPENAI_API_KEY="sk-..."
export ELEVENLABS_API_KEY="..."
```

## Agent Usage Pattern

- OpenAI TTS: documentation/demos narration
- ElevenLabs: cloned voices or highest quality
- Google TTS: multilingual free-tier
- Chunk at sentence boundaries; cache by content hash

## Related Skills

- `transcription` — Reverse: audio to text via Whisper
- `ai-ml-expert` — Advanced ML pipeline integration

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
