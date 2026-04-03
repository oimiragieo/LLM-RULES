# Telegram Voice Pipeline Research Requirements (2026)

## Core Components

- **Telegram MCP**: Download and reply tools
- **Whisper**: Speech-to-text transcription via transcribe-anything
- **ElevenLabs TTS**: Primary text-to-speech (requires API key)
- **OpenAI TTS**: Fallback text-to-speech (requires API key)

## Environment Variables

| Variable              | Required               | Default                |
| --------------------- | ---------------------- | ---------------------- |
| `ELEVENLABS_API_KEY`  | NO (if OpenAI set)     | —                      |
| `ELEVENLABS_VOICE_ID` | NO                     | `JBFqnCBsd6RMkjVDRZzb` |
| `OPENAI_API_KEY`      | NO (if ElevenLabs set) | —                      |
| `WHISPER_MODEL`       | NO                     | `medium`               |

## Whisper Model Selection

| Model      | Speed | Accuracy | Use when              |
| ---------- | ----- | -------- | --------------------- |
| `tiny`     | ~2s   | Low      | Rapid prototyping     |
| `small`    | ~5s   | Medium   | Short messages        |
| `medium`   | ~12s  | High     | Default               |
| `large-v3` | ~30s  | Best     | Long/complex messages |

## Implementation Patterns

### Whisper Transcription

```bash
transcribe-anything /tmp/voice.ogg --model medium --output_dir /tmp/tg_voice/
```

### ElevenLabs TTS

```python
from elevenlabs import ElevenLabs
client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
audio = client.text_to_speech.convert(
    text=response_text[:4000],
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    model_id="eleven_turbo_v2",
    output_format="mp3_44100_128",
)
```

### OpenAI TTS Fallback

```python
from openai import OpenAI
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
response = client.audio.speech.create(
    model="tts-1",
    voice="nova",
    input=response_text[:4096],
)
```

## Source References

- Telegram MCP tools documentation
- [transcribe-anything](https://github.com/modal-labs/transcribe-anything)
- [ElevenLabs Python SDK](https://github.com/elevenlabs/elevenlabs-python)
- [OpenAI TTS docs](https://platform.openai.com/docs/guides/text-to-speech)
