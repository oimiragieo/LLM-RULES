# ArXiv Monitor Research Requirements (2026)

## Verified Tech Stack

- **API**: ArXiv REST API (no authentication)
- **Scheduling**: CronCreate from scheduled-tasks skill
- **Storage**: MemoryRecord for deduplication, named memory for digest

## API Reference

### ArXiv API Endpoint

```
https://export.arxiv.org/api/query?search_query=all:{ENCODED_KEYWORD}&sortBy=submittedDate&sortOrder=descending&max_results=10
```

### Response Format (Atom XML)

- `<entry>` elements contain paper details
- `<id>` contains the ArXiv ID
- `<title>` contains paper title
- `<author><name>` contains author names
- `<summary>` contains abstract
- `<published>` contains publication date
- `<link>` contains URL to paper

## Integration Patterns

### Cron Scheduling

```javascript
CronCreate({
  schedule: '0 */6 * * *', // Every 6 hours
  task: "Invoke Skill({ skill: 'arxiv-monitor' })",
});
```

### Memory Storage

```javascript
// Store seen paper IDs
await writeMemory('arxiv-seen-ids', JSON.stringify(seenIds));

// Append to digest
fs.writeFileSync('arxiv-digest.md', existingContent + newDigest);
```

## Source References

- [ArXiv API Documentation](https://arxiv.org/help/api/user-manual)
- [ArXiv API User Guide](https://info.arxiv.org/help/api/basics.html)
