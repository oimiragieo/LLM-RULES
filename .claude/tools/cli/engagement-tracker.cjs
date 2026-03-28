#!/usr/bin/env node
'use strict';

/**
 * Engagement Tracker — Competitor social media engagement analysis
 *
 * Usage:
 *   node .claude/tools/cli/engagement-tracker.cjs --handle <handle> --platform <platform> [options]
 *
 * Options:
 *   --handle       Competitor handle (e.g., @example or example-company)
 *   --platform     Platform: twitter, linkedin, instagram
 *   --mode         Mode: fetch | baseline | detect | alert (default: detect)
 *   --limit        Max posts to analyze (default: 20)
 *   --help         Show this help message
 *
 * Exit codes:
 *   0  Success (no anomaly or alert sent)
 *   1  Error (invalid input, fetch failure)
 *   2  Anomaly detected (engagement exceeds threshold)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// --- Constants ---

const BASELINES_PATH = path.resolve(__dirname, '../../context/data/competitor-baselines.json');
const CONFIG_PATH = path.resolve(__dirname, '../../context/data/competitor-config.json');
const DEFAULT_BASELINE_WINDOW_DAYS = 30;
const DEFAULT_MULTIPLIER = 2.0;
const DEFAULT_LIMIT = 20;

// --- Argument Parsing ---

function parseArgs(argv) {
  const args = {
    handle: null,
    platform: null,
    mode: 'detect',
    limit: DEFAULT_LIMIT,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--handle':
        args.handle = argv[++i] || null;
        break;
      case '--platform':
        args.platform = argv[++i] || null;
        break;
      case '--mode':
        args.mode = argv[++i] || 'detect';
        break;
      case '--limit':
        args.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Engagement Tracker — Competitor social media engagement analysis

Usage:
  node .claude/tools/cli/engagement-tracker.cjs --handle <handle> --platform <platform> [options]

Options:
  --handle       Competitor handle (e.g., @example or example-company)
  --platform     Platform: twitter, linkedin, instagram
  --mode         Mode: fetch | baseline | detect | alert (default: detect)
  --limit        Max posts to analyze (default: 20)
  --help, -h     Show this help message

Modes:
  fetch       Fetch recent posts and display engagement metrics
  baseline    Calculate and store 30-day rolling average baseline
  detect      Fetch posts, compare to baseline, flag anomalies
  alert       Detect anomalies and return alert payload (JSON)

Examples:
  node .claude/tools/cli/engagement-tracker.cjs --handle @competitor --platform twitter --mode fetch
  node .claude/tools/cli/engagement-tracker.cjs --handle example-co --platform linkedin --mode baseline
  node .claude/tools/cli/engagement-tracker.cjs --handle @rival --platform twitter --mode alert
`);
}

// --- Baselines Store ---

function loadBaselines() {
  try {
    if (fs.existsSync(BASELINES_PATH)) {
      const parsed = safeParseJSON(fs.readFileSync(BASELINES_PATH, 'utf8'), {});
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted file; start fresh
  }
  return {};
}

function saveBaselines(baselines) {
  const dir = path.dirname(BASELINES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BASELINES_PATH, JSON.stringify(baselines, null, 2), 'utf8');
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return safeParseJSON(fs.readFileSync(CONFIG_PATH, 'utf8'), null);
    }
  } catch {
    // Missing or corrupted config
  }
  return null;
}

// --- Mock Data Fetching ---
// In a real implementation, these would call platform APIs or Exa search.
// For now, generate deterministic sample data based on handle and platform.

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

function generateSamplePosts(handle, platform, limit) {
  const seed = hashCode(`${handle}-${platform}`);
  const posts = [];

  for (let i = 0; i < limit; i++) {
    const postSeed = seed + i * 7919;
    const likes = (postSeed % 500) + 10;
    const shares = Math.floor(likes * (0.1 + (postSeed % 30) / 100));
    const comments = Math.floor(likes * (0.05 + (postSeed % 20) / 100));
    const impressions = likes * (8 + (postSeed % 12));

    const daysAgo = i;
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    posts.push({
      id: `post-${handle}-${platform}-${i}`,
      handle,
      platform,
      date: date.toISOString().split('T')[0],
      text: `Sample post ${i + 1} from ${handle} on ${platform}`,
      metrics: {
        likes,
        shares,
        comments,
        impressions,
      },
      engagement_rate:
        impressions > 0
          ? parseFloat((((likes + shares + comments) / impressions) * 100).toFixed(2))
          : 0,
    });
  }

  return posts;
}

// --- Core Functions ---

function calculateEngagementMetrics(posts) {
  if (!posts || posts.length === 0) {
    return {
      avg_likes: 0,
      avg_shares: 0,
      avg_comments: 0,
      avg_engagement_rate: 0,
      total_posts: 0,
    };
  }

  const totals = posts.reduce(
    (acc, p) => {
      acc.likes += p.metrics.likes;
      acc.shares += p.metrics.shares;
      acc.comments += p.metrics.comments;
      acc.engagement_rate += p.engagement_rate;
      return acc;
    },
    { likes: 0, shares: 0, comments: 0, engagement_rate: 0 }
  );

  const n = posts.length;
  return {
    avg_likes: parseFloat((totals.likes / n).toFixed(1)),
    avg_shares: parseFloat((totals.shares / n).toFixed(1)),
    avg_comments: parseFloat((totals.comments / n).toFixed(1)),
    avg_engagement_rate: parseFloat((totals.engagement_rate / n).toFixed(2)),
    total_posts: n,
  };
}

function getBaselineKey(handle, platform) {
  return `${platform}:${handle.replace(/^@/, '')}`;
}

function updateBaseline(handle, platform, posts) {
  const baselines = loadBaselines();
  const key = getBaselineKey(handle, platform);
  const metrics = calculateEngagementMetrics(posts);

  baselines[key] = {
    handle,
    platform,
    updated_at: new Date().toISOString(),
    window_days: DEFAULT_BASELINE_WINDOW_DAYS,
    sample_size: posts.length,
    metrics,
  };

  saveBaselines(baselines);
  return baselines[key];
}

function getBaseline(handle, platform) {
  const baselines = loadBaselines();
  const key = getBaselineKey(handle, platform);
  return baselines[key] || null;
}

function detectAnomalies(handle, platform, posts, multiplier) {
  const baseline = getBaseline(handle, platform);
  if (!baseline) {
    return {
      anomaly: false,
      reason: 'no_baseline',
      message: `No baseline found for ${handle} on ${platform}. Run --mode baseline first.`,
    };
  }

  const anomalies = [];

  for (const post of posts) {
    const likeRatio =
      baseline.metrics.avg_likes > 0 ? post.metrics.likes / baseline.metrics.avg_likes : 0;
    const shareRatio =
      baseline.metrics.avg_shares > 0 ? post.metrics.shares / baseline.metrics.avg_shares : 0;
    const commentRatio =
      baseline.metrics.avg_comments > 0 ? post.metrics.comments / baseline.metrics.avg_comments : 0;
    const engagementRatio =
      baseline.metrics.avg_engagement_rate > 0
        ? post.engagement_rate / baseline.metrics.avg_engagement_rate
        : 0;

    const maxRatio = Math.max(likeRatio, shareRatio, commentRatio, engagementRatio);

    if (maxRatio >= multiplier) {
      anomalies.push({
        post_id: post.id,
        date: post.date,
        text: post.text.substring(0, 120),
        metrics: post.metrics,
        engagement_rate: post.engagement_rate,
        max_ratio: parseFloat(maxRatio.toFixed(2)),
        exceeded_metric:
          maxRatio === likeRatio
            ? 'likes'
            : maxRatio === shareRatio
              ? 'shares'
              : maxRatio === commentRatio
                ? 'comments'
                : 'engagement_rate',
      });
    }
  }

  if (anomalies.length === 0) {
    return {
      anomaly: false,
      reason: 'within_normal',
      message: `All posts from ${handle} on ${platform} are within ${multiplier}x baseline.`,
      baseline_summary: baseline.metrics,
    };
  }

  return {
    anomaly: true,
    reason: 'threshold_exceeded',
    handle,
    platform,
    threshold_multiplier: multiplier,
    anomaly_count: anomalies.length,
    total_posts_checked: posts.length,
    baseline_summary: baseline.metrics,
    anomalous_posts: anomalies,
  };
}

function buildAlertPayload(anomalyResult) {
  if (!anomalyResult.anomaly) {
    return null;
  }

  const topPost = anomalyResult.anomalous_posts.reduce(
    (best, p) => (p.max_ratio > best.max_ratio ? p : best),
    anomalyResult.anomalous_posts[0]
  );

  return {
    alert_type: 'competitor_viral_post',
    severity: topPost.max_ratio >= 5.0 ? 'critical' : topPost.max_ratio >= 3.0 ? 'high' : 'medium',
    timestamp: new Date().toISOString(),
    competitor: {
      handle: anomalyResult.handle,
      platform: anomalyResult.platform,
    },
    summary: `${anomalyResult.anomaly_count} post(s) from ${anomalyResult.handle} on ${anomalyResult.platform} exceeded ${anomalyResult.threshold_multiplier}x baseline engagement`,
    top_post: {
      id: topPost.post_id,
      date: topPost.date,
      text: topPost.text,
      exceeded_metric: topPost.exceeded_metric,
      ratio: topPost.max_ratio,
      metrics: topPost.metrics,
      engagement_rate: topPost.engagement_rate,
    },
    baseline: anomalyResult.baseline_summary,
    notification_channels: ['twilio', 'pushover', 'slack'],
  };
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.handle) {
    console.error('Error: --handle is required. Use --help for usage.');
    process.exit(1);
  }

  if (!args.platform) {
    console.error('Error: --platform is required. Use --help for usage.');
    process.exit(1);
  }

  const validPlatforms = ['twitter', 'linkedin', 'instagram'];
  if (!validPlatforms.includes(args.platform)) {
    console.error(`Error: --platform must be one of: ${validPlatforms.join(', ')}`);
    process.exit(1);
  }

  const validModes = ['fetch', 'baseline', 'detect', 'alert'];
  if (!validModes.includes(args.mode)) {
    console.error(`Error: --mode must be one of: ${validModes.join(', ')}`);
    process.exit(1);
  }

  // Load config for threshold
  const config = loadConfig();
  const multiplier = config?.alert_thresholds?.multiplier || DEFAULT_MULTIPLIER;

  // Fetch posts (sample data for now; replace with Exa/API calls in production)
  const posts = generateSamplePosts(args.handle, args.platform, args.limit);

  switch (args.mode) {
    case 'fetch': {
      const metrics = calculateEngagementMetrics(posts);
      console.log(
        JSON.stringify(
          {
            handle: args.handle,
            platform: args.platform,
            posts_fetched: posts.length,
            aggregate_metrics: metrics,
            recent_posts: posts.slice(0, 5).map(p => ({
              date: p.date,
              text: p.text.substring(0, 80),
              likes: p.metrics.likes,
              shares: p.metrics.shares,
              comments: p.metrics.comments,
              engagement_rate: p.engagement_rate,
            })),
          },
          null,
          2
        )
      );
      break;
    }

    case 'baseline': {
      const baseline = updateBaseline(args.handle, args.platform, posts);
      console.log(
        JSON.stringify(
          {
            action: 'baseline_updated',
            key: getBaselineKey(args.handle, args.platform),
            baseline,
          },
          null,
          2
        )
      );
      break;
    }

    case 'detect': {
      const result = detectAnomalies(args.handle, args.platform, posts, multiplier);
      console.log(JSON.stringify(result, null, 2));
      if (result.anomaly) {
        process.exit(2);
      }
      break;
    }

    case 'alert': {
      const anomalyResult = detectAnomalies(args.handle, args.platform, posts, multiplier);
      const payload = buildAlertPayload(anomalyResult);
      if (payload) {
        console.log(JSON.stringify(payload, null, 2));
        process.exit(2);
      } else {
        console.log(JSON.stringify({ alert: false, message: anomalyResult.message }, null, 2));
      }
      break;
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  calculateEngagementMetrics,
  detectAnomalies,
  buildAlertPayload,
  updateBaseline,
  getBaseline,
  loadConfig,
};
