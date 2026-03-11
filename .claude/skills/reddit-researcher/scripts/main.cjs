#!/usr/bin/env node
'use strict';

/**
 * reddit-researcher main CLI script
 * Fetches public Reddit data via the unauthenticated JSON API.
 *
 * Usage:
 *   node main.cjs --action search --query "machine learning" --limit 10
 *   node main.cjs --action subreddit --subreddit programming --limit 25
 *   node main.cjs --action post --subreddit programming --postId abc123
 *
 * Flags:
 *   --action    search | subreddit | post (required)
 *   --subreddit subreddit name (required for subreddit/post actions)
 *   --query     search query string (required for search action)
 *   --postId    post ID (required for post action)
 *   --limit     number of results 1-25 (default: 10)
 *
 * Output: JSON { success, action, results: [...] } or { success: false, error }
 */

const https = require('https');

// ---------------------------------------------------------------------------
// SSRF allowlist — validated before every fetch
// ---------------------------------------------------------------------------
const ALLOWED_REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com']);
const USER_AGENT = 'agent-studio-reddit-researcher/1.0';

/**
 * Validate a URL against the SSRF allowlist.
 * Uses new URL() for normalization — never regex.
 * @param {string} href
 * @returns {string} validated href
 * @throws {Error} if URL is invalid or not in allowlist
 */
function validateRedditUrl(href) {
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error(`Invalid URL: ${href}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }
  if (!ALLOWED_REDDIT_HOSTS.has(parsed.hostname)) {
    throw new Error(`Hostname not in allowlist: ${parsed.hostname}`);
  }
  return parsed.href;
}

/**
 * Fetch JSON from a validated Reddit URL.
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchRedditJson(url) {
  const validated = validateRedditUrl(url);
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    };
    https
      .get(validated, options, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Extract normalized post objects from a Reddit listing response.
 * @param {object} listing
 * @returns {Array<object>}
 */
function extractPosts(listing) {
  if (!listing || !listing.data || !Array.isArray(listing.data.children)) {
    return [];
  }
  return listing.data.children
    .filter(child => child.kind === 't3' && child.data)
    .map(child => ({
      title: child.data.title || '',
      url: child.data.url || '',
      subreddit: child.data.subreddit || '',
      score: child.data.score || 0,
      numComments: child.data.num_comments || 0,
      created: child.data.created_utc || 0,
      selftext: (child.data.selftext || '').slice(0, 500),
    }));
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const [key, ...rest] = arg.slice(2).split('=');
    args[key] = rest.length > 0 ? rest.join('=') : process.argv[i + 1] || '';
  }
}

const action = args.action;
const subreddit = args.subreddit || '';
const query = args.query || '';
const postId = args.postId || '';
const limit = Math.min(25, Math.max(1, parseInt(args.limit, 10) || 10));

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function actionSearch() {
  if (!query) throw new Error('--query is required for search action');
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : 'https://www.reddit.com/search.json';
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (subreddit) params.set('restrict_sr', '1');
  const url = `${base}?${params.toString()}`;
  const data = await fetchRedditJson(url);
  return extractPosts(data);
}

async function actionSubreddit() {
  if (!subreddit) throw new Error('--subreddit is required for subreddit action');
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}`;
  const data = await fetchRedditJson(url);
  return extractPosts(data);
}

async function actionPost() {
  if (!subreddit) throw new Error('--subreddit is required for post action');
  if (!postId) throw new Error('--postId is required for post action');
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}.json`;
  const data = await fetchRedditJson(url);
  // Comment endpoint returns [postListing, commentListing]
  const posts = Array.isArray(data) ? extractPosts(data[0]) : [];
  return posts;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  if (!action) {
    process.stdout.write(
      JSON.stringify({
        success: false,
        error: '--action is required. Use: search | subreddit | post',
      })
    );
    process.exit(1);
  }

  try {
    let results;
    switch (action) {
      case 'search':
        results = await actionSearch();
        break;
      case 'subreddit':
        results = await actionSubreddit();
        break;
      case 'post':
        results = await actionPost();
        break;
      default:
        throw new Error(`Unknown action: ${action}. Use: search | subreddit | post`);
    }

    process.stdout.write(JSON.stringify({ success: true, action, results }));
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ success: false, action, error: err.message }));
    process.exit(1);
  }
}

main();
