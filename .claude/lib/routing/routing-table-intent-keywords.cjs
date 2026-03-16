// @ts-nocheck — TS80001: this file intentionally uses CommonJS ('use strict' + require/module.exports).
// All callers are .cjs files that use require(). Conversion to ESM is not safe.
'use strict';

const {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
} = require('./routing-table-intent-keywords-data.cjs');

module.exports = {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
  'adversarial-review': [
    'adversarial-review',
    'adversarial',
    'review',
    'force',
    'code',
    'stance',
    'that',
    'eliminates',
    'confirmation',
    'bias',
  ],
  'commit-security-scan': [
    'commit-security-scan',
    'commit',
    'security',
    'scan',
    'analyze',
    'code',
    'changes',
    'commits',
    'diffs',
    'vulnerabilities',
  ],
  'codebase-cleaner': [
    'codebase-cleaner',
    'codebase',
    'cleaner',
    'safe',
    'cleanup',
    'delete',
    'slop',
    'consolidate',
    'duplicates',
    'update',
  ],
  'user-flow-validator': [
    'user-flow-validator',
    'user',
    'flow',
    'validator',
    'test',
    'journey',
    'assertions',
    'against',
    'real',
    'surfaces',
  ],
};
