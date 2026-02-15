# assimilate Command Surface

## Primary command

`/assimilate`

## CLI fallback

`node .claude/skills/assimilate/scripts/main.cjs --repos "<url1,url2>" --focus "memory,search,agents,creators"`

## Hook commands

- `node .claude/skills/assimilate/hooks/pre-execute.cjs`
- `node .claude/skills/assimilate/hooks/post-execute.cjs`
