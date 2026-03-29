# ArXiv Monitor Skill Workflow

## Skill Location

`.claude/skills/arxiv-monitor/SKILL.md`

## Invocation

- /arxiv-monitor
- node .claude/skills/arxiv-monitor/scripts/main.cjs --help

## Cron Integration

Schedule automated paper monitoring every 6 hours:

```javascript
CronCreate({
  schedule: '0 */6 * * *',
  task: "Invoke Skill({ skill: 'arxiv-monitor' })"
});
```

## Morning Briefing Integration

The morning briefing loop reads the arxiv-digest for recent papers:

```
/loop at 8:00am Read .claude/context/memory/named/arxiv-digest.md and summarize top 3 papers.
```
