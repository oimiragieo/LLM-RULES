---
name: arxiv-monitor
version: 1.0.0
description: Scheduled ArXiv paper monitor. Uses CronCreate to search configured keywords every 6 hours, deduplicates via MemoryRecord, and stores summaries in named memory for morning briefing integration.
category: research
trigger: when user wants to monitor ArXiv papers, schedule research updates, or integrate paper discovery into the heartbeat ecosystem
tools: [Bash, Read, Write, Skill, MemoryRecord, CronCreate, CronList, CronDelete]
dependencies: [scheduled-tasks]
tags: [arxiv, research, monitor, scheduled, heartbeat, loop, papers]
model: sonnet
invoked_by: both
user_invocable: true
verified: true
created_by: direct (retroactive attribution)
compliance_status: legacy-direct-creation
---

<!-- Agent: nodejs-pro | Task: #12 | Session: 2026-03-08 -->

# ArXiv Monitor Skill

Polls the ArXiv API every 6 hours for papers matching configured keywords. Deduplicates against previously seen papers, stores new summaries in named memory, and integrates with the morning briefing loop.

---

## Setup

1. Set `ARXIV_KEYWORDS` in `.env`:

   ```
   ARXIV_KEYWORDS=multi-agent systems,LLM reasoning,autonomous agents,RAG,tool use
   ```

2. Start the monitor loop:

   ```
   /loop 6h Skill({ skill: 'arxiv-monitor' })
   ```

   Or via CronCreate for programmatic control:

   ```javascript
   CronCreate({
     schedule: '0 */6 * * *',
     task: "Invoke Skill({ skill: 'arxiv-monitor' }) to fetch new ArXiv papers",
   });
   ```

---

## Core Logic

### Step 1: Load Keywords and Seen Papers

```javascript
const keywords = (process.env.ARXIV_KEYWORDS || 'multi-agent systems,autonomous agents')
  .split(',')
  .map(k => k.trim());

// Load previously seen paper IDs from memory
const seenRaw = await readMemory('arxiv-seen-ids');
const seenIds = new Set(seenRaw ? JSON.parse(seenRaw) : []);
```

### Step 2: Search ArXiv API for Each Keyword

Use Bash to query the ArXiv API (no authentication required):

```bash
# Search for papers from last 7 days matching a keyword
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$KEYWORD")
curl -s "https://export.arxiv.org/api/query?search_query=all:${ENCODED}&sortBy=submittedDate&sortOrder=descending&max_results=10"
```

Or use the HuggingFace MCP paper_search tool if available:

```javascript
// Via mcp__claude_ai_Hugging_Face__paper_search if available
// Falls back to curl-based ArXiv API otherwise
```

### Step 3: Filter and Store New Papers

```javascript
const newPapers = [];
for (const paper of fetchedPapers) {
  if (seenIds.has(paper.id)) continue; // Skip already processed
  seenIds.add(paper.id);
  newPapers.push({
    id: paper.id,
    title: paper.title,
    authors: paper.authors.slice(0, 3).join(', '),
    summary: paper.summary.slice(0, 300),
    published: paper.published,
    url: paper.url,
    keyword: keyword,
  });
}

// Persist seen IDs via named memory (cap at 1000 to prevent unbounded growth)
const seenArr = [...seenIds].slice(-1000);
await writeMemory('arxiv-seen-ids', JSON.stringify(seenArr));
```

### Step 4: Append to Digest File

```javascript
if (newPapers.length > 0) {
  const digest = newPapers
    .map(
      p =>
        `## ${p.title}\n**Authors:** ${p.authors}\n**Keyword:** ${p.keyword}\n**Published:** ${p.published}\n${p.summary}...\n[Read →](${p.url})\n`
    )
    .join('\n---\n');

  // Append to named memory digest
  const digestPath = '.claude/context/memory/named/arxiv-digest.md';
  const existing = fs.existsSync(digestPath) ? fs.readFileSync(digestPath, 'utf8') : '';
  fs.writeFileSync(
    '.claude/context/memory/named/arxiv-digest.md',
    `${existing}\n\n## ArXiv Update — ${new Date().toISOString().slice(0, 10)}\n\n${digest}`
  );
}
```

---

## Integration with Morning Briefing

The morning briefing loop reads `arxiv-digest.md` for recent papers:

```
/loop at 8:00am Read .claude/context/memory/named/arxiv-digest.md and issues.md. Summarize: (1) top 3 new papers relevant to agent-studio, (2) technical debt, (3) top 2 tasks for today.
```

---

## Configuration Reference

| Variable              | Default               | Description                      |
| --------------------- | --------------------- | -------------------------------- |
| `ARXIV_KEYWORDS`      | `multi-agent systems` | Comma-separated search keywords  |
| `ARXIV_MAX_RESULTS`   | `10`                  | Max papers per keyword per run   |
| `ARXIV_LOOKBACK_DAYS` | `7`                   | Days to look back for new papers |

---

## Deduplication

- Seen paper IDs stored via `writeMemory('arxiv-seen-ids', ...)` (named memory API)
- Capped at 1000 most recent IDs to prevent unbounded growth
- Papers with matching IDs are silently skipped on subsequent runs
- Reset by calling `await writeMemory('arxiv-seen-ids', '[]')`

---

## Related Skills

- `scheduled-tasks` — CronCreate API for scheduling loops
- `exa-monitor` — Exa web search companion monitor
- `heartbeat` — Start all 7 heartbeat loops including this one
- `memory-search` — Search the arxiv-digest for specific papers
