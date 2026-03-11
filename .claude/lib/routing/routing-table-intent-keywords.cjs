'use strict';

const {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
} = require('./routing-table-intent-keywords-data.cjs');

module.exports = {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
  'windows-terminal': [
    'windows-terminal',
    'windows',
    'terminal',
    'spawn',
    'manage',
    'from',
    'node',
    'with',
    'execution',
    'alias',
  ],
};
