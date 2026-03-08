---
name: markitdown-converter
version: 1.0.0
description: Convert files to Markdown using Microsoft's MarkItDown library
category: utilities
tags: [file-conversion, markdown, pdf, docx, xlsx, images, audio]
tools: [Bash, Read, Write]
created_by: skill-creator
compliance_status: created-via-research-synthesis
research_synthesis: true
verified: true
---

# MarkItDown Converter Skill

Convert files (PDF, DOCX, XLSX, PPTX, HTML, CSV, images, audio) to Markdown using Microsoft's MarkItDown library.

## Usage

```javascript
Skill({ skill: 'markitdown-converter' });
// Then call the converter via Bash:
// bash: python .claude/tools/cli/markitdown-convert.py <input_file> [output_file]
```

## Supported File Types

| Format          | Extensions                            |
| --------------- | ------------------------------------- |
| Documents       | .pdf, .docx, .pptx, .xlsx             |
| Web             | .html, .htm                           |
| Data            | .csv, .json, .xml                     |
| Images          | .jpg, .jpeg, .png, .gif, .webp        |
| Audio           | .mp3, .wav, .m4a                      |
| Archives        | .zip (extracts and converts contents) |
| Video platforms | YouTube URLs                          |

## Installation

```bash
pip install 'markitdown[all]'
```

## CLI Wrapper

The CLI wrapper is at `.claude/tools/cli/markitdown-convert.py`.

### Convert a file to stdout

```bash
python .claude/tools/cli/markitdown-convert.py /path/to/file.pdf
```

### Convert and save to output file

```bash
python .claude/tools/cli/markitdown-convert.py /path/to/file.pdf /path/to/output.md
```

### Convert with explicit extension hint (for streams)

```bash
python .claude/tools/cli/markitdown-convert.py /path/to/file --ext .pdf
```

## Exit Codes

| Code | Meaning                            |
| ---- | ---------------------------------- |
| 0    | Success — JSON with `text_content` |
| 1    | Conversion error                   |
| 2    | File not found                     |
| 3    | markitdown not installed           |

## JSON Output Format

```json
{
  "success": true,
  "text_content": "# Document Title\n\nContent here...",
  "char_count": 1234,
  "source_file": "report.pdf",
  "output_file": null
}
```

## Integration with Telegram File Drop

When a user sends a file in Telegram:

```javascript
// 1. Download the file to tmp
const tmpPath = `.claude/context/tmp/telegram-upload-${userId}-${Date.now()}.${ext}`;

// 2. Run markitdown converter
const result = JSON.parse(
  execSync(`python .claude/tools/cli/markitdown-convert.py "${tmpPath}"`).toString()
);

// 3. Store as agent memory
if (result.success) {
  MemoryRecord({ type: 'discovery', text: result.text_content.slice(0, 2000), area: 'user-files' });
}
```

## Error Handling

```javascript
// Check if markitdown is installed
const { status } = spawnSync('python', ['.claude/tools/cli/markitdown-convert.py', '--help']);
if (status === 3) {
  // Not installed — guide user
  sendMessage(chatId, 'File conversion requires: pip install markitdown[all]');
}
```

## When to Use

- User drops a file in Telegram → convert to markdown → store as memory
- Agent needs to process uploaded documents
- Convert research papers (PDF) to searchable markdown
- Extract data from spreadsheets (XLSX → markdown tables)
