# Transcription Commands

## /transcribe

Transcribe an audio or video file using Whisper AI.

**Usage:**
```
/transcribe <file_or_url> [model] [lang] [device]
```

**Examples:**
```
/transcribe podcast.mp3
/transcribe podcast.mp3 large-v3 en
/transcribe https://youtube.com/watch?v=VIDEO_ID
/transcribe interview.wav large-v3 auto cuda
```

**Arguments:**
- `file_or_url` — Path to local audio/video or URL (required)
- `model` — Model size: tiny|small|medium|large|large-v3 (default: large-v3)
- `lang` — Language code (default: auto-detect)
- `device` — Backend: cpu|cuda|mlx|insane|groq (default: auto)

**Output:** Creates transcript files (`.srt`, `.vtt`, `.txt`, `.json`) in the output directory.

**Invocation:**
```javascript
Skill({ skill: 'transcription', args: '--input podcast.mp3 --model large-v3' });
```

## Direct CLI Usage

```bash
# Basic transcription
node .claude/skills/transcription/scripts/main.cjs --input audio.mp3

# Full options
node .claude/skills/transcription/scripts/main.cjs \
  --input audio.mp3 \
  --model large-v3 \
  --lang en \
  --output_dir ./transcripts/ \
  --task transcribe
```
