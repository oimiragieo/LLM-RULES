# Implementation Template: github-ops

Use this template when implementing repository reconnaissance workflows.

## 1. Map Root

```javascript
// Step 1: List root files
Skill({
  skill: 'github-ops',
  args: ['api', 'repos/{owner}/{repo}/contents', '--jq', '.[].name'],
});
```

## 2. Locate Core Logic

```javascript
// Step 2: Search for entrypoints
Skill({
  skill: 'github-ops',
  args: ['search', 'code', 'pattern', '--repo', '{owner}/{repo}'],
});
```

## 3. Ingest Entrypoints

```javascript
// Step 3: Fetch file content
Skill({
  skill: 'github-ops',
  args: ['api', 'repos/{owner}/{repo}/contents/{path}', '--jq', '.content'],
});
```
