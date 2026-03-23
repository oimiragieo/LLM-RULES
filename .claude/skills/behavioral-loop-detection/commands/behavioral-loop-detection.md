# behavioral-loop-detection Commands

## CLI Usage

```bash
# Check a sequence of actions for loops
echo '{"taskId":"task-42","actions":[{"toolName":"Edit","args":{"file_path":"src/index.ts"}},{"toolName":"Edit","args":{"file_path":"src/index.ts"}},{"toolName":"Edit","args":{"file_path":"src/index.ts"}}]}' | node .claude/skills/behavioral-loop-detection/scripts/main.cjs --check
```

**Expected output:**

```json
{
  "level": 1,
  "action": "replan",
  "message": "You have repeated a similar action 3 times. Stop and produce a revised plan before continuing."
}
```

## Invocation in Agent Context

```javascript
Skill({ skill: 'behavioral-loop-detection' });
```

## Output Levels

| Level | Action     | Meaning                          |
| ----- | ---------- | -------------------------------- |
| 0     | continue   | No loop detected                 |
| 1     | replan     | 3 similar actions — stop & plan  |
| 2     | explore    | 5 similar actions — try new path |
| 3     | force-done | 8 similar actions — must stop    |
