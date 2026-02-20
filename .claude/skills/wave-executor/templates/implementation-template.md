# Wave Plan Template

Use this template to create a wave plan JSON file for the wave-executor.

## Plan Structure

```json
{
  "name": "<pipeline-name>",
  "waves": [
    {
      "id": 1,
      "skills": ["<skill-a>", "<skill-b>", "<skill-c>"],
      "domain": "<domain-category>",
      "promptTemplate": "<custom prompt with {skills} and {domain} placeholders>"
    }
  ],
  "config": {
    "model": "claude-sonnet-4-6",
    "maxTurnsPerWave": 50,
    "sleepBetweenWaves": 3000,
    "inventoryPath": ".claude/context/runtime/wave-inventory.json"
  }
}
```

## Wave Design Guidelines

1. Group skills by domain (language, framework, devops, security, etc.)
2. Keep 2-4 skills per wave for manageable scope
3. Put dependent skills in later waves
4. Add a `promptTemplate` for domain-specific instructions
5. Use `{skills}`, `{domain}`, `{waveId}` placeholders in templates

## Execution

```bash
# Preview
node .claude/tools/cli/wave-executor.mjs --plan <path> --dry-run

# Execute
node .claude/tools/cli/wave-executor.mjs --plan <path> --json

# Resume from wave 5 after a crash
node .claude/tools/cli/wave-executor.mjs --plan <path> --start-from 5 --json
```
