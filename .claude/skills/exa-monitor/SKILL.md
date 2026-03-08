---
name: exa-monitor
version: 1.0.0
description: Scheduled Exa web search monitor. Uses CronCreate to search configured topics every 4 hours via mcp__Exa__web_search_exa, deduplicates URLs via MemoryRecord, and stores summaries for morning briefing integration.
category: research
trigger: when user wants to monitor web topics, schedule web research updates, or integrate news discovery into the heartbeat ecosystem
tools: [Bash, Read, Write, Skill, MemoryRecord, CronCreate, CronList, CronDelete]
dependencies: [scheduled-tasks]
tags: [exa, web-search, research, monitor, scheduled, heartbeat, loop, news]
model: sonnet
invoked_by: both
user_invocable: true
verified: true
created_by: direct (retroactive attribution)
compliance_status: legacy-direct-creation
---

<!-- Agent: nodejs-pro | Task: #12 | Session: 2026-03-08 -->

# Exa Monitor Skill

Polls the Exa search engine every 4 hours for topics configured in `EXA_MONITOR_TOPICS`. Deduplicates results against previously seen URLs, stores new summaries in named memory, and integrates with the morning briefing loop.

---

## Setup

1. Set `EXA_MONITOR_TOPICS` in `.env`:

   ```
   EXA_MONITOR_TOPICS=["Claude AI updates","agent frameworks","LLM tooling","AI safety"]
   ```

2. Start the monitor loop:

   ```
   /loop 4h Skill({ skill: 'exa-monitor' })
   ```

   Or via CronCreate:

   ```javascript
   CronCreate({
     schedule: '0 */4 * * *',
     task: "Invoke Skill({ skill: 'exa-monitor' }) to fetch new Exa search results",
   });
   ```

---

## Core Logic

### Step 1: Load Topics and Seen URLs

```javascript
let topics;
try {
  topics = JSON.parse(process.env.EXA_MONITOR_TOPICS || '["Claude AI updates","agent frameworks"]');
} catch (_e) {
  topics = ['Claude AI updates', 'agent frameworks'];
}

// Load previously seen URLs from memory
const seenRaw = await readMemory('exa-seen-urls');
const seenUrls = new Set(seenRaw ? JSON.parse(seenRaw) : []);
```

### Step 2: Search Each Topic via Exa MCP

```javascript
// Use Exa MCP tool (preferred — returns structured results)
// Skill({ skill: 'exa-monitor' }) invokes mcp__Exa__web_search_exa internally:
// mcp__Exa__web_search_exa({ query: topic, numResults: 5, useAutoprompt: true })

// Falls back to mcp__Exa__get_code_context_exa for technical topics
```

### Step 3: Filter and Deduplicate

```javascript
const newResults = [];
for (const result of exaResults) {
  if (seenUrls.has(result.url)) continue;
  seenUrls.add(result.url);
  newResults.push({
    title: result.title,
    url: result.url,
    summary: result.text?.slice(0, 400) || result.highlights?.join(' ') || '',
    topic,
    publishedDate: result.publishedDate,
  });
}

// Persist seen URLs via named memory (cap at 2000)
const seenArr = [...seenUrls].slice(-2000);
await writeMemory('exa-seen-urls', JSON.stringify(seenArr));
```

### Step 4: Append to Digest

```javascript
if (newResults.length > 0) {
  const digest = newResults
    .map(
      r =>
        `## ${r.title}\n**Topic:** ${r.topic}\n**Published:** ${r.publishedDate || 'unknown'}\n${r.summary}...\n[Read →](${r.url})\n`
    )
    .join('\n---\n');

  // Append to exa-digest.md
  const existing = fs.existsSync('.claude/context/memory/named/exa-digest.md')
    ? fs.readFileSync('.claude/context/memory/named/exa-digest.md', 'utf8')
    : '';
  fs.writeFileSync(
    '.claude/context/memory/named/exa-digest.md',
    `${existing}\n\n## Exa Update — ${new Date().toISOString().slice(0, 10)}\n\n${digest}`
  );
}
```

---

## Integration with Morning Briefing

```
/loop at 8:00am Read .claude/context/memory/named/exa-digest.md and arxiv-digest.md. Summarize the most relevant news and papers for agent-studio development. Highlight any urgent developments.
```

---

## Configuration Reference

| Variable             | Default                 | Description                              |
| -------------------- | ----------------------- | ---------------------------------------- |
| `EXA_MONITOR_TOPICS` | `["Claude AI updates"]` | JSON array of search topics              |
| `EXA_MAX_RESULTS`    | `5`                     | Max results per topic per run            |
| `EXA_AUTOPROMPT`     | `true`                  | Let Exa optimize the query automatically |

---

## Deduplication

- Seen URLs stored via `writeMemory('exa-seen-urls', ...)` (named memory API)
- Capped at 2000 most recent URLs
- Reset with: `await writeMemory('exa-seen-urls', '[]')`

---

## Related Skills

- `scheduled-tasks` — CronCreate API
- `arxiv-monitor` — ArXiv companion monitor for academic papers
- `heartbeat` — Full heartbeat ecosystem including this loop
- `memory-search` — Search the exa-digest for specific topics
