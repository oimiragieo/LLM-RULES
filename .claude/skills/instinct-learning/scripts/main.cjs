'use strict';

/**
 * instinct-learning — CLI entry point
 * Usage: node main.cjs --action <record|update|query|list> [options]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INSTINCTS_FILE = path.resolve(__dirname, '../../../../context/memory/instincts.jsonl');

const CONFIDENCE_MIN = 0.3;
const CONFIDENCE_MAX = 0.9;
const PROMOTION_THRESHOLD = 0.8;

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function loadInstincts() {
  if (!fs.existsSync(INSTINCTS_FILE)) return [];
  return fs
    .readFileSync(INSTINCTS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function saveInstincts(records) {
  const dir = path.dirname(INSTINCTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INSTINCTS_FILE, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function recordInstinct({ text, confidence, tags, source }) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    process.stderr.write('[instinct-learning] Error: --text is required\n');
    process.exit(1);
  }
  if (text.length > 200) {
    process.stderr.write(
      '[instinct-learning] Error: --text must be ≤200 chars (atomic instinct)\n'
    );
    process.exit(1);
  }
  const conf = parseFloat(confidence);
  if (isNaN(conf) || conf < CONFIDENCE_MIN || conf > CONFIDENCE_MAX) {
    process.stderr.write(
      `[instinct-learning] Error: --confidence must be ${CONFIDENCE_MIN}–${CONFIDENCE_MAX}\n`
    );
    process.exit(1);
  }

  const records = loadInstincts();
  const now = new Date().toISOString();
  const id = `inst-${shortId()}`;
  const promoted = conf >= PROMOTION_THRESHOLD;

  const record = {
    id,
    timestamp: now,
    scope: promoted ? 'global' : 'project',
    project: promoted ? null : process.env.PROJECT_NAME || 'agent-studio',
    text: text.trim(),
    confidence: conf,
    source_context: (source || '').trim(),
    tags: tags
      ? tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      : [],
    promoted_at: promoted ? now : null,
    promoted_confidence: promoted ? conf : null,
  };

  records.push(record);
  saveInstincts(records);

  console.log(JSON.stringify({ ok: true, id, scope: record.scope, promoted }));
}

function updateInstinct({ id, confidence }) {
  if (!id) {
    process.stderr.write('[instinct-learning] Error: --id is required for update\n');
    process.exit(1);
  }
  const conf = parseFloat(confidence);
  if (isNaN(conf) || conf < CONFIDENCE_MIN || conf > CONFIDENCE_MAX) {
    process.stderr.write(
      `[instinct-learning] Error: --confidence must be ${CONFIDENCE_MIN}–${CONFIDENCE_MAX}\n`
    );
    process.exit(1);
  }

  const records = loadInstincts();
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) {
    process.stderr.write(`[instinct-learning] Error: instinct ${id} not found\n`);
    process.exit(1);
  }

  const rec = records[idx];
  const wasGlobal = rec.scope === 'global';
  const nowPromoted = conf >= PROMOTION_THRESHOLD;
  const justPromoted = !wasGlobal && nowPromoted;

  rec.confidence = conf;
  if (justPromoted) {
    rec.scope = 'global';
    rec.project = null;
    rec.promoted_at = new Date().toISOString();
    rec.promoted_confidence = conf;
  }

  saveInstincts(records);
  console.log(
    JSON.stringify({ ok: true, id, confidence: conf, promoted: justPromoted || wasGlobal })
  );
}

function queryInstincts({ tags, minConfidence, scope, limit }) {
  const records = loadInstincts();
  const minConf = parseFloat(minConfidence) || CONFIDENCE_MIN;
  const filterTags = tags
    ? tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
    : [];
  const lim = parseInt(limit) || 20;

  let results = records.filter(r => {
    if (r.confidence < minConf) return false;
    if (scope && r.scope !== scope) return false;
    if (filterTags.length > 0) {
      return filterTags.some(ft => r.tags.includes(ft));
    }
    return true;
  });

  results.sort((a, b) => b.confidence - a.confidence);
  results = results.slice(0, lim);

  console.log(JSON.stringify(results, null, 2));
}

function listInstincts({ scope, limit }) {
  queryInstincts({ scope, minConfidence: CONFIDENCE_MIN, limit: limit || 20 });
}

// ---- CLI parsing ----
const args = process.argv.slice(2);
const get = flag => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const action = get('--action');

switch (action) {
  case 'record':
    recordInstinct({
      text: get('--text'),
      confidence: get('--confidence'),
      tags: get('--tags'),
      source: get('--source'),
    });
    break;
  case 'update':
    updateInstinct({ id: get('--id'), confidence: get('--confidence') });
    break;
  case 'query':
    queryInstincts({
      tags: get('--tags'),
      minConfidence: get('--min-confidence'),
      scope: get('--scope'),
      limit: get('--limit'),
    });
    break;
  case 'list':
    listInstincts({ scope: get('--scope'), limit: get('--limit') });
    break;
  default:
    process.stderr.write(
      'Usage: node main.cjs --action <record|update|query|list> [--text "..."] [--confidence 0.6] [--tags "tag1,tag2"] [--source "..."] [--id "inst-xxxx"] [--scope project|global] [--min-confidence 0.5] [--limit 20]\n'
    );
    process.exit(1);
}
