const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const file = path.join(ROOT, '.claude/context/runtime/tasks.json');

try {
  const content = fs.readFileSync(file, 'utf8');
  const taskObj = JSON.parse(content);
  const taskList = Array.isArray(taskObj.tasks) ? taskObj.tasks : [];
  const active = taskList.filter(t => t.status === 'in_progress' || t.status === 'pending');

  if (active.length === 0) {
    process.stdout.write('HEARTBEAT_OK (Pipeline drained — ready for /clear if desired)\n');
  } else {
    process.stdout.write('HEARTBEAT_OK (pipeline active)\n');
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    process.stdout.write('HEARTBEAT_OK (Pipeline drained — ready for /clear if desired)\n');
  } else {
    process.stdout.write('HEARTBEAT_OK (state unreadable - ' + e.message + ')\n');
  }
}
