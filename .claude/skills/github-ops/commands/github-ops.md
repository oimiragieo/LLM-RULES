# Command Surface: github-ops

## Primary Commands

### Repository Mapping
```bash
node .claude/skills/github-ops/scripts/main.cjs api repos/{owner}/{repo}/contents --jq '.[].name'
```

### File Deep Dive
```bash
node .claude/skills/github-ops/scripts/main.cjs api repos/{owner}/{repo}/contents/{path} --jq '.content'
```

### Search Patterns
```bash
node .claude/skills/github-ops/scripts/main.cjs search code "{pattern}" --repo {owner}/{repo}
```
