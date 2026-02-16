const mm = require('./.claude/lib/memory/memory-manager.cjs');
const root = process.argv[2];
(async () => {
  const start = Date.now();
  console.log('start pattern');
  await mm.recordPatternAsync({ text: 'x' }, root);
  console.log('pattern done', Date.now() - start);
  console.log('start gotcha');
  await mm.recordGotchaAsync({ text: 'y' }, root);
  console.log('gotcha done', Date.now() - start);
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
