#!/usr/bin/env node

/**
 * Cost Report CLI
 *
 * Generate cost reports from LLM usage logs.
 *
 * Usage:
 *   node cost-report.js --today
 *   node cost-report.js --days 7
 *   node cost-report.js --by-model
 *   node cost-report.js --session sess-abc123
 *   node cost-report.js --verify
 */

const fs = require('fs');
const _path = require('path');

const COST_LOG = '.claude/context/metrics/cost-log.jsonl';
const COST_SUMMARY = '.claude/context/metrics/cost-summary.json';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        opts[key] = nextArg;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }

  return opts;
}

/**
 * Load and parse cost log
 */
function loadLog() {
  if (!fs.existsSync(COST_LOG)) {
    console.error(`Error: Cost log not found at ${COST_LOG}`);
    process.exit(1);
  }

  const content = fs.readFileSync(COST_LOG, 'utf-8').trim();
  if (!content) {
    console.log('Cost log is empty');
    return [];
  }

  const entries = [];
  for (const line of content.split('\n')) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        console.warn(`Warning: Failed to parse line: ${e.message}`);
      }
    }
  }

  return entries;
}

/**
 * Load summary file
 */
function loadSummary() {
  if (!fs.existsSync(COST_SUMMARY)) {
    return { allTime: { cost: 0, tokens: 0, sessions: 0 }, lastSession: null };
  }

  try {
    return JSON.parse(fs.readFileSync(COST_SUMMARY, 'utf-8'));
  } catch {
    return { allTime: { cost: 0, tokens: 0, sessions: 0 }, lastSession: null };
  }
}

/**
 * Verify log integrity
 */
function verifyIntegrity(entries) {
  if (entries.length === 0) {
    console.log('Log is empty - no integrity check needed');
    return true;
  }

  let previousHash = '0';
  let valid = true;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check previous hash matches
    if (entry._prevHash !== previousHash) {
      console.error(`ERROR: Hash chain broken at entry ${i + 1}`);
      console.error(`  Expected prevHash: ${previousHash}`);
      console.error(`  Got prevHash: ${entry._prevHash}`);
      valid = false;
      break;
    }

    previousHash = entry._hash;
  }

  if (valid) {
    console.log('✓ Log integrity verified - all hashes are valid');
  }

  return valid;
}

/**
 * Generate today's report
 */
function reportToday(entries) {
  const today = new Date().toISOString().split('T')[0];

  const todayEntries = entries.filter(e => e.timestamp.startsWith(today));

  console.log(`\nCost Report (Today: ${today})`);
  console.log('='.repeat(50));

  if (todayEntries.length === 0) {
    console.log('No entries found for today');
    return;
  }

  const summary = aggregateEntries(todayEntries);
  displaySummary(summary);
}

/**
 * Generate report for last N days
 */
function reportDays(entries, days) {
  const daysMs = days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - daysMs);

  const filteredEntries = entries.filter(e => new Date(e.timestamp) >= cutoff);

  console.log(`\nCost Report (Last ${days} Days)`);
  console.log('='.repeat(50));

  if (filteredEntries.length === 0) {
    console.log('No entries found');
    return;
  }

  const summary = aggregateEntries(filteredEntries);
  displaySummary(summary);
}

/**
 * Generate report by model
 */
function reportByModel(entries) {
  console.log('\nCost Report (By Model)');
  console.log('='.repeat(50));

  const byModel = {};
  for (const entry of entries) {
    if (!byModel[entry.tier]) {
      byModel[entry.tier] = { calls: 0, tokens: 0, cost: 0 };
    }
    byModel[entry.tier].calls++;
    byModel[entry.tier].tokens += entry.inputTokens + entry.outputTokens;
    byModel[entry.tier].cost += parseFloat(entry.cost);
  }

  // Sort by cost descending
  const sorted = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);

  console.log('\n| Tier   | Calls | Tokens | Cost     | % of Total |');
  console.log('|--------|-------|--------|----------|------------|');

  const totalCost = sorted.reduce((sum, [, data]) => sum + data.cost, 0);

  for (const [tier, data] of sorted) {
    const percentage = ((data.cost / totalCost) * 100).toFixed(1);
    console.log(
      `| ${tier.padEnd(6)} | ${String(data.calls).padStart(5)} | ${String(data.tokens).padStart(6)} | $${data.cost.toFixed(4).padStart(7)} | ${percentage.padStart(8)}% |`
    );
  }

  console.log('|--------|-------|--------|----------|------------|');
  console.log(
    `| TOTAL  | ${String(entries.length).padStart(5)} | ${String(entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)).padStart(6)} | $${totalCost.toFixed(4).padStart(7)} | ${(100).toFixed(1).padStart(8)}% |`
  );
}

/**
 * Generate report for specific session
 */
function reportSession(entries, sessionId) {
  const sessionEntries = entries.filter(e => e.sessionId === sessionId);

  console.log(`\nCost Report (Session: ${sessionId})`);
  console.log('='.repeat(50));

  if (sessionEntries.length === 0) {
    console.log('Session not found');
    return;
  }

  const summary = aggregateEntries(sessionEntries);
  displaySummary(summary);
}

/**
 * Aggregate entries into summary
 */
function aggregateEntries(entries) {
  const summary = {
    byTier: {
      haiku: { calls: 0, tokens: 0, cost: 0 },
      sonnet: { calls: 0, tokens: 0, cost: 0 },
      opus: { calls: 0, tokens: 0, cost: 0 },
    },
    total: { calls: 0, tokens: 0, cost: 0 },
  };

  for (const entry of entries) {
    const tier = entry.tier;
    const tokens = entry.inputTokens + entry.outputTokens;
    const cost = parseFloat(entry.cost);

    summary.byTier[tier].calls++;
    summary.byTier[tier].tokens += tokens;
    summary.byTier[tier].cost += cost;

    summary.total.calls++;
    summary.total.tokens += tokens;
    summary.total.cost += cost;
  }

  return summary;
}

/**
 * Display summary
 */
function displaySummary(summary) {
  console.log('\n| Tier   | Calls | Tokens  | Cost     |');
  console.log('|--------|-------|---------|----------|');

  const { byTier, total } = summary;

  for (const [tier, data] of Object.entries(byTier)) {
    if (data.calls > 0) {
      console.log(
        `| ${tier.padEnd(6)} | ${String(data.calls).padStart(5)} | ${String(data.tokens).padStart(7)} | $${data.cost.toFixed(4).padStart(7)} |`
      );
    }
  }

  console.log('|--------|-------|---------|----------|');
  console.log(
    `| TOTAL  | ${String(total.calls).padStart(5)} | ${String(total.tokens).padStart(7)} | $${total.cost.toFixed(4).padStart(7)} |`
  );
}

/**
 * Main
 */
function main() {
  const opts = parseArgs();

  // Check for verify command first
  if (opts.verify) {
    const entries = loadLog();
    const valid = verifyIntegrity(entries);
    process.exit(valid ? 0 : 1);
  }

  const entries = loadLog();

  if (opts.today) {
    reportToday(entries);
  } else if (opts.days) {
    reportDays(entries, parseInt(opts.days, 10));
  } else if (opts['by-model']) {
    reportByModel(entries);
  } else if (opts.session) {
    reportSession(entries, opts.session);
  } else {
    // Default: all-time summary
    console.log('\nAll-Time Cost Summary');
    console.log('='.repeat(50));

    if (entries.length === 0) {
      console.log('No cost entries found');
      return;
    }

    const summary = loadSummary();
    console.log(`\nTotal Sessions: ${summary.allTime.sessions}`);
    console.log(`Total Cost: $${summary.allTime.cost.toFixed(2)}`);
    console.log(`Total Tokens: ${summary.allTime.tokens.toLocaleString()}`);

    if (summary.lastSession) {
      console.log(`\nLast Session: ${summary.lastSession.timestamp}`);
      console.log(`  Cost: $${summary.lastSession.cost.toFixed(4)}`);
      console.log(`  Tokens: ${summary.lastSession.tokens.toLocaleString()}`);
    }
  }
}

main();
