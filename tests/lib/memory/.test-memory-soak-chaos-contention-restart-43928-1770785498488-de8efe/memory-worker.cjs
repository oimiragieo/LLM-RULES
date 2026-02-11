const manager = require('../../../../.claude/lib/memory/memory-manager.cjs');
const root = process.argv[2];
const worker = process.argv[3];
const count = Number(process.argv[4] || '50');
(async () => {
  for (let i = 0; i < count; i++) {
    await manager.recordPatternAsync({ text: `worker-${worker}-pattern-${i}` }, root);
    await manager.recordGotchaAsync({ text: `worker-${worker}-gotcha-${i}` }, root);
  }
  process.stdout.write('ok');
})().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
