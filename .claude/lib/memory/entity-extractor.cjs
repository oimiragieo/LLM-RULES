// .claude/lib/memory/entity-extractor.cjs
// Entity extraction from markdown files for hybrid memory system

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

/**
 * EntityExtractor - Extract entities and relationships from markdown files
 *
 * Extracts:
 * - Entities: agents, tasks, skills, concepts, patterns, decisions, issues
 * - Relationships: blocks, implements, references, depends_on
 *
 * @class EntityExtractor
 */
class EntityExtractor {
  /**
   * Create EntityExtractor instance
   * @param {string} dbPath - Path to SQLite database (default: .claude/data/memory.db)
   */
  constructor(dbPath) {
    // Default database path
    if (!dbPath) {
      const projectRoot = path.resolve(__dirname, '../../../');
      dbPath = path.join(projectRoot, '.claude/data/memory.db');
    }

    // Open database connection
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');

    // Validate schema exists
    try {
      const tableCheck = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'")
        .get();
      if (!tableCheck) {
        console.log('[EntityExtractor] Database not initialized. Auto-initializing...');
        try {
          const initScript = require('../../tools/cli/init-memory-db.cjs');
          initScript.initializeDatabase(this.db);
        } catch (initError) {
          throw new Error(
            `Auto-initialization failed: ${initError.message}. Run \`pnpm run memory:init\`.`
          );
        }
      }
    } catch (error) {
      // Re-throw specific errors, wrap others
      if (error.message.includes('memory:init')) throw error;
      throw new Error(
        `Database validation failed: ${error.message}. Try running \`pnpm run memory:init\`.`
      );
    }
  }

  /**
   * Extract entities from markdown content
   *
   * @param {string} content - Markdown content
   * @param {string} filePath - Source file path (for metadata)
   * @returns {Promise<Array>} Extracted entities
   */
  async extract(content, filePath) {
    const entities = [];
    const lines = content.split('\n');

    // Determine file type from path
    const fileType = this._detectFileType(filePath);

    // Extract entities based on file type (primary extraction)
    if (fileType === 'learnings') {
      entities.push(...this._extractLearningEntities(lines, filePath));
    } else if (fileType === 'decisions') {
      entities.push(...this._extractDecisionEntities(lines, filePath));
    } else if (fileType === 'issues') {
      entities.push(...this._extractIssueEntities(lines, filePath));
    }

    // Always try to extract other entity types (embedded content)
    // This handles cases where ADRs are referenced in learnings, etc.
    if (fileType !== 'decisions') {
      entities.push(...this._extractDecisionEntities(lines, filePath));
    }
    if (fileType !== 'issues') {
      entities.push(...this._extractIssueEntities(lines, filePath));
    }

    // Extract task references across all file types
    entities.push(...this._extractTaskEntities(lines, filePath));

    return entities;
  }

  /**
   * Extract relationships from markdown content
   *
   * Patterns:
   * - "Task X blocks Task Y"
   * - "Task X depends on Task Y"
   * - "Pattern X implements Decision Y"
   * - "Related Specifications: file.md"
   *
   * @param {string} content - Markdown content
   * @param {string} filePath - Source file path (for metadata)
   * @returns {Promise<Array>} Extracted relationships
   */
  async extractRelationships(content, filePath) {
    const relationships = [];

    // Pattern: Task X blocks Task Y
    const blocksPattern = /Task #?(\d+) blocks Task #?(\d+)/gi;
    let match;

    while ((match = blocksPattern.exec(content)) !== null) {
      relationships.push({
        from: `task-${match[1]}`,
        to: `task-${match[2]}`,
        type: 'blocks',
        weight: 1.0,
      });
    }

    // Pattern: Task X depends on Task Y
    const dependsPattern = /Task #?(\d+) depends on Task #?(\d+)/gi;

    while ((match = dependsPattern.exec(content)) !== null) {
      relationships.push({
        from: `task-${match[1]}`,
        to: `task-${match[2]}`,
        type: 'depends_on',
        weight: 1.0,
      });
    }

    // Pattern: Pattern X implements ADR-Y
    const implementsPattern = /Pattern (\S+) implements (?:Decision )?ADR-(\d+)/gi;

    while ((match = implementsPattern.exec(content)) !== null) {
      relationships.push({
        from: `pattern-${match[1].toLowerCase()}`,
        to: `adr-${match[2]}`,
        type: 'implements',
        weight: 1.0,
      });
    }

    // Pattern: Related Specifications: file.md
    const referencesPattern = /Related Specifications?:(.*?)(?:\n|$)/gi;

    while ((match = referencesPattern.exec(content)) !== null) {
      const files = match[1].match(/[\w-]+\.md/g) || [];
      for (const file of files) {
        relationships.push({
          from: path.basename(filePath, '.md'),
          to: file.replace('.md', ''),
          type: 'references',
          weight: 0.5,
        });
      }
    }

    return relationships;
  }

  /**
   * Store entities in SQLite database
   *
   * Uses UPSERT (INSERT OR REPLACE) to handle duplicates gracefully
   *
   * @param {Array} entities - Entities to store
   * @returns {Promise<void>}
   */
  async storeEntities(entities) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entities (
        id, type, name, content, source_file, line_number,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(
        (SELECT created_at FROM entities WHERE id = ?),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);

    for (const entity of entities) {
      stmt.run(
        entity.id,
        entity.type,
        entity.name,
        entity.content || null,
        entity.source_file,
        entity.line_number || null,
        entity.id // For COALESCE to preserve created_at
      );
    }
  }

  /**
   * Store relationships in SQLite database
   *
   * @param {Array} relationships - Relationships to store
   * @returns {Promise<void>}
   */
  async storeRelationships(relationships) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO entity_relationships (
        from_entity_id, to_entity_id, relationship_type, weight
      )
      VALUES (?, ?, ?, ?)
    `);

    for (const rel of relationships) {
      stmt.run(rel.from, rel.to, rel.type, rel.weight || 1.0);
    }
  }

  /**
   * Extract entities from file
   *
   * @param {string} filePath - Path to markdown file
   * @returns {Promise<Object>} { entities, relationships }
   */
  async extractFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const entities = await this.extract(content, filePath);
    const relationships = await this.extractRelationships(content, filePath);

    return { entities, relationships };
  }

  // Private helper methods

  /**
   * Detect file type from path
   * @private
   */
  _detectFileType(filePath) {
    const basename = path.basename(filePath, '.md').toLowerCase();
    if (basename.includes('learning')) return 'learnings';
    if (basename.includes('decision')) return 'decisions';
    if (basename.includes('issue')) return 'issues';

    // Also check for pattern/concept indicators (treat as learnings)
    if (basename.includes('pattern') || basename.includes('concept')) return 'learnings';

    return 'unknown';
  }

  /**
   * Extract learning entities (patterns, concepts)
   * @private
   */
  _extractLearningEntities(lines, filePath) {
    const entities = [];
    let currentEntity = null;
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let conceptMatch;

      // Pattern: ### Pattern: Name or ## Pattern: Name
      const patternMatch = line.match(/^#{2,3}\s+Pattern:\s+(.+)/);
      if (patternMatch) {
        // Save previous entity if exists
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
        }

        const name = patternMatch[1].trim();
        currentEntity = {
          id: `pattern-${this._slugify(name)}`,
          type: 'pattern',
          name: name,
          source_file: filePath,
          line_number: i + 1,
        };
        currentContent = [];
      }
      // Concept: ### Concept: Name or ## Concept: Name
      else if ((conceptMatch = line.match(/^#{2,3}\s+Concept:\s+(.+)/))) {
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
        }

        const name = conceptMatch[1].trim();
        currentEntity = {
          id: `concept-${this._slugify(name)}`,
          type: 'concept',
          name: name,
          source_file: filePath,
          line_number: i + 1,
        };
        currentContent = [];
      }
      // New section header ends current entity
      else if (line.match(/^###\s+/)) {
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
          currentEntity = null;
          currentContent = [];
        }
      }
      // Accumulate content
      else if (currentEntity) {
        currentContent.push(line);
      }
    }

    // Save last entity
    if (currentEntity) {
      currentEntity.content = currentContent.join('\n').trim();
      entities.push(currentEntity);
    }

    return entities;
  }

  /**
   * Extract decision entities (ADRs)
   * @private
   */
  _extractDecisionEntities(lines, filePath) {
    const entities = [];
    let currentEntity = null;
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pattern: ## [ADR-NNN] Title, ## ADR-NNN: Title, or ## Decision: Title
      const adrMatch = line.match(/^##\s+\[?ADR-(\d+)\]?\s*:?\s+(.+)/);
      const decisionMatch = !adrMatch && line.match(/^##\s+Decision:\s+(.+)/);
      if (adrMatch) {
        // Save previous entity
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
        }

        const adrNumber = adrMatch[1];
        const title = adrMatch[2].trim();

        currentEntity = {
          id: `adr-${adrNumber}`,
          type: 'decision',
          name: `ADR-${adrNumber}: ${title}`,
          source_file: filePath,
          line_number: i + 1,
        };
        currentContent = [];
      } else if (decisionMatch) {
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
        }
        const title = decisionMatch[1].trim();
        currentEntity = {
          id: `decision-${this._slugify(title)}`,
          type: 'decision',
          name: title,
          source_file: filePath,
          line_number: i + 1,
        };
        currentContent = [];
      }
      // New section header ends current entity
      else if (line.match(/^##\s+/)) {
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
          currentEntity = null;
          currentContent = [];
        }
      }
      // Accumulate content
      else if (currentEntity) {
        currentContent.push(line);
      }
    }

    // Save last entity
    if (currentEntity) {
      currentEntity.content = currentContent.join('\n').trim();
      entities.push(currentEntity);
    }

    return entities;
  }

  /**
   * Extract issue entities
   * @private
   */
  _extractIssueEntities(lines, filePath) {
    const entities = [];
    let currentEntity = null;
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pattern: ### Issue: Title or ## Issue: Title
      const issueMatch = line.match(/^#{2,3}\s+Issue:\s+(.+)/);
      if (issueMatch) {
        // Save previous entity
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
        }

        const title = issueMatch[1].trim();

        currentEntity = {
          id: `issue-${this._slugify(title)}`,
          type: 'issue',
          name: title,
          source_file: filePath,
          line_number: i + 1,
        };
        currentContent = [];
      }
      // New section header ends current entity
      else if (line.match(/^###\s+/)) {
        if (currentEntity) {
          currentEntity.content = currentContent.join('\n').trim();
          entities.push(currentEntity);
          currentEntity = null;
          currentContent = [];
        }
      }
      // Accumulate content
      else if (currentEntity) {
        currentContent.push(line);
      }
    }

    // Save last entity
    if (currentEntity) {
      currentEntity.content = currentContent.join('\n').trim();
      entities.push(currentEntity);
    }

    return entities;
  }

  /**
   * Extract task references from content
   * @private
   */
  _extractTaskEntities(lines, filePath) {
    const entities = [];
    const taskReferences = new Set(); // Avoid duplicates

    // Combine all lines for global pattern matching
    const fullContent = lines.join('\n');

    // Pattern: Task #NNN or Task NNN (anywhere in content)
    // Captures all task references including those in relationships
    const taskPattern = /Task #?(\d+)(?:\s+\(([^)]+)\))?/g;
    let match;

    while ((match = taskPattern.exec(fullContent)) !== null) {
      const taskNumber = match[1];
      const taskId = `task-${taskNumber}`;

      // Skip if already added
      if (taskReferences.has(taskId)) continue;
      taskReferences.add(taskId);

      const taskCode = match[2] || ''; // e.g., "P1-2.1"

      // Try to find description by looking for patterns like:
      // "Task #25 - Description" or "Task #25: Description"
      let taskDesc = '';
      const descPattern = new RegExp(
        `Task #?${taskNumber}(?:\\s+\\([^)]+\\))?[:\\s-]+([^\\n]+?)(?:\\n|$)`,
        'i'
      );
      const descMatch = fullContent.match(descPattern);
      if (descMatch) {
        taskDesc = descMatch[1].trim();
      }

      entities.push({
        id: taskId,
        type: 'task',
        name: `Task #${taskNumber}${taskCode ? ` (${taskCode})` : ''}`,
        content: taskDesc,
        source_file: filePath,
        line_number: 0, // Will need to find actual line if needed
      });
    }

    return entities;
  }

  /**
   * Convert string to slug (lowercase, hyphens)
   * @private
   */
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .substring(0, 50); // Limit length
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = {
  EntityExtractor,
};
