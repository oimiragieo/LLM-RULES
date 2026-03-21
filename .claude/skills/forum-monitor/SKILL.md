---
name: forum-monitor
description: >-
  Use when monitoring online forums (Reddit, HN, ProductHunt) for recurring user
  pain points, feature requests, and unmet needs. Invoke for market research,
  pain-point discovery, trend detection, and competitive intelligence. Designed
  for scheduled execution via CronCreate.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebSearch, WebFetch, MemoryRecord]
agents: [forum-monitor-agent, researcher]
category: research
tags:
  [forum, reddit, hackernews, producthunt, pain-points, market-research, trend-detection, nlp, cron]
best_practices:
  - Always cite source URLs for every finding
  - Cross-reference at least 2 forums before reporting a trend
  - Use weighted opportunity scoring, not subjective assessment
  - Include verbatim user quotes as primary evidence
  - Design reports for downstream consumption by app-generator-agent
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-03-21'
---

# Forum Monitor

## Overview

Systematic workflow for monitoring online communities to discover recurring user pain points. Transforms unstructured forum discussions into ranked, evidence-backed opportunity reports suitable for automated app generation pipelines.

**Core principle:** Pain points with high frequency and high engagement are the strongest product signals. Monitor, classify, rank, report.

## When to Use

- Discovering product opportunities from community feedback
- Running periodic (daily/weekly) market research scans
- Identifying trending complaints or feature requests
- Competitive intelligence gathering from user discussions
- Feeding the app-generation-workflow with validated pain points

## Cron Integration

This skill is designed to run on a schedule via CronCreate:

```javascript
CronCreate({
  name: 'weekly-forum-scan',
  schedule: '0 9 * * MON', // Every Monday at 9 AM
  prompt:
    'Run forum monitor scan for [target domain]. Invoke Skill({ skill: "forum-monitor" }). Save report to .claude/context/reports/backend/',
});
```

## Workflow

### Step 1: Configure Target Forums

Define the forums to monitor based on the target domain:

**Forum Selection Matrix:**

| Forum         | Best For                        | Query Pattern                                 |
| ------------- | ------------------------------- | --------------------------------------------- |
| Reddit        | Consumer pain points, UX issues | `site:reddit.com <topic> frustrating OR wish` |
| Hacker News   | Developer tools, B2B SaaS       | `site:news.ycombinator.com <topic>`           |
| ProductHunt   | New product gaps, feature envy  | `site:producthunt.com <topic>`                |
| Indie Hackers | Solo dev pain points, pricing   | `site:indiehackers.com <topic>`               |
| Dev.to        | Developer workflow friction     | `site:dev.to <topic> pain OR annoy`           |

**Query Templates:**

```
"{topic} frustrating OR annoying OR wish OR need OR missing"
"{topic} alternative to OR better than OR looking for"
"{topic} feature request OR roadmap OR please add"
```

### Step 2: Scrape and Collect

For each configured forum, execute searches and extract content:

```javascript
// Search for pain points
WebSearch({ query: 'site:reddit.com {topic} frustrating OR wish OR need 2026' });

// Fetch specific threads with high engagement
WebFetch({
  url: '{thread-url}',
  prompt:
    'Extract all complaints, feature requests, and pain points. For each, note the exact quote, upvote count, and whether others agreed.',
});
```

**Collection Requirements:**

- Minimum 20 posts per forum per scan
- Include posts from the last 30 days (or configurable window)
- Capture: title, URL, community, engagement (upvotes + comments), date, key quotes

### Step 3: Classify Pain Points

Categorize each collected item into one of these categories:

| Category            | Signal Words                            | Example                              |
| ------------------- | --------------------------------------- | ------------------------------------ |
| `missing-feature`   | "wish", "need", "please add", "roadmap" | "I wish Notion had offline mode"     |
| `workflow-friction` | "slow", "clunky", "takes forever"       | "It takes 10 clicks to export a PDF" |
| `bug-report`        | "broken", "crashes", "error"            | "The app crashes on large files"     |
| `pricing`           | "expensive", "not worth", "free alt"    | "Too expensive for a solo dev"       |
| `ux-confusion`      | "confusing", "can't find", "intuitive"  | "I had no idea where settings were"  |
| `integration-gap`   | "connect to", "integrate with", "API"   | "No Zapier integration available"    |

### Step 4: Cluster and Deduplicate

Group similar pain points into clusters:

1. Exact duplicates: same complaint, different posts -> merge, sum engagement
2. Semantic duplicates: similar complaint, different wording -> cluster, note variants
3. Related but distinct: same domain, different problems -> keep separate

### Step 5: Rank by Opportunity Score

For each cluster, compute:

```
Opportunity Score = (Frequency x 0.4) + (Engagement x 0.3) + (Recency x 0.2) + (Sentiment Intensity x 0.1)
```

Where:

- **Frequency**: Number of unique posts mentioning this pain point (normalized 0-10)
- **Engagement**: Total upvotes + comments across all posts (normalized 0-10)
- **Recency**: How recent the complaints are (last 7 days = 10, last 30 days = 5, older = 2)
- **Sentiment Intensity**: How strongly negative the language is (0-10)

### Step 6: Generate Report

Write structured output to `.claude/context/reports/backend/forum-monitor-report-{YYYY-MM-DD}.md`:

```markdown
<!-- Agent: forum-monitor-agent | Task: #{id} | Session: {date} -->

# Forum Monitor Report

**Scan Period**: {start-date} to {end-date}
**Forums Monitored**: {list}
**Total Posts Analyzed**: {count}
**Pain Point Clusters Found**: {count}

## Top Pain Points (Ranked by Opportunity Score)

| Rank | Pain Point | Category | Freq | Engagement | Score | Sources |
| ---- | ---------- | -------- | ---- | ---------- | ----- | ------- |
| 1    | [desc]     | [cat]    | [n]  | [n]        | [n.n] | [n]     |

## Detailed Findings

### 1. [Pain Point Title] (Score: X.X)

**Category**: [type]
**Frequency**: [n] mentions across [n] sources
**Engagement**: [total upvotes] upvotes, [total comments] comments
**Forums**: [list of forums where this appeared]

**Representative Quotes:**

1. "[exact quote]" - [source URL] ([n] upvotes)
2. "[exact quote]" - [source URL] ([n] upvotes)
3. "[exact quote]" - [source URL] ([n] upvotes)

**App Opportunity Assessment:**

- Buildable as standalone app: YES/NO
- Estimated complexity: LOW/MEDIUM/HIGH
- Existing solutions: [list or "none found"]
- Differentiation angle: [what would make a new solution win]
```

## Iron Laws

1. **ALWAYS cite source URLs** for every finding -- unverifiable claims are worthless
2. **NEVER fabricate engagement metrics** -- counts must come from actual collected data
3. **ALWAYS cross-reference at least 2 forums** before declaring a trend
4. **NEVER include content from private or gated forums** -- public content only
5. **ALWAYS include verbatim quotes** -- user language is more valuable than agent summaries

## Anti-Patterns

| Anti-Pattern                  | Why It Fails                                        | Correct Approach                              |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Single-forum reports          | One community is not representative                 | Cross-reference 2+ forums before trending     |
| Subjective ranking            | Personal opinion is not data                        | Use weighted opportunity formula              |
| Missing source URLs           | Downstream agents cannot validate findings          | Every finding must have a clickable source    |
| Stale data without date range | Trends from 2024 are not 2026 trends                | Always specify scan period in report header   |
| Over-counting duplicates      | Same user posting in 3 threads is not 3 data points | Deduplicate by unique user + unique complaint |

## Related Skills

- `browser-automation` -- for deeper scraping when WebSearch/WebFetch are insufficient
- `deep-research` -- for comprehensive investigation of specific pain points
- `feedback-analysis` -- for structured sentiment and NPS analysis

## Assigned Agents

| Agent                 | Role                                    |
| --------------------- | --------------------------------------- |
| `forum-monitor-agent` | Primary -- executes the full workflow   |
| `researcher`          | Supporting -- deeper investigation      |
| `app-generator-agent` | Consumer -- reads reports for app ideas |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "forum monitor pain points trends"
```

Read `.claude/context/memory/learnings.md`

**After completing:**

- New monitoring pattern -> `.claude/context/memory/learnings.md`
- Forum access issue -> `.claude/context/memory/issues.md`
- Scoring model decision -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
