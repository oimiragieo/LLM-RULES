#!/usr/bin/env node
'use strict';

/**
 * Style Profiler — Analyze text samples and produce a structured style profile.
 *
 * Usage:
 *   node .claude/tools/cli/style-profiler.cjs <file-or-directory>
 *   node .claude/tools/cli/style-profiler.cjs --help
 *
 * Accepts a text file or directory of text files as input.
 * Outputs a JSON style profile to .claude/context/data/user-style-profile.json
 *
 * Metrics produced:
 *   - Average sentence length
 *   - Top 50 vocabulary (non-stopwords)
 *   - Type-token ratio (vocabulary richness)
 *   - Tone score (formal=1.0 to casual=5.0)
 *   - Formatting patterns (paragraph length, heading depth, list frequency, punctuation)
 */

const fs = require('fs');
const path = require('path');

// ── Stop words (common English) ────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
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
  'shall',
  'should',
  'may',
  'might',
  'must',
  'can',
  'could',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'not',
  'no',
  'nor',
  'if',
  'then',
  'else',
  'so',
  'as',
  'just',
  'also',
  'than',
  'very',
  'too',
  'more',
  'most',
  'all',
  'each',
  'every',
  'both',
  'few',
  'some',
  'any',
  'other',
  'about',
  'up',
  'out',
  'into',
  'over',
  'after',
  'before',
  'between',
  'through',
  'during',
  'without',
  'again',
  'further',
  'once',
  'here',
  'there',
  'own',
  'same',
  'such',
  'only',
  'because',
  'until',
  'while',
  'however',
  'still',
  'even',
  'well',
  'back',
  'much',
  'many',
  'get',
  'got',
  'make',
  'made',
  'like',
  'just',
  'now',
  'new',
  'one',
  'two',
  'first',
  'also',
  'way',
  'use',
  'used',
  'using',
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Read all .txt, .md, and common text files from a path.
 * If path is a file, read that file. If directory, read all text files within.
 */
function readSamples(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);
  const textExtensions = new Set(['.txt', '.md', '.markdown', '.rst', '.adoc', '.html', '.htm']);
  const samples = [];

  if (stat.isFile()) {
    samples.push(fs.readFileSync(resolved, 'utf-8'));
  } else if (stat.isDirectory()) {
    const entries = fs.readdirSync(resolved);
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      const fullPath = path.join(resolved, entry);
      if (fs.statSync(fullPath).isFile() && (textExtensions.has(ext) || ext === '')) {
        samples.push(fs.readFileSync(fullPath, 'utf-8'));
      }
    }
  }

  return samples;
}

/**
 * Split text into sentences using a simple heuristic.
 */
function splitSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const raw = text.replace(/\n{2,}/g, '. ').replace(/\n/g, ' ');
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
  return sentences;
}

/**
 * Tokenize text into lowercase words.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'-\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

/**
 * Compute word frequency excluding stop words.
 */
function computeVocabulary(allWords) {
  const freq = {};
  for (const word of allWords) {
    if (STOP_WORDS.has(word)) continue;
    freq[word] = (freq[word] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  const topWords = sorted.slice(0, 50).map(([word]) => word);
  const uniqueWords = new Set(allWords);
  const typeTokenRatio =
    allWords.length > 0 ? Math.round((uniqueWords.size / allWords.length) * 1000) / 1000 : 0;

  return { topWords, typeTokenRatio, totalWords: allWords.length, uniqueWords: uniqueWords.size };
}

/**
 * Find signature phrases (bigrams appearing 3+ times).
 */
function findSignaturePhrases(allWords) {
  const bigramFreq = {};
  for (let i = 0; i < allWords.length - 1; i++) {
    const w1 = allWords[i];
    const w2 = allWords[i + 1];
    if (STOP_WORDS.has(w1) && STOP_WORDS.has(w2)) continue;
    const bigram = `${w1} ${w2}`;
    bigramFreq[bigram] = (bigramFreq[bigram] || 0) + 1;
  }

  return Object.entries(bigramFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

/**
 * Analyze sentence structure metrics.
 */
function analyzeSentenceStructure(sentences) {
  if (sentences.length === 0) {
    return {
      avgLength: 0,
      lengthVariance: 0,
      shortSentenceRatio: 0,
      longSentenceRatio: 0,
      questionFrequency: 0,
      avgCommasPerSentence: 0,
    };
  }

  const lengths = sentences.map(s => tokenize(s).length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const avg = total / lengths.length;

  const variance =
    lengths.length > 1
      ? Math.sqrt(lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / (lengths.length - 1))
      : 0;

  const shortCount = lengths.filter(l => l < 8).length;
  const longCount = lengths.filter(l => l > 25).length;
  const questionCount = sentences.filter(s => s.trim().endsWith('?')).length;

  const commas = sentences.map(s => (s.match(/,/g) || []).length);
  const avgCommas = commas.reduce((a, b) => a + b, 0) / sentences.length;

  return {
    avgLength: Math.round(avg * 10) / 10,
    lengthVariance: Math.round(variance * 10) / 10,
    shortSentenceRatio: Math.round((shortCount / sentences.length) * 100) / 100,
    longSentenceRatio: Math.round((longCount / sentences.length) * 100) / 100,
    questionFrequency: Math.round((questionCount / sentences.length) * 100) / 100,
    avgCommasPerSentence: Math.round(avgCommas * 10) / 10,
  };
}

/**
 * Score tone dimensions.
 */
function analyzeTone(text, sentences) {
  const lower = text.toLowerCase();
  const wordCount = tokenize(text).length || 1;

  // Formality: contractions and informal markers push toward casual (5.0)
  const contractions = (
    lower.match(
      /\b(i'm|don't|can't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|didn't|doesn't|couldn't|wouldn't|shouldn't|it's|that's|there's|here's|what's|who's|let's|we're|they're|you're|he's|she's)\b/g
    ) || []
  ).length;
  const contractionRate = contractions / (sentences.length || 1);
  const formality = Math.max(1, Math.min(5, 3.0 + contractionRate * 4));

  // Directness: hedge words push toward hedged (1.0)
  const hedgeWords = (
    lower.match(
      /\b(maybe|perhaps|somewhat|possibly|might|could|seems|appears|relatively|generally|usually|often|sometimes|approximately|roughly)\b/g
    ) || []
  ).length;
  const hedgeRate = hedgeWords / wordCount;
  const directness = Math.max(1, Math.min(5, 4.0 - hedgeRate * 80));

  // Emotion: exclamation marks and emotional adjectives
  const exclamations = (text.match(/!/g) || []).length;
  const emotionRate = exclamations / (sentences.length || 1);
  const emotion = Math.max(1, Math.min(5, 2.0 + emotionRate * 6));

  // Humor: parenthetical asides, informal interjections
  const asides = (text.match(/\(.*?\)/g) || []).length;
  const interjections = (
    lower.match(/\b(haha|lol|heh|well|oh|ah|honestly|literally|basically)\b/g) || []
  ).length;
  const humorRate = (asides + interjections) / (sentences.length || 1);
  const humor = Math.max(1, Math.min(5, 1.5 + humorRate * 8));

  // Authority: imperative sentences and certainty language
  const certainty = (
    lower.match(
      /\b(always|never|must|definitely|certainly|absolutely|clearly|obviously|undoubtedly)\b/g
    ) || []
  ).length;
  const certaintyRate = certainty / wordCount;
  const authority = Math.max(1, Math.min(5, 2.5 + certaintyRate * 60));

  return {
    formality: Math.round(formality * 10) / 10,
    directness: Math.round(directness * 10) / 10,
    emotion: Math.round(emotion * 10) / 10,
    humor: Math.round(humor * 10) / 10,
    authority: Math.round(authority * 10) / 10,
  };
}

/**
 * Analyze formatting preferences.
 */
function analyzeFormatting(text) {
  const lines = text.split('\n');
  const wordCount = tokenize(text).length || 1;
  const per1000 = 1000 / wordCount;

  // Paragraph length (split by double newline)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const paraLengths = paragraphs.map(p => splitSentences(p).length);
  const avgParagraphLength =
    paraLengths.length > 0
      ? Math.round((paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length) * 10) / 10
      : 0;

  // Heading depth
  const headings = lines.filter(l => /^#{1,6}\s/.test(l));
  let headingDepth = 0;
  for (const h of headings) {
    const level = (h.match(/^(#+)/)?.[1] || '').length;
    if (level > headingDepth) headingDepth = level;
  }

  // List frequency
  const listItems = lines.filter(l => /^\s*[-*+]\s|^\s*\d+[.)]\s/.test(l));
  const listFrequencyPer1000 = Math.round(listItems.length * per1000 * 10) / 10;

  // Code block frequency
  const codeBlocks = (text.match(/```/g) || []).length / 2; // pairs
  const codeBlockFrequencyPer1000 = Math.round(codeBlocks * per1000 * 10) / 10;

  // Emphasis frequency
  const boldMarkers = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  const italicMarkers = (text.match(/(?<!\*)\*(?!\*)[^*]+\*(?!\*)/g) || []).length;
  const emphasisFrequencyPer1000 = Math.round((boldMarkers + italicMarkers) * per1000 * 10) / 10;

  // Punctuation patterns
  const emDashes = (text.match(/[—–]/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const ellipses = (text.match(/\.{3}|…/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const sentenceCount = splitSentences(text).length || 1;

  return {
    avgParagraphLength,
    headingDepth,
    listFrequencyPer1000,
    codeBlockFrequencyPer1000,
    emphasisFrequencyPer1000,
    punctuation: {
      emDashFrequency: Math.round((emDashes / sentenceCount) * 1000) / 1000,
      semicolonFrequency: Math.round((semicolons / sentenceCount) * 1000) / 1000,
      ellipsisFrequency: Math.round((ellipses / sentenceCount) * 1000) / 1000,
      exclamationFrequency: Math.round((exclamations / sentenceCount) * 1000) / 1000,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Style Profiler — Analyze text samples and produce a structured style profile.

Usage:
  node .claude/tools/cli/style-profiler.cjs <file-or-directory>

Options:
  --help, -h    Show this help message
  --output, -o  Custom output path (default: .claude/context/data/user-style-profile.json)

Examples:
  node .claude/tools/cli/style-profiler.cjs ./samples/blog-posts/
  node .claude/tools/cli/style-profiler.cjs ./my-writing.md
  node .claude/tools/cli/style-profiler.cjs ./samples/ -o ./my-profile.json
`);
    process.exit(0);
  }

  // Parse arguments
  let inputPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      inputPath = args[i];
    }
  }

  if (!inputPath) {
    console.error('Error: No input file or directory specified.');
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Path does not exist: ${resolvedInput}`);
    process.exit(1);
  }

  // Set default output path
  const projectRoot = findProjectRoot();
  if (!outputPath) {
    outputPath = path.join(projectRoot, '.claude', 'context', 'data', 'user-style-profile.json');
  } else {
    outputPath = path.resolve(outputPath);
  }

  // Read samples
  console.log(`Reading samples from: ${resolvedInput}`);
  const samples = readSamples(resolvedInput);

  if (samples.length === 0) {
    console.error('Error: No text files found at the specified path.');
    process.exit(1);
  }

  console.log(`Found ${samples.length} sample(s).`);

  if (samples.length < 3) {
    console.warn(
      `Warning: Only ${samples.length} sample(s) found. Recommend 3+ samples for reliable metrics.`
    );
  }

  // Combine all text for analysis
  const allText = samples.join('\n\n');
  const allWords = tokenize(allText);
  const allSentences = splitSentences(allText);

  console.log(`Total words: ${allWords.length}`);
  console.log(`Total sentences: ${allSentences.length}`);

  // Compute all metrics
  const vocabulary = computeVocabulary(allWords);
  const signaturePhrases = findSignaturePhrases(allWords);
  const sentenceStructure = analyzeSentenceStructure(allSentences);
  const tone = analyzeTone(allText, allSentences);
  const formatting = analyzeFormatting(allText);

  // Build profile
  const profile = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    sampleCount: samples.length,
    totalWords: allWords.length,
    vocabulary: {
      topWords: vocabulary.topWords,
      typeTokenRatio: vocabulary.typeTokenRatio,
      signaturePhrases,
    },
    sentenceStructure,
    tone,
    formatting,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write profile
  fs.writeFileSync(outputPath, JSON.stringify(profile, null, 2), 'utf-8');
  console.log(`\nStyle profile written to: ${outputPath}`);

  // Print summary
  console.log('\n--- Style Profile Summary ---');
  console.log(`Samples analyzed: ${profile.sampleCount}`);
  console.log(`Total words: ${profile.totalWords}`);
  console.log(`Vocabulary richness (TTR): ${vocabulary.typeTokenRatio}`);
  console.log(`Avg sentence length: ${sentenceStructure.avgLength} words`);
  console.log(
    `Tone — Formality: ${tone.formality}/5, Directness: ${tone.directness}/5, Authority: ${tone.authority}/5`
  );
  console.log(`Top 10 vocabulary: ${vocabulary.topWords.slice(0, 10).join(', ')}`);

  if (signaturePhrases.length > 0) {
    console.log(`Signature phrases: ${signaturePhrases.slice(0, 5).join(', ')}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  readSamples,
  splitSentences,
  tokenize,
  computeVocabulary,
  findSignaturePhrases,
  analyzeSentenceStructure,
  analyzeTone,
  analyzeFormatting,
};
