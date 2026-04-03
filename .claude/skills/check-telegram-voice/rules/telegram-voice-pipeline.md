# telegram-voice-pipeline Rules

## Purpose

End-to-end voice message pipeline for Telegram — download OGG attachment, transcribe with Whisper, generate a text response, convert to MP3 via ElevenLabs TTS, and reply with the audio file.

## Best Practices

- Always download the attachment before attempting transcription
- Guard ElevenLabs text length to 4000 chars to avoid API errors
- Use fallback OpenAI TTS when ELEVENLABS_API_KEY is not set
- Clean up temp files after the reply is sent
- Never skip the text fallback — if TTS fails, send text response

## Pipeline Steps

1. **Download**: Get OGG/Opus file via Telegram MCP tool
2. **Transcribe**: Use Whisper (transcribe-anything)
3. **Process**: Generate text response from transcription
4. **TTS**: Convert to audio via ElevenLabs (fallback: OpenAI TTS)
5. **Reply**: Send audio file + text transcript
6. **Cleanup**: Remove temp files

## Anti-Patterns

- Never skip the download step — attachment_file_id must be resolved
- Never use shell: true for subprocess calls
- Never process image attachments through this skill
- Never leave temp files on disk

## Integration Points

See SKILL.md for complete documentation.
