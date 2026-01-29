/**
 * Unit Tests for Embedding Generator
 *
 * Tests the CLI tool that generates embeddings for existing memory files
 * and stores them in ChromaDB.
 *
 * Related: Task #24 (P1-1.2)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Import the module to test
const embeddingGeneratorPath = path.join(PROJECT_ROOT, '.claude/tools/cli/generate-embeddings.cjs');

describe('EmbeddingGenerator', () => {
  let tempDir;
  let mockMemoryDir;

  beforeEach(() => {
    // Create temporary test directory
    tempDir = path.join(PROJECT_ROOT, '.tmp-test-embeddings');
    mockMemoryDir = path.join(tempDir, 'memory');
    fs.mkdirSync(mockMemoryDir, { recursive: true });

    // Create mock memory files
    fs.writeFileSync(
      path.join(mockMemoryDir, 'learnings.md'),
      `## Pattern 1
This is a test learning about memory patterns.

## Pattern 2
This is another learning about ChromaDB integration.
`
    );

    fs.writeFileSync(
      path.join(mockMemoryDir, 'decisions.md'),
      `## [ADR-001] Test Decision
- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Test context
- **Decision**: Test decision
- **Consequences**: Test consequences
`
    );

    fs.writeFileSync(
      path.join(mockMemoryDir, 'issues.md'),
      `### Test Issue
- **Date**: 2026-01-28
- **Status**: Open
- **Description**: Test issue description
`
    );
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should pass: module exists now', async () => {
    assert.ok(fs.existsSync(embeddingGeneratorPath), 'Module should exist now (GREEN phase)');
  });

  it('should chunk markdown by section headers', async () => {
    // Dynamic import for CommonJS module
    const embeddingGenerator = await import(
      `file:///${embeddingGeneratorPath.replace(/\\/g, '/')}`
    );
    const { chunkByHeaders } = embeddingGenerator;

    const content = `## Section 1
Content 1

## Section 2
Content 2`;

    const chunks = chunkByHeaders(content, 'test.md');

    // Verify we got 2 chunks
    assert.equal(chunks.length, 2, 'Should have 2 chunks');

    // Verify first chunk
    assert.equal(chunks[0].section, 'Section 1');
    assert.equal(chunks[0].content, 'Content 1');
    assert.equal(chunks[0].line, 1);

    // Verify second chunk
    assert.equal(chunks[1].section, 'Section 2');
    assert.equal(chunks[1].content, 'Content 2');
    assert.equal(chunks[1].line, 4);
  });

  it('should extract metadata from markdown files', async () => {
    // Dynamic import for CommonJS module
    const embeddingGenerator = await import(
      `file:///${embeddingGeneratorPath.replace(/\\/g, '/')}`
    );
    const { extractMetadata } = embeddingGenerator;

    const filePath = 'learnings.md';
    const metadata = extractMetadata(filePath, 'Test Section', 10);

    // Verify metadata fields
    assert.equal(metadata.filePath, 'learnings.md');
    assert.equal(metadata.type, 'learning');
    assert.equal(metadata.section, 'Test Section');
    assert.equal(metadata.line, 10);
    assert.equal(metadata.timestamp, new Date().toISOString().split('T')[0]);
  });

  it('should handle archived memory files', async () => {
    // Dynamic import for CommonJS module
    const embeddingGenerator = await import(
      `file:///${embeddingGeneratorPath.replace(/\\/g, '/')}`
    );
    const { findMemoryFiles } = embeddingGenerator;

    // Create archived directory
    const archiveDir = path.join(mockMemoryDir, 'archive', '2026-01');
    fs.mkdirSync(archiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(archiveDir, 'learnings-2026-01.md'),
      '## Archived Pattern\nArchived content'
    );

    // Find all files
    const files = findMemoryFiles(mockMemoryDir);

    // Should find 4 files: 3 main + 1 archived
    assert.equal(files.length, 4, 'Should find 4 files (3 main + 1 archived)');

    // Verify archived file is included
    const archivedFile = files.find(f => f.includes('learnings-2026-01.md'));
    assert.ok(archivedFile, 'Should include archived file');
  });

  it('should successfully process all memory files in dry-run mode', async () => {
    // Dynamic import for CommonJS module
    const embeddingGenerator = await import(
      `file:///${embeddingGeneratorPath.replace(/\\/g, '/')}`
    );
    const { findMemoryFiles, processFile } = embeddingGenerator;

    // Find all files
    const files = findMemoryFiles(mockMemoryDir);

    // Process in dry-run mode (no ChromaDB needed)
    let totalChunks = 0;
    for (const file of files) {
      totalChunks += await processFile(file, { dryRun: true }, null);
    }

    // Verify we processed chunks
    assert.ok(totalChunks > 0, 'Should have processed at least 1 chunk');
    assert.ok(totalChunks >= 3, 'Should have processed chunks from all 3 files');
  });
});
