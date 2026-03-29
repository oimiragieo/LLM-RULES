# Perpetual Memory Research Requirements (2026)

## Verified Tech Stack

- **Database**: LanceDB
- **Table**: `perpetual_memory`
- **Embeddings**: Semantic vectors

## Memory Schema

```json
{
  "id": "uuid",
  "content": "text",
  "category": "decision|issue|pattern|learning",
  "agent": "source agent",
  "timestamp": "ISO date",
  "embedding": "vector"
}
```

## Source References

- LanceDB documentation
- Agent memory architecture in agent-studio
