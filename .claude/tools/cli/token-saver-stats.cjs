#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const TELEMETRY_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'context-compressor',
  'token-saver-telemetry.jsonl'
);

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
  return num.toString();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { detailed: false };
  for (const arg of args) {
    if (arg === '--detailed' || arg === '-d') options.detailed = true;
  }
  return options;
}

function main() {
  const options = parseArgs();

  if (!fs.existsSync(TELEMETRY_FILE)) {
    console.log('\x1b[36m============== TOKEN SAVER TRACKER ==============\x1b[0m');
    console.log('\x1b[33mNo telemetry data found yet.\x1b[0m');
    console.log('Use `Skill({ skill: "context-compressor" })` to start saving tokens.');
    console.log('\x1b[36m=================================================\x1b[0m');
    return;
  }

  let totalQueries = 0;
  let totalOriginal = 0;
  let totalCompressed = 0;
  let totalSaved = 0;
  let totalUsd = 0;

  const logs = [];

  const content = fs.readFileSync(TELEMETRY_FILE, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const data = safeParseJSON(line, null, null, null);
      totalQueries++;
      totalOriginal += Math.max(0, data.originalTokens || 0);
      totalCompressed += Math.max(0, data.compressedTokens || 0);
      totalSaved += Math.max(0, data.savedTokens || 0);
      totalUsd += Math.max(0, data.estimatedSavingsUsd || 0);
      logs.push(data);
    } catch (_e) {
      // Ignore corrupted lines
    }
  }

  const reduction = totalOriginal > 0 ? (1 - totalCompressed / totalOriginal) * 100 : 0;
  const avgCompressionRatio = Math.max(0, reduction);

  const uniqueModels = Array.from(new Set(logs.map(l => l.model).filter(Boolean)));
  let costLabel = '(based on varying models)';
  if (
    uniqueModels.length === 0 ||
    (uniqueModels.length === 1 && uniqueModels[0].includes('sonnet'))
  ) {
    costLabel = '(based on $3.00/1M input)';
  } else if (uniqueModels.length === 1 && uniqueModels[0].includes('opus')) {
    costLabel = '(based on $5.00/1M input)';
  } else if (uniqueModels.length === 1 && uniqueModels[0].includes('haiku')) {
    costLabel = '(based on $1.00/1M input)';
  }

  console.log('\x1b[36m=================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m         TOKEN SAVER CONTEXT COMPRESSION         \x1b[0m');
  console.log('\x1b[36m=================================================\x1b[0m');
  console.log('');
  console.log(`\x1b[1mTotal Compression Runs\x1b[0m : \x1b[33m${totalQueries}\x1b[0m requests`);
  console.log(
    `\x1b[1mTotal Tokens Searched\x1b[0m  : \x1b[36m${formatNumber(totalOriginal)}\x1b[0m tokens`
  );
  console.log(
    `\x1b[1mTotal Tokens Output\x1b[0m    : \x1b[36m${formatNumber(totalCompressed)}\x1b[0m tokens`
  );
  console.log(
    `\x1b[1mAverage Reduction\x1b[0m      : \x1b[35m${avgCompressionRatio.toFixed(1)}%\x1b[0m`
  );
  console.log('');
  console.log('\x1b[36m-------------------------------------------------\x1b[0m');
  console.log(
    `\x1b[1m\x1b[32mTOTAL TOKENS SAVED\x1b[0m     : \x1b[1m\x1b[32m${formatNumber(totalSaved)}\x1b[0m tokens`
  );
  console.log(
    `\x1b[1m\x1b[32mTOTAL MONEY SAVED\x1b[0m      : \x1b[1m\x1b[32m$${totalUsd.toFixed(4)}\x1b[0m \x1b[90m${costLabel}\x1b[0m`
  );
  console.log('\x1b[36m-------------------------------------------------\x1b[0m');

  if (options.detailed && logs.length > 0) {
    console.log('\n\x1b[1mRecent Conversions (Last 5):\x1b[0m');
    const recent = logs.slice(-5).reverse();
    for (const log of recent) {
      const date = new Date(log.timestamp).toLocaleTimeString();
      const saved = formatNumber(log.savedTokens);
      const money = `$${(log.estimatedSavingsUsd || 0).toFixed(4)}`;
      console.log(
        `\x1b[90m[${date}]\x1b[0m "${log.query.substring(0, 30)}${log.query.length > 30 ? '...' : ''}" \x1b[32mSaved ${saved} tokens (${money})\x1b[0m`
      );
    }
  }
}

main();
