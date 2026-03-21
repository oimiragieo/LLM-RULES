---
name: voice-clone-generator
description: >-
  Use when generating new content that must match an established writing style profile. Loads the style
  profile from style-analyzer, constructs a style-constrained system prompt, generates content, and
  performs A/B comparison against original samples for quality verification.
version: 1.0.0
---

# Voice Clone Generator

## Overview

Generate new content that authentically mimics a specific author's writing style. Uses the structured style profile produced by `style-analyzer` to construct generation constraints, then verifies output quality by comparing against the original samples.

**Core principle:** Generation without constraints produces generic text. The style profile is the contract between analysis and generation.

## When to Use

- After `style-analyzer` has produced a style profile at `.claude/context/data/user-style-profile.json`
- When generating blog posts, emails, documentation, or any prose in someone's voice
- When maintaining brand voice consistency across multiple content pieces
- When ghostwriting content that must read as if written by a specific person

## Prerequisites

- A valid style profile must exist at `.claude/context/data/user-style-profile.json`
- At least one original sample must be available for A/B comparison
- The content topic or brief must be provided by the user

## Workflow

### Step 1: Load Style Profile

Read the style profile and validate it has the required fields:

```javascript
const profile = JSON.parse(
  fs.readFileSync('.claude/context/data/user-style-profile.json', 'utf-8')
);

// Validate required sections exist
const required = ['vocabulary', 'sentenceStructure', 'tone', 'formatting'];
for (const section of required) {
  if (!profile[section]) {
    throw new Error(`Style profile missing required section: ${section}`);
  }
}
```

If the profile does not exist, invoke `Skill({ skill: 'style-analyzer' })` first.

### Step 2: Construct Style-Constrained System Prompt

Build a system prompt that encodes the style profile as generation constraints:

```
You are writing in the voice of a specific author. Follow these constraints precisely:

VOCABULARY:
- Prefer these words when applicable: [top 20 from profile.vocabulary.topWords]
- Use these signature phrases naturally: [profile.vocabulary.signaturePhrases]
- Vocabulary richness target: [profile.vocabulary.typeTokenRatio] type-token ratio

SENTENCE STRUCTURE:
- Target average sentence length: [profile.sentenceStructure.avgLength] words
- Mix short sentences ([shortSentenceRatio]%) with longer ones ([longSentenceRatio]%)
- Use questions at [questionFrequency]% frequency
- Average [avgCommasPerSentence] commas per sentence for clause complexity

TONE:
- Formality level: [profile.tone.formality]/5.0 ([interpret: 1=very formal, 5=very casual])
- Directness: [profile.tone.directness]/5.0 ([interpret: 1=hedged, 5=blunt])
- Emotional expression: [profile.tone.emotion]/5.0
- Humor: [profile.tone.humor]/5.0
- Authority: [profile.tone.authority]/5.0

FORMATTING:
- Paragraphs should average [profile.formatting.avgParagraphLength] sentences
- Use heading depth up to H[profile.formatting.headingDepth]
- Include approximately [profile.formatting.listFrequencyPer1000] lists per 1000 words
- [If emDashFrequency > 0.02: "Use em-dashes frequently"]
- [If exclamationFrequency < 0.01: "Avoid exclamation marks"]
```

### Step 3: Generate Content

Using the constructed system prompt, generate the requested content. The generation should:

1. Follow the topic/brief provided by the user
2. Adhere to all style constraints from Step 2
3. Be original text -- not copied from the samples
4. Match the approximate length requested by the user

### Step 4: A/B Compare with Original Samples

After generation, compare the output against the original samples on these dimensions:

| Metric               | How to Measure                                  | Acceptable Deviation  |
| -------------------- | ----------------------------------------------- | --------------------- |
| Avg sentence length  | Count words per sentence in generated text      | Within 20% of profile |
| Vocabulary overlap   | % of top-50 words that appear in generated text | At least 40%          |
| Tone formality       | Re-score generated text on formality scale      | Within 0.5 of profile |
| Paragraph length     | Count sentences per paragraph in generated text | Within 30% of profile |
| Punctuation patterns | Count em-dashes, semicolons per sentence        | Within 50% of profile |

### Step 5: Refine if Needed

If any metric exceeds acceptable deviation:

1. Identify the specific constraint that was violated
2. Strengthen that constraint in the system prompt
3. Regenerate the content
4. Re-compare

Maximum 3 refinement iterations. After 3 iterations, deliver the best result with a deviation report.

### Step 6: Deliver with Quality Report

Provide the generated content along with a quality summary:

```markdown
## Voice Clone Quality Report

**Profile Used:** user-style-profile.json (N samples, M total words)

| Metric              | Target | Actual | Status |
| ------------------- | ------ | ------ | ------ |
| Avg sentence length | 18.3   | 17.8   | PASS   |
| Vocabulary overlap  | >= 40% | 45%    | PASS   |
| Tone formality      | 2.8    | 3.1    | PASS   |
| Paragraph length    | 3.2    | 3.5    | PASS   |
| Refinement rounds   | -      | 1      | -      |
```

## Iron Laws

1. **ALWAYS** load the style profile before generating any content -- generation without profile constraints produces generic output that does not match the target voice.
2. **NEVER** copy verbatim sentences or distinctive phrases from the original samples into generated content -- the goal is to replicate patterns, not plagiarize.
3. **ALWAYS** perform A/B comparison after generation -- unverified output may drift significantly from the target voice without detection.
4. **NEVER** exceed 3 refinement iterations -- diminishing returns beyond 3 rounds; deliver the best result with a deviation report instead.
5. **ALWAYS** include a quality report with the delivered content -- the consumer needs to know how closely the output matches the target voice.

## Anti-Patterns

| Anti-Pattern                                            | Why It Fails                                          | Correct Approach                                         |
| ------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Generating without loading the style profile            | No constraints; output is generic                     | Always load and validate profile before generation       |
| Hardcoding style constraints instead of reading profile | Constraints become stale; do not match actual samples | Read from `.claude/context/data/user-style-profile.json` |
| Copying memorable phrases from samples                  | Plagiarism detection; not authentic style transfer    | Extract patterns (word frequency, tone) not content      |
| Skipping the comparison step                            | No quality signal; style drift goes undetected        | Always run A/B comparison on all five metrics            |
| Infinite refinement loop                                | Diminishing returns; wastes tokens and time           | Cap at 3 iterations; deliver best result with report     |

## Integration with style-analyzer

This skill depends on `style-analyzer` for its input:

```
[User samples] --> style-analyzer --> user-style-profile.json --> voice-clone-generator --> [Generated content]
```

If `user-style-profile.json` does not exist when this skill is invoked, the agent should invoke `style-analyzer` first.

## Assigned Agents

This skill is used by:

- `voice-replicator-agent` -- Primary consumer for style-constrained content generation

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "voice clone generation style constraints"
```

Read `.claude/context/memory/learnings.md`

**After completing:**

- New generation pattern -> `.claude/context/memory/learnings.md`
- Quality issue found -> `.claude/context/memory/issues.md`
- Constraint tuning decision -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
