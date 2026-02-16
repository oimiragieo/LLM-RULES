'use strict';

const fs = require('fs');
const { getRecorderPath } = require('./flight-recorder.cjs');

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
    try {
      result.entries.push(JSON.parse(line));
    } catch (_err) {
      result.skipped += 1;
    }
  }
  return result;
}

module.exports = {
  replay,
};
