---
name: content-analyzer
description: >-
  Use when analyzing published content (blog posts, social media, newsletters) for sentiment,
  structural quality, hook effectiveness, readability, topic classification, and engagement
  correlation. Invoke for daily post analysis, content audits, or engagement driver identification.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebSearch, WebFetch, Grep, Glob]
agents:
  - post-analyzer-agent
category: domain-specific
tags: [content, analytics, nlp, sentiment, readability, engagement, hooks, topics, seo]
verified: true
lastVerifiedAt: '2026-03-21'
best_practices:
  - Always fetch engagement metrics alongside content text
  - Classify hook type before analyzing engagement correlation
  - Store all analysis results in content-analytics.json for trend tracking
  - Compare current results against 7-day and 30-day baselines
  - Report confidence levels alongside every finding
error_handling: graceful
streaming: supported
---

<!-- Agent: developer | Task: #14 | Session: 2026-03-21 -->

# Content Analyzer

## Overview

Multi-dimensional content analysis skill that transforms published text into actionable
engagement intelligence. The analysis pipeline covers six dimensions: sentiment detection,
readability scoring, structural analysis, hook classification, topic identification, and
engagement correlation.

**Core principle:** Content quality is measurable. Every post has structural attributes
that correlate with engagement outcomes. This skill quantifies those attributes and
tracks them over time.

## When to Invoke

```javascript
Skill({ skill: 'content-analyzer' });
```

Invoke when:

- Analyzing a published blog post, article, or social media post
- Running a daily content performance audit
- Identifying what makes top-performing content succeed
- Building a content strategy based on historical performance data
- Diagnosing why a post underperformed expectations
- Comparing content attributes across a portfolio of published work

Do NOT invoke for:

- Pre-publication copyediting (use a writing or editing skill instead)
- SEO keyword research without existing content (use `seo-optimization`)
- Social media scheduling or publishing automation

## Six-Dimension Analysis Pipeline

### Dimension 1: Sentiment Analysis

Classify the emotional tone of the content across three axes:

**Polarity**: Positive / Negative / Neutral / Mixed
**Emotion**: Inspiration, Urgency, Curiosity, Empathy, Authority, Humor, Fear
**Intensity**: 1 (subtle) to 5 (intense)

**Scoring method:**

- Read the full text and identify the dominant emotional register
- Check for tonal shifts (e.g., problem-heavy opening -> optimistic conclusion)
- Score intensity based on word choice strength and punctuation patterns
- Flag mixed sentiment (common in "problem-solution" posts)

**Output:**

```json
{
  "sentiment": {
    "polarity": "positive",
    "dominantEmotion": "curiosity",
    "intensity": 3,
    "tonalShifts": ["negative->positive at paragraph 4"],
    "emotionBreakdown": {
      "curiosity": 0.45,
      "authority": 0.3,
      "urgency": 0.15,
      "empathy": 0.1
    }
  }
}
```

### Dimension 2: Readability Scoring

Quantify how easy the content is to read and understand:

| Metric                  | Formula / Method                                      | Target Range          |
| ----------------------- | ----------------------------------------------------- | --------------------- |
| Flesch-Kincaid Grade    | 0.39(words/sentences) + 11.8(syllables/words) - 15.59 | Grade 6-9 for general |
| Average Sentence Length | Total words / total sentences                         | 15-20 words           |
| Vocabulary Complexity   | % of words > 3 syllables                              | < 15%                 |
| Paragraph Length        | Average words per paragraph                           | 40-80 words           |
| Passive Voice %         | Passive constructions / total sentences               | < 10%                 |

**Output:**

```json
{
  "readability": {
    "fleschKincaidGrade": 7.2,
    "avgSentenceLength": 16.4,
    "vocabularyComplexity": 0.11,
    "avgParagraphLength": 58,
    "passiveVoicePercent": 0.06,
    "rating": "GOOD"
  }
}
```

### Dimension 3: Structural Analysis

Evaluate the architectural quality of the content:

**Elements to analyze:**

- **Opening hook**: First 1-2 sentences -- what technique is used?
- **Section structure**: Number of headings, heading hierarchy, section balance
- **Visual breaks**: Lists, blockquotes, images, code blocks, callouts
- **CTA presence**: Where CTAs appear, how strong they are, how many
- **Closing**: How the post ends (summary, CTA, question, cliffhanger)

**Hook Classification Taxonomy:**

| Hook Type      | Description                                    | Example Pattern                          |
| -------------- | ---------------------------------------------- | ---------------------------------------- |
| Question       | Opens with a direct question                   | "Have you ever wondered why...?"         |
| Statistic      | Leads with a surprising number                 | "78% of readers abandon posts after..."  |
| Story          | Begins with a narrative or anecdote            | "Last Tuesday, I discovered..."          |
| Contrarian     | Challenges conventional wisdom                 | "Everything you know about X is wrong."  |
| Pain Point     | Names a specific frustration                   | "Tired of writing posts nobody reads?"   |
| Bold Claim     | Makes a strong, specific assertion             | "This framework will triple your output" |
| How-To Promise | Promises a specific transformation             | "How to go from 0 to 10K followers"      |
| Current Event  | Ties to a trending topic or recent development | "With the latest Google update..."       |

**Output:**

```json
{
  "structure": {
    "hookType": "statistic",
    "hookText": "78% of content marketers...",
    "headingCount": 6,
    "headingHierarchy": "h1->h2->h3 (consistent)",
    "visualBreaks": { "lists": 4, "blockquotes": 1, "images": 2, "codeBlocks": 0 },
    "ctaCount": 2,
    "ctaPositions": ["mid-article", "closing"],
    "ctaStrength": "medium",
    "closingType": "question",
    "wordCount": 1847,
    "estimatedReadTime": "8 min"
  }
}
```

### Dimension 4: Topic Classification

Identify what the content is about and how it fits into topic clusters:

- **Primary topic**: The main subject (1 topic)
- **Secondary topics**: Related themes (2-3 topics)
- **Keyword density**: Top 10 keywords with frequency
- **Topic cluster**: Which content pillar this belongs to

**Output:**

```json
{
  "topics": {
    "primary": "content marketing strategy",
    "secondary": ["SEO optimization", "audience engagement"],
    "topKeywords": [
      { "keyword": "content", "count": 24, "density": 0.013 },
      { "keyword": "engagement", "count": 18, "density": 0.01 }
    ],
    "cluster": "content-strategy"
  }
}
```

### Dimension 5: Wording Pattern Analysis

Analyze the specific language choices that drive engagement:

- **Power words**: Words that trigger emotion (e.g., "discover", "secret", "proven")
- **Transition words**: Connectors that improve flow (e.g., "however", "specifically")
- **Jargon level**: Domain-specific terms as % of total vocabulary
- **Personal pronouns**: "you/your" frequency (reader-focus indicator)
- **Action verbs**: Active vs passive construction ratio

**Output:**

```json
{
  "wording": {
    "powerWordCount": 14,
    "powerWordDensity": 0.008,
    "transitionWordCount": 22,
    "jargonLevel": "low",
    "personalPronounDensity": 0.032,
    "actionVerbRatio": 0.78,
    "topPowerWords": ["discover", "proven", "essential", "transform"]
  }
}
```

### Dimension 6: Engagement Correlation

Map content attributes to engagement outcomes (requires engagement data):

**Correlation analysis:**

```
For each content attribute (hook type, length, sentiment, topic):
  1. Group posts by attribute value
  2. Calculate average engagement per group
  3. Rank groups by engagement
  4. Identify statistically significant differences
```

**Output:**

```json
{
  "engagement": {
    "metrics": {
      "views": 4521,
      "likes": 234,
      "comments": 47,
      "shares": 89,
      "bookmarks": 156,
      "engagementRate": 0.116
    },
    "correlations": {
      "hookType": { "statistic": 1.4, "question": 1.2, "story": 1.0, "howTo": 0.8 },
      "lengthBucket": { "1500-2000": 1.3, "1000-1500": 1.1, "2000+": 0.9, "<1000": 0.7 },
      "sentimentTone": { "curiosity": 1.5, "authority": 1.2, "urgency": 0.9 }
    },
    "confidenceLevel": "medium",
    "sampleSize": 23
  }
}
```

## CLI Integration

Run the analysis via the post-analyzer CLI tool:

```bash
# Analyze a single URL
node .claude/tools/cli/post-analyzer.cjs --url "https://example.com/post" --output json

# Analyze from local text file
node .claude/tools/cli/post-analyzer.cjs --file "./content.txt" --output json

# Generate daily report
node .claude/tools/cli/post-analyzer.cjs --url "https://example.com/post" --report daily
```

## Report Generation

After analysis, generate a daily report using the template:

```
.claude/templates/reports/daily-content-report.md
```

Output to:

```
.claude/context/reports/backend/daily-content-report-{YYYY-MM-DD}.md
```

## Historical Data Storage

All analysis results are appended to:

```
.claude/context/data/content-analytics.json
```

Schema:

```json
{
  "analyses": [
    {
      "id": "analysis-{timestamp}",
      "url": "https://example.com/post",
      "analyzedAt": "2026-03-21T10:00:00Z",
      "title": "Post Title",
      "sentiment": {},
      "readability": {},
      "structure": {},
      "topics": {},
      "wording": {},
      "engagement": {}
    }
  ],
  "trends": {
    "7day": {},
    "30day": {}
  },
  "lastUpdated": "2026-03-21T10:00:00Z"
}
```

## Iron Laws

1. **ALWAYS** analyze all six dimensions for every post -- partial analysis produces misleading conclusions.
2. **ALWAYS** store results in `content-analytics.json` after every analysis -- trend detection requires complete historical data.
3. **NEVER** report engagement correlations from fewer than 5 data points -- small samples produce spurious patterns.
4. **ALWAYS** classify the hook type before reporting engagement drivers -- the hook is the strongest single predictor of click-through performance.
5. **NEVER** scrape content without respecting rate limits and robots.txt -- getting blocked destroys the analysis pipeline.

## Anti-Patterns

| Anti-Pattern                               | Why It Fails                                          | Correct Approach                                                    |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Analyzing sentiment without readability    | Sentiment alone does not explain engagement           | Always run all six dimensions together                              |
| Reporting "best hook type" from 3 posts    | Statistically meaningless; random variation dominates | Require minimum 5 posts per category before drawing conclusions     |
| Ignoring historical baseline               | Cannot detect improvement or regression               | Always compare against 7-day and 30-day averages                    |
| Treating all engagement metrics equally    | Comments indicate depth; likes indicate breadth       | Weight metrics by type: shares > comments > likes > views for depth |
| Scraping entire site without URL filtering | Overwhelms analysis with non-article pages            | Target only published article URLs, skip navigation/utility pages   |

## Assigned Agents

This skill is used by:

- `post-analyzer-agent` -- Primary: daily content analysis and reporting
- `feedback-synthesizer` -- Supporting: when content feedback intersects with customer feedback
- `researcher` -- Supporting: when content research needs quantitative analysis

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "content analysis engagement hooks sentiment"
```

Read `.claude/context/memory/learnings.md`

Check for:

- Previous content analysis results and patterns
- Known engagement driver correlations
- Historical trend data in `content-analytics.json`

**After completing:**

- New content pattern discovered -> `.claude/context/memory/learnings.md`
- Analysis pipeline issue -> `.claude/context/memory/issues.md`
- Engagement correlation decision -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
