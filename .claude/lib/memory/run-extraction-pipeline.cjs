'use strict';

const fs = require('fs');
const path = require('path');

const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { extractMemoriesFromSession } = require('./memory-extractor.cjs');
const { writeExtractedMemories } = require('./memory-extraction-writer.cjs');
const memoryTiers = require('./memory-tiers.cjs');

const logger = createLogger('memory-extraction-pipeline');

function validateProjectRoot(projectRoot) {
  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

function readSessionFile(projectRoot, filename) {
  const mtmDir = memoryTiers.getTierPath('MTM', projectRoot);
  const sessionPath = path.join(mtmDir, filename);
  if (!fs.existsSync(sessionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const key = `${candidate.category || ''}|${candidate.abstract || ''}|${candidate.content || ''}`
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

async function runExtractionPipeline(projectRoot = PROJECT_ROOT, options = {}) {
  validateProjectRoot(projectRoot);
  const user = options.user || 'default';
  const maxMtmSessions = Number.isFinite(options.maxMtmSessions) ? options.maxMtmSessions : 3;
  const deduplicate = options.deduplicate !== false;
  const memoryManager = options.memoryManager || require('./memory-manager.cjs');
  const modelClient = options.modelClient;

  const sessions = memoryTiers.getMTMSessions(projectRoot).slice(-maxMtmSessions);
  const candidates = [];
  const toolsUsed = new Set();
  let processedSessions = 0;

  for (const session of sessions) {
    const data = session?._filename ? readSessionFile(projectRoot, session._filename) : session;
    if (!data) continue;
    processedSessions += 1;
    if (Array.isArray(data.tools_used)) {
      for (const tool of data.tools_used) {
        if (tool) toolsUsed.add(String(tool));
      }
    }
    const extracted = await extractMemoriesFromSession(data, {
      projectRoot,
      user,
      modelClient,
      summary: data.summary || '',
    });
    if (Array.isArray(extracted)) {
      candidates.push(...extracted);
    }
  }

  const uniqueCandidates = dedupeCandidates(candidates);
  const writeResult = await writeExtractedMemories(uniqueCandidates, {
    projectRoot,
    user,
    sessionId: 'batch',
    sessionToolsUsed: Array.from(toolsUsed),
    memoryManager,
    modelClient,
    deduplicate,
  });

  const result = {
    processedSessions,
    candidatesExtracted: candidates.length,
    candidatesDeduped: uniqueCandidates.length,
    written: writeResult.written || 0,
    skipped: writeResult.skipped || 0,
  };

  logger.info('Extraction pipeline completed', result);
  return result;
}

module.exports = {
  runExtractionPipeline,
  dedupeCandidates,
};
