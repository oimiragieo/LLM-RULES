---
name: transcription
description: Audio and video transcription using Whisper AI via the transcribe-anything package. Supports local files, YouTube URLs, and microphone input with multiple backends (faster-whisper, openai-whisper, Whisper API).
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write]
agents: [developer, ai-ml-expert, researcher]
lastVerifiedAt: 2026-03-15T00:00:00.000Z
category: 'AI/ML'
tags: [transcription, audio, video, whisper, speech-to-text, faster-whisper, subtitles, srt]
best_practices:
  - Use faster-whisper backend by default — it is 4x faster than openai-whisper on the same hardware
  - Select model size based on quality/speed tradeoff (tiny→large-v3)
  - Always specify output directory to keep files organized
  - Use --lang to skip auto-detection when the source language is known
error_handling: strict
source: builtin
trust_score: 100
provenance_sha: 37086464e5001125
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

| Option             | Description                                    | Default      |
| ------------------ | ---------------------------------------------- | ------------ |
| `--model`          | `tiny`, `small`, `medium`, `large`, `large-v3` | `large-v3`   |
| `--lang`           | Language code (`en`, `fr`, `de`) or `auto`     | auto-detect  |
| `--device`         | `cpu`, `cuda`, `mlx`, `insane`, `groq`         | auto-select  |
| `--output_dir`     | Directory to write transcript files            | `./`         |
| `--task`           | `transcribe` or `translate` (→ English)        | `transcribe` |
| `--hf_token`       | HuggingFace token for speaker diarization      | —            |
| `--initial_prompt` | Domain vocabulary hint for technical terms     | —            |

## Backend Comparison

| Backend          | Platform               | Speed              | Requires                       |
| ---------------- | ---------------------- | ------------------ | ------------------------------ |
| `faster-whisper` | Windows/Linux/Mac      | Fast               | No internet                    |
| `mlx`            | Mac Apple Silicon only | 4x faster          | No internet                    |
| `insane`         | Windows/Linux GPU      | Fastest local      | No internet, optional HF token |
| `groq`           | Cloud API              | 189–250x real-time | Internet + Groq API key        |
| `cpu`            | Universal              | Slowest            | No internet                    |

## Output Files

| File           | Format                                             |
| -------------- | -------------------------------------------------- |
| `.srt`         | SubRip subtitles with timestamps                   |
| `.vtt`         | WebVTT subtitles                                   |
| `.txt`         | Plain text transcript                              |
| `.json`        | Structured segments with timestamps and confidence |
| `speaker.json` | Speaker-partitioned dialogue (insane backend only) |

## Agent Usage Pattern

1. Identify input — local file path or URL
2. Select model — `tiny`/`small` for speed, `large-v3` for accuracy
3. Select device — omit for auto; `cuda` for GPU, `mlx` for Apple Silicon
4. Run: `transcribe-anything <input> --model <model> --output_dir <dir>`
5. Return: path to output directory + detected language from `.json`

## Batch Processing Large Audio Files

For audio files >30 minutes or processing multiple files:

```bash
# Batch process all audio files in a directory
for f in audio/*.mp3; do
  transcribe-anything "$f" \
    --model large-v3 \
    --output_dir "transcripts/$(basename "$f" .mp3)/" \
    --device cuda
done

# Process large files with chunking (split at silence boundaries)
# Install: pip install pydub
python3 -c "
from pydub import AudioSegment
from pydub.silence import split_on_silence
import os

audio = AudioSegment.from_file('long_audio.mp3')
chunks = split_on_silence(audio, min_silence_len=1000, silence_thresh=-40)

for i, chunk in enumerate(chunks):
    chunk_path = f'chunks/chunk_{i:04d}.mp3'
    chunk.export(chunk_path, format='mp3')
    os.system(f'transcribe-anything {chunk_path} --output_dir chunks/output/')
"
```

**Performance targets:**

| File Length | Backend          | Expected Speed |
| ----------- | ---------------- | -------------- |
| <10 min     | faster-whisper   | 1-2 min        |
| 10-60 min   | mlx (Mac) / cuda | 2-8 min        |
| >60 min     | groq (cloud)     | 1-3 min        |
| Real-time   | groq / insane    | <1x duration   |

## WhisperX and Speaker Diarization

WhisperX extends Whisper with word-level timestamps and speaker diarization:

```bash
# Install WhisperX (used by transcribe-anything --device insane)
pip install whisperx

# Direct WhisperX usage for advanced control
python3 -c "
import whisperx
import json

# Load model
device = 'cuda'
compute_type = 'float16'
model = whisperx.load_model('large-v3', device, compute_type=compute_type)

# Transcribe
audio = whisperx.load_audio('audio.mp3')
result = model.transcribe(audio, batch_size=16)

# Align timestamps (word-level)
model_a, metadata = whisperx.load_align_model(language_code=result['language'], device=device)
result = whisperx.align(result['segments'], model_a, metadata, audio, device)

# Speaker diarization (requires HuggingFace token)
diarize_model = whisperx.DiarizationPipeline(use_auth_token='YOUR_HF_TOKEN', device=device)
diarize_segments = diarize_model(audio)
result = whisperx.assign_word_speakers(diarize_segments, result)

print(json.dumps(result['segments'], indent=2))
"
```

**Speaker diarization output format:**

```json
{
  "segments": [
    {
      "start": 0.5,
      "end": 4.2,
      "text": "Hello, welcome to the meeting.",
      "speaker": "SPEAKER_00",
      "words": [{ "word": "Hello", "start": 0.5, "end": 0.9, "speaker": "SPEAKER_00" }]
    }
  ]
}
```

**Requirements for speaker diarization:**

- HuggingFace account + token (`--hf_token`)
- Accept model license: `pyannote/speaker-diarization-3.1`
- GPU strongly recommended (CPU is 10-50x slower)

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
