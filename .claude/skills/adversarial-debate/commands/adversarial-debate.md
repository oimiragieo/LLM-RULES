# adversarial-debate Command Reference

## Invocation

```javascript
Skill({ skill: 'adversarial-debate' });
```

## CLI Usage

```bash
node .claude/skills/adversarial-debate/scripts/main.cjs \
  --topic "Should we use event sourcing for the order service?" \
  --pro "Yes — event sourcing provides audit trail and temporal queries" \
  --con "No — CRUD with snapshots is simpler and sufficient" \
  --rounds 3
```

## Arguments

| Argument     | Required | Default | Description                                    |
| ------------ | -------- | ------- | ---------------------------------------------- |
| `--topic`    | YES      | —       | The decision question (10-500 chars)           |
| `--pro`      | YES      | —       | PRO stance (what the PRO agent advocates)      |
| `--con`      | YES      | —       | CON stance (the alternative/opposing view)     |
| `--rounds`   | No       | 3       | Number of debate rounds (1-5)                  |
| `--context`  | No       | ""      | Background context about system or constraints |
| `--criteria` | No       | ""      | Success criteria for the recommendation        |

## Validation

```bash
node .claude/skills/adversarial-debate/hooks/pre-execute.cjs \
  '{"topic":"...","proStance":"...","conStance":"...","rounds":3}'
```

**Expected output:** `{"valid":true,"rounds":3}` or error list.

## Example Use Cases

```bash
# Architecture decision
node .claude/skills/adversarial-debate/scripts/main.cjs \
  --topic "Should we adopt microservices or stay monolithic?" \
  --pro "Microservices enable independent scaling and deployment" \
  --con "Monolith is simpler to operate and debug at our current scale" \
  --rounds 3

# Technology choice
node .claude/skills/adversarial-debate/scripts/main.cjs \
  --topic "Should we use PostgreSQL or MongoDB for user profiles?" \
  --pro "PostgreSQL — ACID guarantees and complex query support" \
  --con "MongoDB — flexible schema evolution and horizontal scaling" \
  --rounds 3

# Security trade-off
node .claude/skills/adversarial-debate/scripts/main.cjs \
  --topic "Should we enforce MFA for all internal tools?" \
  --pro "Yes — eliminates credential compromise risk" \
  --con "No — adds friction that slows engineering velocity significantly" \
  --rounds 2
```

## Output

Generates a JSON debate template with round scaffolding.
Final synthesis uses `templates/implementation-template.md`.
