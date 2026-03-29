# Auto-Recall Research Requirements (2026)

## Verified Tech Stack

- **Vector Store**: LanceDB, `perpetual_memory` table
- **Search**: Cosine similarity
- **Ranking**: Relevance + recency scoring

## Search Patterns

### Intent Classification

| Intent   | Filter            |
| -------- | ----------------- |
| Decision | category=decision |
| Issue    | category=issue    |
| Pattern  | category=pattern  |
| Learning | category=learning |

### Ranking Formula

```
final_score = similarity * 0.7 + recency_score * 0.3
```

## Source References

- LanceDB documentation
- Perpetual memory architecture in agent-studio
