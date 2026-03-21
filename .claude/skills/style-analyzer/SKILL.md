---
name: style-analyzer
description: >-
  Use when ingesting text samples to extract quantitative writing style metrics. Produces a structured
  JSON style profile with vocabulary patterns, sentence structure, tone markers, and formatting preferences.
  Invoke before voice-clone-generator to establish style constraints.
version: 1.0.0
---

# Style Analyzer

## Overview

Extract a structured, quantitative writing style profile from text samples. The profile captures vocabulary patterns, sentence structure, tone markers, and formatting preferences as measurable metrics that can constrain downstream content generation.

**Core principle:** Style is measurable. Every writer produces a statistical fingerprint across vocabulary, syntax, and formatting dimensions.

## When to Use

- Before generating content that should match a specific author's voice
- When building a reusable style profile for brand voice consistency
- When comparing writing styles across multiple authors or documents
- When auditing content for style drift from an established voice

## Workflow

### Step 1: Ingest Text Samples

Accept text from one or more sources:

```bash
# Analyze a single file
node .claude/tools/cli/style-profiler.cjs /path/to/sample.txt

# Analyze a directory of text files
node .claude/tools/cli/style-profiler.cjs /path/to/samples/

# Output is written to .claude/context/data/user-style-profile.json
```

Alternatively, read files with the `Read` tool and analyze inline for smaller samples.

**Minimum input requirements:**

- At least 3 text samples for reliable metrics
- Each sample should be 200+ words
- Samples should represent the author's typical output (not edge cases)

### Step 2: Extract Vocabulary Patterns

Analyze word usage across all samples:

1. **Tokenize** all text into words (lowercase, strip punctuation)
2. **Remove stop words** (the, a, is, are, etc.)
3. **Compute frequency distribution** of remaining words
4. **Extract top 50 vocabulary** (most frequently used content words)
5. **Calculate type-token ratio** (unique words / total words) as vocabulary richness score
6. **Identify signature phrases** (2-3 word combinations that appear 3+ times)

### Step 3: Analyze Sentence Structure

Measure syntactic patterns:

1. **Average sentence length** (words per sentence)
2. **Sentence length variance** (standard deviation)
3. **Short sentence ratio** (sentences under 8 words / total sentences)
4. **Long sentence ratio** (sentences over 25 words / total sentences)
5. **Question frequency** (questions / total sentences)
6. **Clause complexity** (average commas per sentence as a proxy)

### Step 4: Identify Tone Markers

Score the writing on five dimensions (each 1.0 to 5.0):

| Dimension  | 1.0 (Low)   | 5.0 (High)    | How Measured                                    |
| ---------- | ----------- | ------------- | ----------------------------------------------- |
| Formality  | Very formal | Very casual   | Contraction frequency, slang usage, punctuation |
| Directness | Hedged      | Blunt         | Hedge word frequency (maybe, perhaps, somewhat) |
| Emotion    | Neutral     | Expressive    | Exclamation marks, emotional adjectives         |
| Humor      | Serious     | Playful       | Parenthetical asides, informal interjections    |
| Authority  | Tentative   | Authoritative | Imperative sentences, certainty language        |

### Step 5: Detect Formatting Preferences

Analyze structural patterns:

1. **Average paragraph length** (sentences per paragraph)
2. **Heading depth** (H1 only, H1-H2, H1-H3, etc.)
3. **List frequency** (bulleted/numbered lists per 1000 words)
4. **Code block frequency** (code blocks per 1000 words, if technical)
5. **Bold/italic usage** (emphasis markers per 1000 words)
6. **Punctuation signature** (em-dash frequency, semicolon frequency, ellipsis frequency)

### Step 6: Build Style Profile JSON

Assemble all metrics into a structured profile:

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-21T00:00:00Z",
  "sampleCount": 5,
  "totalWords": 12450,
  "vocabulary": {
    "topWords": ["specific", "pattern", "implementation", "..."],
    "typeTokenRatio": 0.42,
    "signaturePhrases": ["in practice", "the key insight"]
  },
  "sentenceStructure": {
    "avgLength": 18.3,
    "lengthVariance": 7.2,
    "shortSentenceRatio": 0.15,
    "longSentenceRatio": 0.22,
    "questionFrequency": 0.08,
    "avgCommasPerSentence": 1.4
  },
  "tone": {
    "formality": 2.8,
    "directness": 4.1,
    "emotion": 2.0,
    "humor": 1.5,
    "authority": 3.8
  },
  "formatting": {
    "avgParagraphLength": 3.2,
    "headingDepth": 3,
    "listFrequencyPer1000": 2.1,
    "codeBlockFrequencyPer1000": 0.8,
    "emphasisFrequencyPer1000": 4.5,
    "punctuation": {
      "emDashFrequency": 0.03,
      "semicolonFrequency": 0.01,
      "ellipsisFrequency": 0.005,
      "exclamationFrequency": 0.02
    }
  }
}
```

Save to `.claude/context/data/user-style-profile.json`.

## Iron Laws

1. **ALWAYS** require minimum 3 text samples before computing a style profile -- fewer samples produce unreliable metrics that do not generalize.
2. **NEVER** include stop words in the top-50 vocabulary list -- stop words are universal and carry no style signal.
3. **ALWAYS** save the profile to `.claude/context/data/user-style-profile.json` -- downstream skills depend on this exact path.
4. **NEVER** treat a single metric in isolation as the style fingerprint -- style is the combination of all dimensions; individual metrics can coincide across very different authors.
5. **ALWAYS** include the `sampleCount` and `totalWords` fields in the profile -- consumers need to assess the statistical reliability of the metrics.

## Anti-Patterns

| Anti-Pattern                               | Why It Fails                                           | Correct Approach                                               |
| ------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------- |
| Analyzing a single short sample            | Insufficient data; metrics reflect one mood, not style | Require 3+ samples of 200+ words each                          |
| Including stop words in vocabulary metrics | Universal words add noise; no discriminative power     | Filter all stop words before frequency analysis                |
| Outputting profile to a non-standard path  | Downstream skills cannot find the profile              | Always write to `.claude/context/data/user-style-profile.json` |
| Treating tone as a single number           | Tone is multidimensional; a single score loses nuance  | Score all five dimensions independently                        |
| Skipping formatting analysis               | Style includes structure, not just words               | Always analyze paragraph length, heading depth, list usage     |

## Assigned Agents

This skill is used by:

- `voice-replicator-agent` -- Primary consumer for style-constrained content generation

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "style analysis text profiling"
```

Read `.claude/context/memory/learnings.md`

**After completing:**

- New style pattern discovered -> `.claude/context/memory/learnings.md`
- Issue with analysis -> `.claude/context/memory/issues.md`
- Decision about metrics -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
