'use strict';

function runMemoryManagerCli({ args, manager, logger, projectRoot }) {
  const command = args[0];

  function getFlagValue(flagName) {
    const prefix = `--${flagName}=`;
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg && arg.startsWith(prefix)) return arg.slice(prefix.length);
      if (arg === `--${flagName}` && i + 1 < args.length) return args[i + 1];
    }
    return null;
  }

  switch (command) {
    case 'stats':
      console.log(JSON.stringify(manager.getMemoryStats(), null, 2));
      break;

    case 'load':
      console.log(manager.formatMemoryAsMarkdown());
      break;

    case 'record-gotcha':
      if (args[1]) {
        const area = getFlagValue('area');
        manager.recordGotcha({ text: args[1], area }, projectRoot);
        logger.info('Gotcha recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-gotcha "gotcha text" [--area main]');
      }
      break;

    case 'record-pattern':
      if (args[1]) {
        const area = getFlagValue('area');
        manager.recordPattern({ text: args[1], area }, projectRoot);
        logger.info('Pattern recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-pattern "pattern text" [--area main]');
      }
      break;

    case 'record-discovery':
      if (args[1] && args[2]) {
        manager.recordDiscovery(args[1], args[2], args[3] || 'general');
        logger.info('Discovery recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-discovery "path" "description" [category]');
      }
      break;

    case 'forget':
      if (args[1]) {
        const opts = {};
        for (const arg of args.slice(2)) {
          if (arg.startsWith('--threshold=')) {
            opts.threshold = Number(arg.split('=')[1]);
          } else if (arg.startsWith('--limit=')) {
            opts.limit = Number(arg.split('=')[1]);
          } else if (arg.startsWith('--area=')) {
            opts.area = arg.split('=')[1];
          }
        }
        manager
          .forgetMemoryByQuery(args[1], opts)
          .then(result => console.log(JSON.stringify(result, null, 2)))
          .catch(err => {
            logger.error('Forget failed', { error: err.message });
            process.exit(1);
          });
      } else {
        logger.error(
          'Usage: memory-manager.cjs forget "query" [--threshold=0.7] [--limit=20] [--area=main]'
        );
      }
      break;

    case 'delete-by-ids':
      if (args[1]) {
        const ids = String(args[1])
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const result = manager.deleteMemoryByIds(ids);
        console.log(JSON.stringify(result, null, 2));
      } else {
        logger.error('Usage: memory-manager.cjs delete-by-ids id1,id2,id3');
      }
      break;

    case 'save-session':
      logger.error(
        'save-session is deprecated and disabled. Sessions are recorded via memory-tiers on SessionEnd. ' +
          'Use memory-tiers or pnpm run memory:weekly for maintenance.'
      );
      process.exit(1);
      break;

    case 'health':
      console.log(JSON.stringify(manager.getMemoryHealth(), null, 2));
      break;

    case 'archive-learnings':
      const archiveResult = manager.checkAndArchiveLearnings();
      console.log(JSON.stringify(archiveResult, null, 2));
      break;

    case 'prune-codebase':
      const pruneResult = manager.pruneCodebaseMap();
      console.log(JSON.stringify(pruneResult, null, 2));
      break;

    case 'dashboard':
      // Invoke memory-dashboard for unified view
      try {
        const dashboard = require('./memory-dashboard.cjs');
        const dashboardData = dashboard.getDashboard();
        console.log(dashboard.formatDashboard(dashboardData));
      } catch (e) {
        logger.error('Dashboard not available', { error: e.message });
        console.log('Run: node .claude/lib/memory/memory-dashboard.cjs');
      }
      break;

    case 'maintenance':
      // Invoke memory-scheduler for maintenance
      try {
        const scheduler = require('./memory-scheduler.cjs');
        const maintenanceType = args[1] || 'daily';
        const result = scheduler.runMaintenance(maintenanceType);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        logger.error('Scheduler not available', { error: e.message });
        console.log('Run: node .claude/lib/memory/memory-scheduler.cjs');
        console.log('Or: pnpm run memory:weekly');
      }
      break;

    case 'find-entities':
      if (args[1]) {
        const limit = Number(getFlagValue('limit') || 10);
        manager
          .findEntities(args[1], { limit })
          .then(result => console.log(JSON.stringify(result, null, 2)))
          .catch(err => {
            logger.error('Find entities failed', { error: err.message });
            process.exit(1);
          });
      } else {
        logger.error('Usage: memory-manager.cjs find-entities "type" [--limit=10]');
      }
      break;

    case 'get-related':
      if (args[1]) {
        const depth = Number(getFlagValue('depth') || 1);
        manager
          .getRelated(args[1], { depth })
          .then(result => console.log(JSON.stringify(result, null, 2)))
          .catch(err => {
            logger.error('Get related failed', { error: err.message });
            process.exit(1);
          });
      } else {
        logger.error('Usage: memory-manager.cjs get-related "id" [--depth=1]');
      }
      break;

    default:
      console.log(`
Memory Manager - Session-Based Memory System

Commands:
  stats              Show memory statistics
  load               Load memory formatted as markdown
  health             Check memory health status
  dashboard          Show unified memory dashboard (Phase 4)
  maintenance [type] Run maintenance (daily/weekly, Phase 4)
  archive-learnings  Archive learnings.md if over 40KB
  prune-codebase     Prune codebase_map.json (TTL + size)
  record-gotcha      Record a gotcha/pitfall
  record-pattern     Record a reusable pattern
  record-discovery   Record a codebase discovery
  forget             Remove memory entries similar to a query
  delete-by-ids      Remove memory entries by id (gotchas/patterns)
  find-entities      Find entities by type (SQLite)
  get-related        Get related entities (SQLite)
  save-session       (deprecated, exits 1; use memory-tiers / SessionEnd)

Examples:
  node memory-manager.cjs stats
  node memory-manager.cjs load
  node memory-manager.cjs health
  node memory-manager.cjs archive-learnings
  node memory-manager.cjs prune-codebase
  node memory-manager.cjs record-gotcha "Always close DB connections in workers"
  node memory-manager.cjs record-pattern "Use async/await for all API calls"
  node memory-manager.cjs record-discovery "src/auth.ts" "JWT authentication handler"
  node memory-manager.cjs forget "avoid sync fs in hooks" --threshold=0.7 --area=main
  node memory-manager.cjs delete-by-ids id1,id2
  node memory-manager.cjs find-entities concept --limit=5
  node memory-manager.cjs get-related task-123 --depth=2
  echo '{"summary":"Fixed auth bug"}' | node memory-manager.cjs save-session   # deprecated, exits 1
`);
  }
}

module.exports = {
  runMemoryManagerCli,
};
