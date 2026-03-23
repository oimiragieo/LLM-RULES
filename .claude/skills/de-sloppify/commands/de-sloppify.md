# de-sloppify Command

## Usage

```bash
node .claude/skills/de-sloppify/scripts/main.cjs --action <action> --files "<comma_separated_paths>"
```

## Actions

### find-unused-imports — Detect unused ES6/CommonJS imports

```bash
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-unused-imports \
  --files "src/auth/jwt.js,src/utils/helpers.ts"
```

**Expected output:** JSON array of `{ file, line, import }` objects.

**Example:**

```json
[{ "file": "src/auth/jwt.js", "line": 3, "import": "crypto" }]
```

### find-console-logs — Detect debug console calls

```bash
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-console-logs \
  --files "src/auth/jwt.js,src/utils/helpers.ts"
```

**Expected output:** JSON array of `{ file, line, statement }` objects.

**Example:**

```json
[{ "file": "src/utils/helpers.ts", "line": 42, "statement": "console.log('debug', value)" }]
```

**Note:** `console.error` inside catch blocks is NOT flagged (intentional error logging).

### find-commented-code — Detect commented-out code blocks

```bash
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-commented-code \
  --files "src/auth/jwt.js,src/utils/helpers.ts"
```

**Expected output:** JSON array of `{ file, line, content }` objects.

**Example:**

```json
[
  {
    "file": "src/auth/jwt.js",
    "line": 17,
    "content": "// const oldToken = generateLegacyToken(user)"
  }
]
```

**Note:** JSDoc blocks, TODO-with-context, `it.skip`, and uppercase label comments are NOT flagged.

## Exit Codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| 0    | Success — JSON array written to stdout |
| 1    | Validation or runtime error            |
