'use strict';

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../utils/logger.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const logger = createLogger('memory-manager');

function createReportingOps({ PROJECT_ROOT, CONFIG, getMemoryDir }) {
  function getMemoryHealth(projectRoot = PROJECT_ROOT) {
    const memoryDir = getMemoryDir(projectRoot);
    const result = {
      status: 'healthy',
      warnings: [],
      learningsSizeKB: 0,
      decisionsSizeKB: 0,
      codebaseMapEntries: 0,
      sessionsCount: 0,
    };

    const learningsPath = path.join(memoryDir, 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      const stats = fs.statSync(learningsPath);
      result.learningsSizeKB = Math.round(stats.size / 1024);

      if (result.learningsSizeKB > CONFIG.LEARNINGS_WARN_THRESHOLD_KB) {
        result.warnings.push(
          `learnings.md is ${result.learningsSizeKB}KB (threshold: ${CONFIG.LEARNINGS_WARN_THRESHOLD_KB}KB) - consider archival`
        );
      }
    }

    const decisionsPath = path.join(memoryDir, 'decisions.md');
    if (fs.existsSync(decisionsPath)) {
      const stats = fs.statSync(decisionsPath);
      result.decisionsSizeKB = Math.round(stats.size / 1024);

      if (result.decisionsSizeKB > CONFIG.DECISIONS_WARN_THRESHOLD_KB) {
        result.warnings.push(
          `decisions.md is ${result.decisionsSizeKB}KB (warning at ${CONFIG.DECISIONS_WARN_THRESHOLD_KB}KB, rotate at 100KB)`
        );
        result.status = 'warning';
      }
    }

    const mapPath = path.join(memoryDir, 'codebase_map.json');
    if (fs.existsSync(mapPath)) {
      try {
        const { data: codebaseMap } = safeParseJSON(fs.readFileSync(mapPath, 'utf8'), {});
        result.codebaseMapEntries = Object.keys(codebaseMap.discovered_files || {}).length;

        if (result.codebaseMapEntries > CONFIG.CODEBASE_MAP_WARN_ENTRIES) {
          result.warnings.push(
            `codebase_map has ${result.codebaseMapEntries} entries (threshold: ${CONFIG.CODEBASE_MAP_WARN_ENTRIES}) - consider pruning`
          );
        }
      } catch (e) {
        if (process.env.MEMORY_DEBUG) {
          logger.debug('getMemoryHealth (codebaseMap) error', { error: e.message });
        }
      }
    }

    const sessionsDir = path.join(memoryDir, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter(f => f.match(/^session_\d{3}\.json$/));
      result.sessionsCount = files.length;
      if (result.sessionsCount > 0) {
        result.warnings.push(
          `legacy sessions/ has ${result.sessionsCount} files - migrate to MTM and remove legacy fallback`
        );
      }
    }

    if (result.warnings.length > 0) {
      result.status = 'warning';
    }

    return result;
  }

  function getMemoryStats(projectRoot = PROJECT_ROOT) {
    const memoryDir = getMemoryDir(projectRoot);
    const stats = {
      gotchas_count: 0,
      patterns_count: 0,
      discoveries_count: 0,
      sessions_count: 0,
      total_size_bytes: 0,
    };

    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    if (fs.existsSync(gotchasFile)) {
      try {
        const { data: gotchas } = safeParseJSON(fs.readFileSync(gotchasFile, 'utf8'), []);
        stats.gotchas_count = Array.isArray(gotchas)
          ? gotchas.length
          : gotchas.gotchas
            ? gotchas.gotchas.length
            : 0;
        stats.total_size_bytes += fs.statSync(gotchasFile).size;
      } catch (e) {
        if (process.env.METRICS_DEBUG === 'true') {
          logger.error('Error reading gotchas', { error: e.message });
        }
      }
    }

    const patternsFile = path.join(memoryDir, 'patterns.json');
    if (fs.existsSync(patternsFile)) {
      try {
        const { data: patterns } = safeParseJSON(fs.readFileSync(patternsFile, 'utf8'), []);
        stats.patterns_count = Array.isArray(patterns)
          ? patterns.length
          : patterns.patterns
            ? patterns.patterns.length
            : 0;
        stats.total_size_bytes += fs.statSync(patternsFile).size;
      } catch (e) {
        if (process.env.MEMORY_DEBUG) {
          logger.debug('getMemoryStats (patterns) error', { error: e.message });
        }
      }
    }

    const mapFile = path.join(memoryDir, 'codebase_map.json');
    if (fs.existsSync(mapFile)) {
      try {
        const { data: map } = safeParseJSON(fs.readFileSync(mapFile, 'utf8'), {});
        stats.discoveries_count = Object.keys(map.discovered_files || {}).length;
        stats.total_size_bytes += fs.statSync(mapFile).size;
      } catch (e) {
        if (process.env.MEMORY_DEBUG) {
          logger.debug('getMemoryStats (discoveries) error', { error: e.message });
        }
      }
    }

    const sessionsDir = path.join(memoryDir, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter(f => f.match(/^session_\d{3}\.json$/));
      stats.sessions_count = files.length;
      for (const file of files) {
        stats.total_size_bytes += fs.statSync(path.join(sessionsDir, file)).size;
      }
    }

    return stats;
  }

  return {
    getMemoryHealth,
    getMemoryStats,
  };
}

module.exports = {
  createReportingOps,
};
