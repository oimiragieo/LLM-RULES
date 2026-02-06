'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { ModelClient } = require('../clients/model-client.cjs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { deduplicateCandidate } = require('./memory-deduplicator.cjs');
const { MemoryVectorStore } = require('./lancedb-client.cjs');
const { linkMemoryToTools } = require('./memory-entity-links.cjs');

const logger = createLogger('memory-extraction-writer');

const CATEGORY_DIRS = {
  profile: 'profile',
  preferences: 'preferences',
  entities: 'entities',
  events: 'events',
  cases: 'cases',
  patterns: 'patterns',
};

function normalizeCategory(category) {
  if (!category) return null;
  const key = String(category).trim().toLowerCase();
  return CATEGORY_DIRS[key] ? key : null;
}

function buildMemoryMarkdown(candidate) {
  const abstract = candidate.abstract ? String(candidate.abstract).trim() : '';
  const overview = candidate.overview ? String(candidate.overview).trim() : '';
  const content = candidate.content ? String(candidate.content).trim() : '';

  return [
    `# ${abstract || 'Memory'}`,
    '',
    '## Overview',
    overview || '_No overview provided._',
    '',
    '## Content',
    content || '_No content provided._',
    '',
  ].join('\n');
}

function getProfileFilePath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'memories', 'profile.md');
}

function buildMemoryPath(projectRoot, category) {
  const safeCategory = CATEGORY_DIRS[category];
  if (!safeCategory) {
    throw new Error(`Unknown memory category: ${category}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = crypto.randomUUID();
  const fileName = `${timestamp}-${id}.md`;
  const baseDir = path.join(projectRoot, '.claude', 'context', 'memory', 'memories', safeCategory);

  return path.join(baseDir, fileName);
}

function appendToProfileFile(candidate, projectRoot) {
  const profilePath = getProfileFilePath(projectRoot);
  const profileDir = path.dirname(profilePath);
  fs.mkdirSync(profileDir, { recursive: true });

  const existing = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf8') : '';
  const block = buildMemoryMarkdown(candidate).trimEnd();
  const next = existing ? `${existing.trimEnd()}\n\n---\n\n${block}\n` : `${block}\n`;
  atomicWriteSync(profilePath, next, 'utf8');
  return profilePath;
}

function writeMemoryFile(candidate, projectRoot) {
  const category = normalizeCategory(candidate.category);
  if (!category) {
    throw new Error(`Invalid category: ${candidate.category || 'unknown'}`);
  }

  const filePath = buildMemoryPath(projectRoot, category);
  const content = buildMemoryMarkdown(candidate);
  atomicWriteSync(filePath, content, 'utf8');
  return filePath;
}

function overwriteMemoryFile(candidate, filePath, projectRoot) {
  const validation = validatePathWithinProject(filePath, projectRoot);
  if (!validation.safe) {
    throw new Error(`Invalid memory path: ${validation.reason}`);
  }
  const content = buildMemoryMarkdown(candidate);
  atomicWriteSync(validation.resolvedPath, content, 'utf8');
  return validation.resolvedPath;
}

function resolveTargetFilePath(decisionResult, projectRoot) {
  const similar = Array.isArray(decisionResult?.similarMemories)
    ? decisionResult.similarMemories[0]
    : null;
  const candidatePath = similar?.metadata?.filePath || similar?.id;
  if (!candidatePath) return null;
  const validation = validatePathWithinProject(candidatePath, projectRoot);
  if (!validation.safe) return null;
  return validation.resolvedPath;
}

async function indexMemory(candidate, filePath, projectRoot) {
  const category = normalizeCategory(candidate.category);
  if (!category) return;
  const text = buildMemoryMarkdown(candidate);
  const store = MemoryVectorStore.getSharedStore({
    persistDirectory: path.join(projectRoot, '.claude', 'context', 'data', 'lancedb'),
    collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
  });

  let docId = filePath;
  if (category === 'profile') {
    docId = getProfileFilePath(projectRoot);
    try {
      await store.deleteByMetadata('category', 'profile');
    } catch (error) {
      logger.warn('Failed to prune profile metadata before indexing', {
        error: error.message,
      });
    }
  }

  await store.upsertDocuments([
    {
      id: docId,
      text,
      metadata: {
        type: 'memory',
        category,
        source: 'memory_extraction',
        filePath,
        abstract: candidate.abstract ? String(candidate.abstract).trim() : '',
        overview: candidate.overview ? String(candidate.overview).trim().slice(0, 2000) : '',
      },
    },
  ]);
}

async function writeExtractedMemories(candidates, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const user = options.user || 'default';
  const sessionId = options.sessionId || 'batch';
  const deduplicate = options.deduplicate !== false;
  const indexToLanceDb = options.indexToLanceDb !== false;
  const sessionToolsUsed = Array.isArray(options.sessionToolsUsed) ? options.sessionToolsUsed : [];
  const deduplicateFn = options.deduplicateFn || deduplicateCandidate;
  const memoryManager = options.memoryManager || require('./memory-manager.cjs');
  const modelClient = options.modelClient || new ModelClient();

  const result = {
    user,
    sessionId,
    written: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    merged: 0,
    skippedByDedup: 0,
    decisions: [],
    files: [],
  };

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return result;
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      result.skipped += 1;
      result.decisions.push({ decision: 'skip', reason: 'Invalid candidate' });
      continue;
    }

    let decisionResult = {
      decision: 'create',
      reason: 'dedup disabled',
      mergedContent: null,
    };

    if (deduplicate) {
      decisionResult = await deduplicateFn(candidate, {
        projectRoot,
        memoryManager,
        modelClient,
      });
    }

    result.decisions.push({
      decision: decisionResult.decision,
      reason: decisionResult.reason || '',
      category: candidate.category || 'unknown',
    });

    if (decisionResult.decision === 'create') {
      result.created += 1;
    } else if (decisionResult.decision === 'update') {
      result.updated += 1;
    } else if (decisionResult.decision === 'merge') {
      result.merged += 1;
    } else if (decisionResult.decision === 'skip') {
      result.skippedByDedup += 1;
    }

    if (decisionResult.decision === 'skip') {
      result.skipped += 1;
      continue;
    }

    const payload = { ...candidate };
    if (decisionResult.mergedContent) {
      payload.content = decisionResult.mergedContent;
    }

    try {
      const category = normalizeCategory(payload.category);
      let filePath;
      if (category === 'profile') {
        filePath = appendToProfileFile(payload, projectRoot);
      } else if (decisionResult.decision === 'update' || decisionResult.decision === 'merge') {
        const targetPath = resolveTargetFilePath(decisionResult, projectRoot);
        if (targetPath && fs.existsSync(targetPath)) {
          filePath = overwriteMemoryFile(payload, targetPath, projectRoot);
        } else {
          filePath = writeMemoryFile(payload, projectRoot);
        }
      } else {
        filePath = writeMemoryFile(payload, projectRoot);
      }
      if (indexToLanceDb) {
        try {
          await indexMemory(payload, filePath, projectRoot);
        } catch (indexError) {
          logger.warn('Failed to index extracted memory', {
            error: indexError.message,
            category: candidate.category,
            projectRoot,
          });
        }
      }
      if (sessionToolsUsed.length > 0) {
        linkMemoryToTools(filePath, sessionToolsUsed, projectRoot);
      }
      result.written += 1;
      result.files.push(filePath);
    } catch (error) {
      logger.warn('Failed to persist extracted memory', {
        error: error.message,
        category: candidate.category,
        projectRoot,
      });
      result.skipped += 1;
    }
  }

  return result;
}

module.exports = {
  writeExtractedMemories,
  buildMemoryMarkdown,
  normalizeCategory,
  buildMemoryPath,
};
