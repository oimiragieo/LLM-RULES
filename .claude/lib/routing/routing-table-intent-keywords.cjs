'use strict';

const {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
} = require('./routing-table-intent-keywords-data.cjs');

module.exports = {
  INTENT_KEYWORDS: {
    ...INTENT_KEYWORDS,
    'ptest-agent': [
      'ptest-agent',
      'ptest',
      'agent',
      'temporary',
      'test',
      'verify',
      'search',
      'memory',
      'protocols',
    ],
    'ptest-skill': [
      'ptest-skill',
      'ptest',
      'skill',
      'temporary',
      'test',
      'verifying',
      'protocol',
      'injection',
    ],
  },
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
};
