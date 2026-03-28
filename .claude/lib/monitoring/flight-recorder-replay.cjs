'use strict';

const fs = require('fs');
const { getRecorderPath } = require('./flight-recorder.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function replay(filePath = getRecorderPath()) {
  const result = {
    entries: [],
    skipped: 0,
  };

  if (!fs.existsSync(filePath)) {
    return result;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const entry = safeParseJSON(line);
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof entry.event === 'string' &&
      typeof entry.timestamp === 'string'
    ) {
      result.entries.push(entry);
    } else {
      result.skipped += 1;
    }
  }
  return result;
}

module.exports = {
  replay,
};
