# instinct-learning Command

## Usage

```bash
node .claude/skills/instinct-learning/scripts/main.cjs --action <action> [options]
```

## Actions

### record — Record a new instinct

```bash
node .claude/skills/instinct-learning/scripts/main.cjs \
  --action record \
  --text "Always use shell: false when spawning child processes" \
  --confidence 0.7 \
  --tags "security,shell,child-process" \
  --source "Observed repeated shell injection attempts in hook testing"
```

### update — Update confidence of existing instinct

```bash
node .claude/skills/instinct-learning/scripts/main.cjs \
  --action update \
  --id "inst-a1b2c3d4" \
  --confidence 0.8
```

### query — Query instincts by tags and min confidence

```bash
node .claude/skills/instinct-learning/scripts/main.cjs \
  --action query \
  --tags "security,hooks" \
  --min-confidence 0.6 \
  --limit 10
```

### list — List all instincts (optionally filtered by scope)

```bash
node .claude/skills/instinct-learning/scripts/main.cjs \
  --action list \
  --scope global \
  --limit 20
```

## Exit Codes

| Code | Meaning                     |
| ---- | --------------------------- |
| 0    | Success                     |
| 1    | Validation or runtime error |
