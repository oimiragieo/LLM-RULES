# arxiv-monitor Implementation Template

## Goal

- Monitor ArXiv for new papers matching configured keywords
- Deduplicate against previously seen papers
- Store summaries for morning briefing integration

## TDD

1. Red - Write tests for ArXiv API query and deduplication
2. Green - Implement ArXiv search and MemoryRecord storage
3. Refactor - Optimize keyword batching and error handling

## Verification

- lint
- format
- targeted tests

## Implementation Checklist

1. Load keywords from environment configuration
2. Query ArXiv API for each keyword
3. Parse XML response and extract paper metadata
4. Check MemoryRecord for previously seen paper IDs
5. Store new papers in named memory digest
6. Update seen IDs list (capped at 1000)
