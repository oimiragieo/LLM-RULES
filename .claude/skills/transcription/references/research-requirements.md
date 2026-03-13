# Transcription Skill — Research Requirements

**Date:** 2026-03-13
**Query intent:** Audio/video transcription using Whisper AI, Python CLI tooling, best practices for agents

## Source Repository

**Primary source:** https://github.com/aj47/transcribe-anything
- Wraps Whisper AI with intelligent backend selection
- Handles isolated venv management per backend
- Supports: local files, YouTube URLs, microphone input
- Backends: faster-whisper (default), openai-whisper, Whisper API (groq), mlx (Apple Silicon), insane (GPU+diarization)

## VoltAgent/awesome-agent-skills Search

Searched VoltAgent/awesome-agent-skills for 'transcription whisper audio' — no matching skill found.
Proceeding with primary source + arXiv research.

## Academic Research (arXiv)

**Whisper paper:** "Robust Speech Recognition via Large-Scale Weak Supervision" (OpenAI, 2022)
- arXiv: https://arxiv.org/abs/2212.04356
- Key finding: Large-scale diverse training data (680K hours) enables near-human accuracy
- Architecture: encoder-decoder Transformer, multitask training (transcription + translation + language ID)
- Model sizes: tiny (39M) → large-v3 (1.5B parameters)

**faster-whisper:** SYSTRAN implementation using CTranslate2
- 4x faster than original whisper on same hardware
- Lower memory footprint via INT8 quantization

## Key Design Constraints (from research)

1. **Backend isolation:** Each backend requires different Python packages. transcribe-anything handles this via isolated venvs — agents must NOT pre-install backends separately.

2. **Model size vs accuracy tradeoff:** tiny/small = fast but ~70% WER on technical content; large-v3 = ~5% WER on most content. Default to large-v3 for production use.

3. **Speaker diarization is opt-in:** Requires HuggingFace token + pyannote license agreement. The `--device insane` flag enables this. Agents must never hardcode tokens.

## Non-Goals

- Real-time streaming transcription (out of scope for this skill — use whisper.cpp or deepgram for streaming)
- Custom model fine-tuning (use ai-ml-expert skill for that)
- Post-processing / summarization of transcripts (use separate skill chain)
- Audio enhancement / noise reduction (pre-process externally)

## Fallback Sources

- faster-whisper docs: https://github.com/SYSTRAN/faster-whisper
- Groq API docs: https://console.groq.com/docs/speech-text
- pyannote.audio (diarization): https://github.com/pyannote/pyannote-audio
