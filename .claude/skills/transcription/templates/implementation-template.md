# Transcription Implementation Template

Use this template when implementing transcription in an agent workflow.

## Step 1: Validate input

```bash
# Check if file exists (for local files)
test -f "{{input_file}}" && echo "File found" || echo "ERROR: File not found"

# Or for URLs, validate format
echo "{{input_url}}" | grep -E "^https?://" && echo "Valid URL" || echo "ERROR: Invalid URL"
```

**Expected output:** "File found" or "Valid URL"
**Verify:** Exit code 0

## Step 2: Run transcription

```bash
transcribe-anything "{{input}}" \
  --model {{model_size}} \
  --output_dir "{{output_dir}}"
```

**Expected output:** Progress messages, then completion. Output files created in `{{output_dir}}/`
**Verify:** Exit code 0, files exist in output directory

## Step 3: Verify output files

```bash
ls -la "{{output_dir}}/"
```

**Expected output:** List of `.srt`, `.vtt`, `.txt`, `.json` files
**Verify:** At least one `.txt` or `.srt` file present

## Step 4: Read transcript (optional)

```bash
cat "{{output_dir}}/{{filename}}.txt"
```

**Expected output:** Plain text transcript of the audio content
**Verify:** Non-empty text content

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{input}}` | File path or URL | `podcast.mp3` |
| `{{input_file}}` | Local file path | `/data/audio.mp3` |
| `{{input_url}}` | Remote URL | `https://youtube.com/...` |
| `{{model_size}}` | Whisper model | `large-v3` |
| `{{output_dir}}` | Output directory | `./transcripts/` |
| `{{filename}}` | Base filename | `podcast` |
| `{{lang}}` | Language code | `en` |
| `{{device}}` | Backend device | `cuda` |
