// @ts-ignore TS80001: this file intentionally uses CommonJS ('use strict' + require/module.exports).
// All callers are .cjs files that use require(). Conversion to ESM is not safe.
'use strict';

const {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
} = require('./routing-table-intent-keywords-data.cjs');

module.exports = {
  INTENT_KEYWORDS,
  ALLOWED_INTENT_KEYWORD_OVERLAPS,
};
