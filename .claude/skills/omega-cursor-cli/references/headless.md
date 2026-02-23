# Headless Cursor Agent

Use the wrapper script from project root:

```bash
node .claude/skills/omega-cursor-cli/scripts/ask-cursor.mjs "PROMPT"
```

Direct equivalent:

```bash
cursor-agent --print --output-format text "PROMPT"
```

Options supported by the wrapper:

- `--model MODEL`
- `--json` (`--output-format json`)
- `--yolo` (`--force` / auto-approve all tool calls)
- `--trust` (trust workspace without prompting, headless only)
- `--timeout-ms N`
- `--sandbox` (deprecated alias for `--yolo`)
