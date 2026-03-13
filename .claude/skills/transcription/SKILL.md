---
name: transcription
description: Audio and video transcription using Whisper AI via the transcribe-anything package. Supports local files, YouTube URLs, and microphone input with multiple backends (faster-whisper, openai-whisper, Whisper API).
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write]
agents: [developer, ai-ml-expert, researcher]
category: "AI/ML"
tags: [transcription, audio, video, whisper, speech-to-text, faster-whisper, subtitles, srt]
best_practices:
  - Use faster-whisper backend by default — it is 4x faster than openai-whisper on the same hardware
  - Select model size based on quality/speed tradeoff (tiny→large-v3)
  - Always specify output directory to keep files organized
  - Use --lang to skip auto-detection when the source language is known
error_handling: strict
---

# Transcription

## Overview

Transcribe audio/video files (local or remote) using Whisper AI via `transcribe-anything`. Supports local files, YouTube URLs, and microphone input. Output formats: SRT, VTT, plain text, JSON.

## Installation

```bash
pip install transcribe-anything
```

Backends install automatically in isolated virtual environments.

## Usage

```bash
# Local file
transcribe-anything audio.mp3

# YouTube URL
transcribe-anything "https://www.youtube.com/watch?v=VIDEO_ID"

# With options
transcribe-anything audio.mp3 --model large-v3 --lang en --output_dir ./transcripts/

# GPU / device selection
transcribe-anything audio.mp3 --device cuda      # NVIDIA GPU
transcribe-anything audio.mp3 --device mlx       # Mac Apple Silicon (fastest on Mac)
transcribe-anything audio.mp3 --device groq      # Cloud API (fastest overall)

# Speaker diarization (requires HuggingFace token)
transcribe-anything audio.mp3 --device insane --hf_token YOUR_HF_TOKEN
```

## Key Options

| Option | Description | Default |
|--------|-------------|---------|
| `--model` | `tiny`, `small`, `medium`, `large`, `large-v3` | `large-v3` |
| `--lang` | Language code (`en`, `fr`, `de`) or `auto` | auto-detect |
| `--device` | `cpu`, `cuda`, `mlx`, `insane`, `groq` | auto-select |
| `--output_dir` | Directory to write transcript files | `./` |
| `--task` | `transcribe` or `translate` (→ English) | `transcribe` |
| `--hf_token` | HuggingFace token for speaker diarization | — |
| `--initial_prompt` | Domain vocabulary hint for technical terms | — |

## Backend Comparison

| Backend | Platform | Speed | Requires |
|---------|----------|-------|----------|
| `faster-whisper` | Windows/Linux/Mac | Fast | No internet |
| `mlx` | Mac Apple Silicon only | 4x faster | No internet |
| `insane` | Windows/Linux GPU | Fastest local | No internet, optional HF token |
| `groq` | Cloud API | 189–250x real-time | Internet + Groq API key |
| `cpu` | Universal | Slowest | No internet |

## Output Files

| File | Format |
|------|--------|
| `.srt` | SubRip subtitles with timestamps |
| `.vtt` | WebVTT subtitles |
| `.txt` | Plain text transcript |
| `.json` | Structured segments with timestamps and confidence |
| `speaker.json` | Speaker-partitioned dialogue (insane backend only) |

## Agent Usage Pattern

1. Identify input — local file path or URL
2. Select model — `tiny`/`small` for speed, `large-v3` for accuracy
3. Select device — omit for auto; `cuda` for GPU, `mlx` for Apple Silicon
4. Run: `transcribe-anything <input> --model <model> --output_dir <dir>`
5. Return: path to output directory + detected language from `.json`

## Enforcement Hooks

Input validated against `schemas/input.schema.json`. See `hooks/pre-execute.cjs` for validation logic.

## References

- Package: <https://github.com/aj47/transcribe-anything>
- Whisper paper: <https://arxiv.org/abs/2212.04356>

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md` for prior transcription task context.

**After completing:**

- Performance findings -> `.claude/context/memory/learnings.md`
- Issues encountered -> `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
