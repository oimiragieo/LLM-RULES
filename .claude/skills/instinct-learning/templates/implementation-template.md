# Instinct Learning — Implementation Template

Use this template when integrating instinct-learning into an agent workflow.

## Pre-Task: Load Relevant Instincts

```javascript
// At start of task, query relevant instincts
Skill({ skill: 'instinct-learning' });

// Then run CLI:
// node .claude/skills/instinct-learning/scripts/main.cjs \
//   --action query \
//   --tags "{{domain_tags}}" \
//   --min-confidence 0.6
```

Review returned instincts and apply any that are relevant to the current task.

## Post-Task: Record New Instincts

After completing meaningful work, record any new patterns observed:

```javascript
// Record a new instinct
// node .claude/skills/instinct-learning/scripts/main.cjs \
//   --action record \
//   --text "{{atomic_behavior_description}}" \
//   --confidence {{0.3_to_0.9}} \
//   --tags "{{comma_separated_tags}}" \
//   --source "{{what_you_observed}}"
```

## Updating Existing Instincts

If you observe an existing instinct proving reliable again:

```javascript
// Increase confidence of existing instinct
// node .claude/skills/instinct-learning/scripts/main.cjs \
//   --action update \
//   --id "{{instinct_id}}" \
//   --confidence {{increased_score}}
```

## Confidence Decision Guide

| Situation                           | Confidence to Assign |
| ----------------------------------- | -------------------- |
| First time observing this pattern   | 0.3 – 0.4            |
| Second confirmation in same project | 0.5                  |
| Consistent across multiple tasks    | 0.6 – 0.7            |
| Highly reliable, proven repeatedly  | 0.8 (auto-promotes)  |
| Cross-project validated             | 0.9                  |
