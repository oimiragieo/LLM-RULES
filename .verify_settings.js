const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./.claude/settings.json', 'utf8'));

// Check JSON validity
try {
  JSON.stringify(config, null, 2);
  console.log('✓ JSON structure is valid');
} catch (e) {
  console.log('✗ JSON structure is invalid:', e.message);
}

// Check for duplicates
const hooks = config.hooks || {};
const duplicates = [];
const seenHooks = new Set();

for (const [eventType, matchers] of Object.entries(hooks)) {
  for (const matcher of matchers) {
    for (const hook of matcher.hooks || []) {
      const cmd = hook.command || '';
      if (seenHooks.has(cmd)) {
        duplicates.push({ event: eventType, cmd });
      }
      seenHooks.add(cmd);
    }
  }
}

console.log(`✓ Total registered hooks: ${seenHooks.size}`);
console.log(`${duplicates.length === 0 ? '✓' : '✗'} Duplicate hooks: ${duplicates.length}`);

if (duplicates.length > 0) {
  console.log('\nDuplicate hooks found:');
  duplicates.forEach(d => console.log(`  ${d.event}: ${d.cmd}`));
}

// Check event types validity
const validEvents = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionEnd',
  'Stop',
];
const foundEvents = Object.keys(hooks);
const invalidEvents = foundEvents.filter(e => !validEvents.includes(e));

console.log(
  `\n✓ Valid hook events: ${foundEvents.filter(e => validEvents.includes(e)).join(', ')}`
);
if (invalidEvents.length > 0) {
  console.log(`✗ Invalid events found: ${invalidEvents.join(', ')}`);
}
