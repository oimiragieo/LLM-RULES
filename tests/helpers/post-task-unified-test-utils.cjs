'use strict';

const fs = require('fs');
const path = require('path');

function backupAndClearRecoveryQueue(queuePath) {
  if (fs.existsSync(queuePath)) {
    const backup = fs.readFileSync(queuePath, 'utf8');
    fs.unlinkSync(queuePath);
    return backup;
  }
  return null;
}

function restoreRecoveryQueue(queuePath, backup) {
  if (backup === null) {
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
    return;
  }

  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(queuePath, backup, 'utf8');
}

module.exports = {
  backupAndClearRecoveryQueue,
  restoreRecoveryQueue,
};
