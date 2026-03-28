#!/usr/bin/env node
/* eslint-disable max-lines */
'use strict';

/**
 * Post Analyzer CLI
 *
 * Analyzes published content for sentiment, readability, structural quality,
 * hook effectiveness, topic classification, and engagement correlation.
 *
 * Usage:
 *   node .claude/tools/cli/post-analyzer.cjs --url <url> [options]
 *   node .claude/tools/cli/post-analyzer.cjs --file <path> [options]
 *   node .claude/tools/cli/post-analyzer.cjs --help
 *
 * Options:
 *   --url <url>         URL of the published post to analyze
 *   --file <path>       Local file path containing post content
 *   --output <format>   Output format: json (default) | markdown | summary
 *   --report <type>     Generate report: daily | weekly
 *   --store             Store results in content-analytics.json (default: true)
 *   --no-store          Skip storing results
 *   --help              Show this help message
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const ANALYTICS_PATH = path.join(PROJECT_ROOT, '.claude/context/data/content-analytics.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    file: null,
    output: 'json',
    report: null,
    store: true,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        opts.url = args[++i];
        break;
      case '--file':
        opts.file = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--report':
        opts.report = args[++i];
        break;
      case '--store':
        opts.store = true;
        break;
      case '--no-store':
        opts.store = false;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        break;
    }
  }
  return opts;
}

function showHelp() {
  const helpText = `
Post Analyzer CLI - Content performance analysis tool

Usage:
  node .claude/tools/cli/post-analyzer.cjs --url <url> [options]
  node .claude/tools/cli/post-analyzer.cjs --file <path> [options]

Options:
  --url <url>         URL of the published post to analyze
  --file <path>       Local file path containing post content
  --output <format>   Output format: json | markdown | summary (default: json)
  --report <type>     Generate report: daily | weekly
  --store             Store results in content-analytics.json (default)
  --no-store          Skip storing results
  --help, -h          Show this help message

Examples:
  node .claude/tools/cli/post-analyzer.cjs --url "https://blog.example.com/my-post"
  node .claude/tools/cli/post-analyzer.cjs --file ./draft.md --output markdown
  node .claude/tools/cli/post-analyzer.cjs --url "https://blog.example.com/my-post" --report daily
`.trim();
  console.log(helpText);
}

// ---------------------------------------------------------------------------
// Text Analysis Functions
// ---------------------------------------------------------------------------

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function analyzeSentiment(text) {
  const positiveWords = [
    'great',
    'excellent',
    'amazing',
    'wonderful',
    'fantastic',
    'love',
    'best',
    'brilliant',
    'outstanding',
    'perfect',
    'impressive',
    'remarkable',
    'superb',
    'powerful',
    'innovative',
    'exciting',
    'delightful',
    'exceptional',
    'discover',
    'proven',
    'transform',
    'essential',
    'breakthrough',
  ];
  const negativeWords = [
    'bad',
    'terrible',
    'awful',
    'horrible',
    'worst',
    'hate',
    'fail',
    'broken',
    'frustrating',
    'disappointing',
    'problem',
    'issue',
    'error',
    'mistake',
    'wrong',
    'difficult',
    'struggle',
    'pain',
    'risk',
    'danger',
  ];
  const curiosityWords = [
    'why',
    'how',
    'what',
    'wonder',
    'curious',
    'discover',
    'secret',
    'hidden',
    'surprising',
    'unexpected',
    'reveal',
    'mystery',
  ];
  const urgencyWords = [
    'now',
    'immediately',
    'urgent',
    'critical',
    'deadline',
    'hurry',
    'fast',
    'quick',
    'today',
    'limited',
    'before',
    'must',
  ];
  const authorityWords = [
    'research',
    'study',
    'data',
    'evidence',
    'proven',
    'expert',
    'according',
    'science',
    'statistics',
    'analysis',
    'results',
  ];

  const words = text.toLowerCase().split(/\s+/);
  let posCount = 0;
  let negCount = 0;
  const emotionCounts = { curiosity: 0, urgency: 0, authority: 0, empathy: 0 };

  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (positiveWords.includes(clean)) posCount++;
    if (negativeWords.includes(clean)) negCount++;
    if (curiosityWords.includes(clean)) emotionCounts.curiosity++;
    if (urgencyWords.includes(clean)) emotionCounts.urgency++;
    if (authorityWords.includes(clean)) emotionCounts.authority++;
  }

  const _totalSentimentWords = posCount + negCount || 1;
  let polarity = 'neutral';
  if (posCount > negCount * 1.5) polarity = 'positive';
  else if (negCount > posCount * 1.5) polarity = 'negative';
  else if (posCount > 0 && negCount > 0) polarity = 'mixed';

  const totalEmotionWords = Object.values(emotionCounts).reduce((a, b) => a + b, 0) || 1;
  const emotionBreakdown = {};
  for (const [k, v] of Object.entries(emotionCounts)) {
    emotionBreakdown[k] = Math.round((v / totalEmotionWords) * 100) / 100;
  }

  const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0];
  const intensity = Math.min(
    5,
    Math.max(1, Math.round((posCount + negCount) / (words.length / 100)))
  );

  return {
    polarity,
    dominantEmotion,
    intensity,
    emotionBreakdown,
    positiveWordCount: posCount,
    negativeWordCount: negCount,
  };
}

function analyzeReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  const totalWords = words.length;
  const totalSentences = sentences.length || 1;
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const avgSentenceLength = Math.round((totalWords / totalSentences) * 10) / 10;
  const avgSyllablesPerWord = totalSyllables / totalWords;
  const fleschKincaidGrade =
    Math.round((0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59) * 10) / 10;

  const complexWords = words.filter(w => countSyllables(w) > 3).length;
  const vocabularyComplexity = Math.round((complexWords / totalWords) * 100) / 100;

  const avgParagraphLength = Math.round(totalWords / (paragraphs.length || 1));

  // Rough passive voice detection
  const passivePatterns = /\b(was|were|been|being|is|are|am)\s+\w+ed\b/gi;
  const passiveMatches = text.match(passivePatterns) || [];
  const passiveVoicePercent = Math.round((passiveMatches.length / totalSentences) * 100) / 100;

  let rating = 'GOOD';
  if (fleschKincaidGrade > 12) rating = 'DIFFICULT';
  else if (fleschKincaidGrade > 9) rating = 'MODERATE';
  else if (fleschKincaidGrade < 5) rating = 'VERY_EASY';

  return {
    fleschKincaidGrade,
    avgSentenceLength,
    vocabularyComplexity,
    avgParagraphLength,
    passiveVoicePercent,
    totalWords,
    totalSentences,
    totalParagraphs: paragraphs.length,
    rating,
  };
}

function analyzeStructure(text, title) {
  const lines = text.split('\n');
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const firstParagraph = paragraphs[0] || '';

  // Hook classification
  let hookType = 'statement';
  const hookText = firstParagraph.split(/[.!?]/)[0] || '';
  if (/\?/.test(hookText)) hookType = 'question';
  else if (/\d+%|\d+ (out of|in|percent)/.test(hookText)) hookType = 'statistic';
  else if (/^(once|last|when i|i was|i remember|there was)/i.test(hookText.trim()))
    hookType = 'story';
  else if (/wrong|myth|lie|stop|never|actually|contrary/i.test(hookText)) hookType = 'contrarian';
  else if (/tired|frustrated|sick|struggling|annoyed/i.test(hookText)) hookType = 'pain_point';
  else if (/will|guarantee|triple|double|10x|transform/i.test(hookText)) hookType = 'bold_claim';
  else if (/how to|step|guide|way to|method/i.test(hookText)) hookType = 'how_to_promise';

  // Heading analysis
  const headings = lines.filter(l => /^#{1,6}\s/.test(l.trim()));
  const h1Count = headings.filter(h => /^#\s/.test(h.trim())).length;
  const h2Count = headings.filter(h => /^##\s/.test(h.trim())).length;
  const h3Count = headings.filter(h => /^###\s/.test(h.trim())).length;

  // Visual breaks
  const lists = (text.match(/^[\s]*[-*+]\s/gm) || []).length;
  const numberedLists = (text.match(/^[\s]*\d+[.)]\s/gm) || []).length;
  const blockquotes = (text.match(/^>\s/gm) || []).length;
  const codeBlocks = (text.match(/```/g) || []).length / 2;
  const imageRefs = (text.match(/!\[/g) || []).length;

  // CTA detection
  const ctaPatterns =
    /\b(click|subscribe|sign up|download|join|try|get started|learn more|read more|buy|register)\b/gi;
  const ctaMatches = text.match(ctaPatterns) || [];

  // Closing type
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  let closingType = 'statement';
  if (/\?$/.test(lastParagraph.trim())) closingType = 'question';
  else if (ctaPatterns.test(lastParagraph)) closingType = 'cta';
  else if (/summary|conclusion|recap|in short/i.test(lastParagraph)) closingType = 'summary';

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const estimatedReadTime = Math.max(1, Math.round(wordCount / 230)) + ' min';

  return {
    hookType,
    hookText: hookText.trim().substring(0, 200),
    headingCount: headings.length,
    headingBreakdown: { h1: h1Count, h2: h2Count, h3: h3Count },
    visualBreaks: {
      bulletLists: lists,
      numberedLists,
      blockquotes,
      codeBlocks: Math.floor(codeBlocks),
      images: imageRefs,
    },
    ctaCount: ctaMatches.length,
    closingType,
    wordCount,
    estimatedReadTime,
    title: title || '(untitled)',
  };
}

function analyzeTopics(text) {
  // Simple keyword frequency analysis
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
    'my',
    'your',
    'his',
    'our',
    'their',
    'not',
    'no',
    'so',
    'if',
    'as',
    'then',
    'than',
    'more',
    'most',
    'very',
    'just',
    'also',
    'about',
    'up',
    'out',
    'all',
    'when',
    'what',
    'which',
    'who',
    'how',
    'each',
    'every',
    'both',
    'few',
    'many',
    'some',
    'any',
    'other',
    'into',
    'over',
    'after',
    'before',
    'between',
    'through',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const totalWords = text.split(/\s+/).length;
  const topKeywords = sorted.map(([keyword, count]) => ({
    keyword,
    count,
    density: Math.round((count / totalWords) * 1000) / 1000,
  }));

  return {
    topKeywords: topKeywords.slice(0, 10),
    primaryTopic: topKeywords[0] ? topKeywords[0].keyword : 'unknown',
    secondaryTopics: topKeywords.slice(1, 4).map(k => k.keyword),
  };
}

function analyzeWording(text) {
  const powerWords = [
    'discover',
    'secret',
    'proven',
    'transform',
    'essential',
    'breakthrough',
    'exclusive',
    'guaranteed',
    'instant',
    'powerful',
    'ultimate',
    'remarkable',
    'effortless',
    'massive',
    'stunning',
    'revolutionary',
    'critical',
    'urgent',
  ];
  const transitionWords = [
    'however',
    'therefore',
    'furthermore',
    'moreover',
    'specifically',
    'additionally',
    'consequently',
    'nevertheless',
    'meanwhile',
    'alternatively',
    'similarly',
    'accordingly',
    'subsequently',
    'notably',
    'importantly',
  ];

  const words = text.toLowerCase().split(/\s+/);
  const totalWords = words.length;

  let powerWordCount = 0;
  let transitionWordCount = 0;
  let personalPronounCount = 0;
  const foundPowerWords = [];

  const personalPronouns = new Set(['you', 'your', 'yours', 'yourself']);

  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (powerWords.includes(clean)) {
      powerWordCount++;
      if (!foundPowerWords.includes(clean)) foundPowerWords.push(clean);
    }
    if (transitionWords.includes(clean)) transitionWordCount++;
    if (personalPronouns.has(clean)) personalPronounCount++;
  }

  return {
    powerWordCount,
    powerWordDensity: Math.round((powerWordCount / totalWords) * 1000) / 1000,
    transitionWordCount,
    personalPronounDensity: Math.round((personalPronounCount / totalWords) * 1000) / 1000,
    topPowerWords: foundPowerWords.slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// Main Analysis Pipeline
// ---------------------------------------------------------------------------

function analyzeContent(text, metadata) {
  const title = metadata.title || '';
  const url = metadata.url || '';

  const sentiment = analyzeSentiment(text);
  const readability = analyzeReadability(text);
  const structure = analyzeStructure(text, title);
  const topics = analyzeTopics(text);
  const wording = analyzeWording(text);

  const result = {
    id: `analysis-${Date.now()}`,
    url,
    title,
    analyzedAt: new Date().toISOString(),
    sentiment,
    readability,
    structure,
    topics,
    wording,
    engagement: metadata.engagement || null,
  };

  return result;
}

function loadAnalyticsStore() {
  try {
    if (fs.existsSync(ANALYTICS_PATH)) {
      const raw = fs.readFileSync(ANALYTICS_PATH, 'utf-8');
      const parsed = safeParseJSON(raw, null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fall through to default
  }
  return { analyses: [], trends: { '7day': {}, '30day': {} }, lastUpdated: null };
}

function saveAnalyticsStore(store) {
  const dir = path.dirname(ANALYTICS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  store.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function formatMarkdown(result) {
  return `# Content Analysis: ${result.title || result.url}

**Analyzed:** ${result.analyzedAt}
**URL:** ${result.url || 'N/A'}
**Word Count:** ${result.readability.totalWords}
**Read Time:** ${result.structure.estimatedReadTime}

## Sentiment
- **Polarity:** ${result.sentiment.polarity}
- **Dominant Emotion:** ${result.sentiment.dominantEmotion}
- **Intensity:** ${result.sentiment.intensity}/5

## Readability
- **Flesch-Kincaid Grade:** ${result.readability.fleschKincaidGrade}
- **Rating:** ${result.readability.rating}
- **Avg Sentence Length:** ${result.readability.avgSentenceLength} words
- **Vocabulary Complexity:** ${Math.round(result.readability.vocabularyComplexity * 100)}%

## Structure
- **Hook Type:** ${result.structure.hookType}
- **Hook:** "${result.structure.hookText}"
- **Headings:** ${result.structure.headingCount}
- **CTAs:** ${result.structure.ctaCount}
- **Closing:** ${result.structure.closingType}

## Topics
- **Primary:** ${result.topics.primaryTopic}
- **Secondary:** ${result.topics.secondaryTopics.join(', ')}

## Top Keywords
${result.topics.topKeywords
  .slice(0, 5)
  .map(k => `- ${k.keyword} (${k.count}x, density: ${k.density})`)
  .join('\n')}

## Wording Patterns
- **Power Words:** ${result.wording.powerWordCount} (${result.wording.topPowerWords.join(', ')})
- **Transition Words:** ${result.wording.transitionWordCount}
- **Reader Focus (you/your):** ${Math.round(result.wording.personalPronounDensity * 1000) / 10}%
`;
}

function formatSummary(result) {
  return [
    `Title: ${result.title || '(untitled)'}`,
    `URL: ${result.url || 'N/A'}`,
    `Words: ${result.readability.totalWords} | Read time: ${result.structure.estimatedReadTime}`,
    `Sentiment: ${result.sentiment.polarity} (${result.sentiment.dominantEmotion}, intensity ${result.sentiment.intensity}/5)`,
    `Readability: Grade ${result.readability.fleschKincaidGrade} (${result.readability.rating})`,
    `Hook: ${result.structure.hookType} | CTAs: ${result.structure.ctaCount}`,
    `Primary topic: ${result.topics.primaryTopic}`,
    `Power words: ${result.wording.powerWordCount} | Transitions: ${result.wording.transitionWordCount}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  let text = '';
  const metadata = { url: opts.url || '', title: '', engagement: null };

  if (opts.file) {
    const filePath = path.resolve(opts.file);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    text = fs.readFileSync(filePath, 'utf-8');
    metadata.title = path.basename(filePath, path.extname(filePath));
  } else if (opts.url) {
    // When called from an agent context, the agent will have already fetched
    // the content via WebFetch. This CLI accepts piped stdin as well.
    console.error(
      'Note: URL fetching requires agent context (WebFetch). ' +
        'Pipe content via stdin or use --file for local analysis.'
    );
    console.error('Example: curl -s "URL" | node .claude/tools/cli/post-analyzer.cjs --url "URL"');

    // Read from stdin if available
    if (!process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      text = Buffer.concat(chunks).toString('utf-8');
    }

    if (!text) {
      console.error('Error: No content provided. Use --file or pipe content via stdin.');
      process.exit(1);
    }
  } else {
    // Try reading from stdin
    if (!process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      text = Buffer.concat(chunks).toString('utf-8');
    }

    if (!text) {
      showHelp();
      process.exit(1);
    }
  }

  // Extract title from markdown H1 if present
  const h1Match = text.match(/^#\s+(.+)$/m);
  if (h1Match && !metadata.title) {
    metadata.title = h1Match[1].trim();
  }

  const result = analyzeContent(text, metadata);

  // Store results
  if (opts.store) {
    try {
      const store = loadAnalyticsStore();
      store.analyses.push(result);

      // Keep last 500 analyses
      if (store.analyses.length > 500) {
        store.analyses = store.analyses.slice(-500);
      }

      saveAnalyticsStore(store);
    } catch (err) {
      console.error(`Warning: Could not store results: ${err.message}`);
    }
  }

  // Output
  switch (opts.output) {
    case 'markdown':
      console.log(formatMarkdown(result));
      break;
    case 'summary':
      console.log(formatSummary(result));
      break;
    case 'json':
    default:
      console.log(JSON.stringify(result, null, 2));
      break;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  analyzeContent,
  analyzeSentiment,
  analyzeReadability,
  analyzeStructure,
  analyzeTopics,
  analyzeWording,
};
