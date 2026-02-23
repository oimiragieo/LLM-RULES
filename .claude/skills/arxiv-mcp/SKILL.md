---
name: arxiv-mcp
description: Search and retrieve academic papers from arXiv.org using WebFetch and Exa. No MCP server required - uses existing tools to access arXiv API directly.
version: 2.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [WebFetch, mcp__Exa__web_search_exa]

# No MCP server required - uses WebFetch + Exa
requires_mcp_server: false
mcp_server_status: not_required

best_practices:
  - Use specific search queries for better results
  - Combine author and keyword searches when appropriate
  - Use Exa for semantic search, WebFetch for specific paper IDs
  - Check multiple related papers for comprehensive research
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

**Mode: Cognitive/Prompt-Driven** — No standalone utility script; use via agent context.

# arXiv Search Skill

<identity>
arXiv Search Skill - Search and retrieve academic papers from arXiv.org using existing tools (WebFetch, Exa). No MCP server installation required.
</identity>

## ✅ No Installation Required

This skill uses **existing tools** to access arXiv:

- **WebFetch** - Direct access to arXiv API
- **Exa** - Semantic search with arXiv filtering

Works immediately - no MCP server, no restart needed.

<capabilities>
- Search academic papers by keywords, authors, categories, or date ranges
- Retrieve detailed paper metadata (title, authors, abstract, categories, PDF link)
- Get specific papers by arXiv ID
- Find related papers based on categories and keywords
- Filter by arXiv categories (cs.AI, cs.LG, cs.CV, math.*, physics.*, etc.)
- No API key required - uses public arXiv API
</capabilities>

## Result Limits (Memory Safeguard)

arxiv-mcp returns academic papers. To prevent memory exhaustion:

- **max_results: 20 (HARD LIMIT)**
- Each paper metadata ~300 bytes
- 20 papers × 300 bytes = ~6 KB metadata
- Papers can be 100+ KB each if fetched - DON'T fetch full papers

**Why the limit?**

- Previous limit: 100 results → 30 KB+ metadata → context explosion
- New limit: 20 results → 6 KB metadata → memory safe
- 20 papers is usually enough to find your target

<instructions>
<execution_process>

## Method 1: WebFetch with arXiv API (Recommended for specific queries)

The arXiv API is publicly accessible at `http://export.arxiv.org/api/query`.

### Recommended Pattern

```javascript
// ✓ GOOD: Limit results to 20
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=all:transformer+attention&max_results=20&sortBy=relevance',
  prompt: 'Extract paper titles, authors, abstracts, arXiv IDs, and PDF links from these results',
});

// ✓ GOOD: Use specific filters to reduce result set
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=all:transformer+attention+2025&max_results=20&sortBy=submittedDate',
  prompt: 'Extract recent papers on transformer attention',
});

// ✗ BAD: Old behavior - unlimited or >20 results
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=all:neural+networks',
  // Too broad - will get 100s of results
});

// ✗ BAD: Exceeds memory limit
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=all:deep+learning&max_results=100',
  // Over limit - memory risk
});
```

### Search by Keywords

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=all:transformer+attention&max_results=20&sortBy=relevance',
  prompt: 'Extract paper titles, authors, abstracts, arXiv IDs, and PDF links from these results',
});
```

### Search by Author

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=au:LeCun&max_results=10&sortBy=submittedDate',
  prompt: 'Extract paper titles, authors, abstracts, and arXiv IDs',
});
```

### Search by Category

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=cat:cs.LG&max_results=15&sortBy=submittedDate',
  prompt: 'Extract paper titles, authors, abstracts, categories, and arXiv IDs',
});
```

### Get Specific Paper by ID

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?id_list=2301.07041',
  prompt:
    'Extract full details: title, all authors, abstract, categories, published date, PDF link',
});
```

### API Query Parameters

| Parameter      | Description                                                 | Example                                       |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `search_query` | Search terms with field prefixes                            | `all:transformer`, `au:LeCun`, `ti:attention` |
| `id_list`      | Comma-separated arXiv IDs                                   | `2301.07041,2302.13971`                       |
| `max_results`  | Number of results (default 10, max 100)                     | `max_results=20`                              |
| `start`        | Offset for pagination                                       | `start=10`                                    |
| `sortBy`       | Sort order: `relevance`, `lastUpdatedDate`, `submittedDate` | `sortBy=submittedDate`                        |
| `sortOrder`    | `ascending` or `descending`                                 | `sortOrder=descending`                        |

### Field Prefixes for search_query

| Prefix | Field      | Example                   |
| ------ | ---------- | ------------------------- |
| `all:` | All fields | `all:machine+learning`    |
| `ti:`  | Title      | `ti:transformer`          |
| `au:`  | Author     | `au:Vaswani`              |
| `abs:` | Abstract   | `abs:attention+mechanism` |
| `cat:` | Category   | `cat:cs.LG`               |
| `co:`  | Comment    | `co:accepted`             |

### Boolean Operators

Combine terms with `AND`, `OR`, `ANDNOT`:

```
search_query=ti:transformer+AND+abs:attention
search_query=au:LeCun+OR+au:Bengio
search_query=cat:cs.LG+ANDNOT+ti:survey
```

### When NOT to Use arxiv-mcp

- General web research → Use WebSearch/WebFetch instead
- Implementation examples → Use `pnpm search:code` or ripgrep skill on codebase (Grep/Glob as fallback)
- Product research → Use WebSearch with news filter
- Community discussions → Use WebSearch for forums/Stack Overflow

**arxiv-mcp is best for:**

- Finding academic papers on specific topics
- Understanding theoretical foundations
- Citing research in documentation
- Quick literature review (20 papers max)

---

## Method 2: Exa Search (Better for semantic/natural language queries)

Use Exa for more natural language queries with arXiv filtering:

### Semantic Search

```javascript
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org transformer architecture attention mechanism deep learning',
  numResults: 10,
});
```

### Recent Papers in a Field

```javascript
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org large language model scaling laws 2024',
  numResults: 15,
});
```

### Author-Focused Search

```javascript
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org author:"Yann LeCun" deep learning',
  numResults: 10,
});
```

---

## Common arXiv Categories

| Category   | Field                           |
| ---------- | ------------------------------- |
| cs.AI      | Artificial Intelligence         |
| cs.LG      | Machine Learning                |
| cs.CL      | Computation and Language (NLP)  |
| cs.CV      | Computer Vision                 |
| cs.SE      | Software Engineering            |
| cs.CR      | Cryptography and Security       |
| stat.ML    | Machine Learning (Statistics)   |
| math.\*    | Mathematics (all subcategories) |
| physics.\* | Physics (all subcategories)     |
| q-bio.\*   | Quantitative Biology            |
| econ.\*    | Economics                       |

---

## Workflow: Complete Research Process

### Step 1: Initial Search

```javascript
// Start with broad Exa search for semantic matching
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org transformer attention mechanism neural networks',
  numResults: 10,
});
```

### Step 2: Get Specific Papers

```javascript
// Get details for interesting papers by ID
WebFetch({
  url: 'http://export.arxiv.org/api/query?id_list=2301.07041,2302.13971',
  prompt: 'Extract full metadata for each paper: title, authors, abstract, categories, PDF URL',
});
```

### Step 3: Find Related Work

```javascript
// Search by category of interesting paper
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=cat:cs.LG+AND+ti:attention&max_results=10&sortBy=submittedDate',
  prompt: 'Find related papers, extract titles and abstracts',
});
```

### Step 4: Get Recent Papers

```javascript
// Latest papers in the field
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=cat:cs.LG&max_results=20&sortBy=submittedDate&sortOrder=descending',
  prompt: 'Extract the 20 most recent machine learning papers',
});
```

</execution_process>

<best_practices>

1. **Use Exa for discovery**: Natural language queries find semantically related papers
2. **Use WebFetch for precision**: Specific IDs, categories, or API queries
3. **Combine approaches**: Exa to discover, WebFetch to deep-dive
4. **Use specific queries**: "transformer attention mechanism" > "machine learning"
5. **Check multiple categories**: Papers often span cs.AI + cs.LG + cs.CL
6. **Sort by date for recent work**: `sortBy=submittedDate&sortOrder=descending`

</best_practices>
</instructions>

<examples>
<usage_example>
**Example 1: Search for transformer papers**:

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=ti:transformer+AND+abs:attention&max_results=10&sortBy=relevance',
  prompt: 'Extract paper titles, authors, abstracts, and arXiv IDs',
});
```

**Example 2: Find papers by researcher**:

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=au:Vaswani&max_results=15',
  prompt: 'List all papers by this author with titles and dates',
});
```

**Example 3: Get recent ML papers**:

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?search_query=cat:cs.LG&max_results=20&sortBy=submittedDate&sortOrder=descending',
  prompt: 'Extract the 20 most recent machine learning papers with titles and abstracts',
});
```

**Example 4: Semantic search with Exa**:

```javascript
mcp__Exa__web_search_exa({
  query: 'site:arxiv.org multimodal large language models vision 2024',
  numResults: 10,
});
```

**Example 5: Get specific paper details**:

```javascript
WebFetch({
  url: 'http://export.arxiv.org/api/query?id_list=1706.03762',
  prompt: "Extract complete details for the 'Attention Is All You Need' paper",
});
```

</usage_example>
</examples>

## Agent Integration

This skill is automatically assigned to:

- **researcher** - Academic research, literature review
- **scientific-research-expert** - Deep scientific analysis
- **developer** - Finding technical papers for implementation

## Iron Laws

1. **ALWAYS enforce max_results=20** — never allow unlimited or >20 result queries; context explosion from 100+ papers is a known failure mode that stalls agent pipelines.
2. **NEVER fetch full paper PDFs during literature review** — extract metadata and abstracts only; full papers are 100KB+ each and will exhaust context budget in minutes.
3. **ALWAYS use Exa for semantic discovery, WebFetch for precision retrieval** — Exa finds semantically related papers; WebFetch gets specific IDs or category feeds; use both in sequence, not interchangeably.
4. **NEVER use broad queries without field prefixes** — `search_query=neural+networks` returns thousands of results; always scope with `ti:`, `au:`, `cat:`, or `abs:` prefixes to target the query.
5. **ALWAYS cite arXiv IDs (e.g., 2301.07041) when referencing papers** — titles alone are ambiguous and change; IDs are stable, machine-readable, and enable instant retrieval.

## Anti-Patterns

| Anti-Pattern                             | Why It Fails                                                | Correct Approach                               |
| ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Using `max_results=100` or no limit      | Context explosion; 100 papers × 300 bytes = 30KB+ metadata  | Always set `max_results=20` (hard limit)       |
| Fetching full paper PDFs                 | Single paper can be 100KB+; kills context budget            | Extract abstract + metadata only via API       |
| Broad query without field prefix         | Returns irrelevant results across all fields                | Use `ti:`, `au:`, `cat:`, or `abs:` prefix     |
| Using only WebFetch for discovery        | Misses semantically related papers not matching exact terms | Use Exa for semantic discovery first           |
| Citing paper titles instead of arXiv IDs | Titles can be ambiguous or duplicated                       | Always include the arXiv ID (e.g., 1706.03762) |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
