/**
 * Semantic Chunker - Extract meaningful code units from AST
 *
 * @module code-indexing/semantic-chunker
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

const crypto = require('crypto');

// Chunk types
const CHUNK_TYPES = {
  FUNCTION: 'function',
  CLASS: 'class',
  METHOD: 'method',
  INTERFACE: 'interface',
  TYPE: 'type',
  MODULE: 'module',
  IMPORT: 'import',
  EXPORT: 'export',
  COMMENT: 'comment',
  OTHER: 'other'
};

// Default chunking options
const DEFAULT_OPTIONS = {
  minTokens: 50,
  maxTokens: 2048,
  targetTokens: 512,
  overlapTokens: 50
};

// Node type to chunk type mapping by language
const NODE_TYPE_MAP = {
  javascript: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    arrow_function: CHUNK_TYPES.FUNCTION,
    class_declaration: CHUNK_TYPES.CLASS,
    method_definition: CHUNK_TYPES.METHOD,
    export_statement: CHUNK_TYPES.EXPORT,
    import_statement: CHUNK_TYPES.IMPORT,
    lexical_declaration: CHUNK_TYPES.OTHER,
    variable_declaration: CHUNK_TYPES.OTHER
  },
  typescript: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    arrow_function: CHUNK_TYPES.FUNCTION,
    class_declaration: CHUNK_TYPES.CLASS,
    method_definition: CHUNK_TYPES.METHOD,
    interface_declaration: CHUNK_TYPES.INTERFACE,
    type_alias_declaration: CHUNK_TYPES.TYPE,
    export_statement: CHUNK_TYPES.EXPORT,
    import_statement: CHUNK_TYPES.IMPORT
  },
  python: {
    function_definition: CHUNK_TYPES.FUNCTION,
    class_definition: CHUNK_TYPES.CLASS,
    import_statement: CHUNK_TYPES.IMPORT,
    import_from_statement: CHUNK_TYPES.IMPORT
  },
  go: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    method_declaration: CHUNK_TYPES.METHOD,
    type_declaration: CHUNK_TYPES.TYPE
  },
  rust: {
    function_item: CHUNK_TYPES.FUNCTION,
    impl_item: CHUNK_TYPES.CLASS,
    struct_item: CHUNK_TYPES.TYPE,
    enum_item: CHUNK_TYPES.TYPE,
    trait_item: CHUNK_TYPES.INTERFACE
  }
};

class SemanticChunker {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Estimate token count for text (GPT-4 approximation)
   * Rule: ~4 characters per token for code
   * @param {string} text - Text to count
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // More accurate estimation for code:
    // - Whitespace counts less
    // - Symbols count more (brackets, semicolons)
    const normalized = text.replace(/\s+/g, ' ');
    return Math.ceil(normalized.length / 4);
  }

  /**
   * Check if chunk size is within limits
   * @param {string} content - Chunk content
   * @returns {Object} Size validation result
   */
  validateChunkSize(content) {
    const tokens = this.estimateTokens(content);
    return {
      tokens,
      tooSmall: tokens < this.options.minTokens,
      tooLarge: tokens > this.options.maxTokens,
      valid: tokens >= this.options.minTokens && tokens <= this.options.maxTokens
    };
  }

  /**
   * Generate unique chunk ID based on content and location
   * @param {string} filePath - Source file path
   * @param {number} lineStart - Starting line
   * @param {string} content - Chunk content
   * @returns {string} Unique chunk ID
   */
  generateChunkId(filePath, lineStart, content) {
    const hash = crypto.createHash('sha256')
      .update(`${filePath}:${lineStart}:${content.substring(0, 100)}`)
      .digest('hex')
      .substring(0, 16);
    return `chunk_${hash}`;
  }

  /**
   * Get chunk type for AST node
   * @param {string} nodeType - AST node type
   * @param {string} language - Source language
   * @returns {string} Chunk type
   */
  getChunkType(nodeType, language) {
    const langMap = NODE_TYPE_MAP[language] || {};
    return langMap[nodeType] || CHUNK_TYPES.OTHER;
  }

  /**
   * Extract name from AST node
   * @param {SyntaxNode} node - AST node
   * @param {string} language - Source language
   * @returns {string|null} Extracted name or null
   */
  extractName(node, language) {
    // Safety check
    if (!node || !node.children || !Array.isArray(node.children)) {
      return null;
    }

    // Try common name child types
    const nameTypes = ['identifier', 'name', 'property_identifier'];

    for (const child of node.children) {
      if (child && nameTypes.includes(child.type)) {
        return child.text;
      }
    }

    // Language-specific extraction
    if (language === 'python') {
      const nameNode = node.childForFieldName && node.childForFieldName('name');
      if (nameNode) return nameNode.text;
    }

    return null;
  }

  /**
   * Extract function signature
   * @param {SyntaxNode} node - Function node
   * @param {string} content - Full file content
   * @returns {string} Function signature (first line)
   */
  extractSignature(node, content) {
    const startLine = node.startPosition.row;
    const lines = content.split('\n');

    // Get first line of function
    let signature = lines[startLine];

    // For multi-line signatures, include up to opening brace
    let lineIndex = startLine;
    while (lineIndex < lines.length && !signature.includes('{') && !signature.includes(':')) {
      lineIndex++;
      if (lineIndex < lines.length) {
        signature += ' ' + lines[lineIndex].trim();
      }
    }

    // Clean up
    return signature.trim().replace(/\s+/g, ' ').substring(0, 200);
  }

  /**
   * Chunk a parsed AST into semantic units
   * @param {ParseResult} parseResult - Parse result from CodeParser
   * @param {string} filePath - Source file path
   * @returns {CodeChunk[]} Array of code chunks
   */
  chunk(parseResult, filePath) {
    const chunks = [];
    const { content, language, rootNode } = parseResult;

    // Safety check: ensure rootNode has children
    if (!rootNode || !rootNode.children || !Array.isArray(rootNode.children)) {
      return chunks;
    }

    // Process top-level nodes
    for (const node of rootNode.children) {
      const chunkType = this.getChunkType(node.type, language);

      // Skip trivial nodes
      if (chunkType === CHUNK_TYPES.OTHER && this.estimateTokens(node.text) < this.options.minTokens) {
        continue;
      }

      // Handle classes specially (extract methods)
      if (chunkType === CHUNK_TYPES.CLASS) {
        chunks.push(...this.chunkClass(node, language, filePath, content));
      } else {
        const chunk = this.createChunk(node, chunkType, language, filePath, content);
        if (chunk) {
          // Split if too large
          if (chunk.tokenCount > this.options.maxTokens) {
            chunks.push(...this.splitLargeChunk(chunk));
          } else if (chunk.tokenCount >= this.options.minTokens) {
            chunks.push(chunk);
          }
        }
      }
    }

    return chunks;
  }

  /**
   * Create a single chunk from AST node
   * @param {SyntaxNode} node - AST node
   * @param {string} chunkType - Chunk type
   * @param {string} language - Source language
   * @param {string} filePath - Source file path
   * @param {string} content - Full file content
   * @param {string} [parentId] - Parent chunk ID
   * @returns {CodeChunk} Created chunk
   */
  createChunk(node, chunkType, language, filePath, content, parentId = null) {
    const chunkContent = node.text;
    const tokenCount = this.estimateTokens(chunkContent);
    const lineStart = node.startPosition.row + 1;
    const lineEnd = node.endPosition.row + 1;

    return {
      id: this.generateChunkId(filePath, lineStart, chunkContent),
      content: chunkContent,
      type: chunkType,
      language: language,
      filePath: filePath,
      lineStart: lineStart,
      lineEnd: lineEnd,
      tokenCount: tokenCount,
      name: this.extractName(node, language),
      signature: [CHUNK_TYPES.FUNCTION, CHUNK_TYPES.METHOD].includes(chunkType)
        ? this.extractSignature(node, content)
        : null,
      parentChunk: parentId
    };
  }

  /**
   * Chunk a class into header + methods
   * @param {SyntaxNode} classNode - Class AST node
   * @param {string} language - Source language
   * @param {string} filePath - Source file path
   * @param {string} content - Full file content
   * @returns {CodeChunk[]} Array of chunks (header + methods)
   */
  chunkClass(classNode, language, filePath, content) {
    const chunks = [];

    // Safety check
    if (!classNode || !classNode.children || !Array.isArray(classNode.children)) {
      return chunks;
    }

    // Create class header chunk
    const className = this.extractName(classNode, language);
    const classId = this.generateChunkId(filePath, classNode.startPosition.row + 1, className || 'class');

    // Extract class header (everything before first method)
    const headerChunk = this.extractClassHeader(classNode, language, filePath, content, classId);
    if (headerChunk) {
      chunks.push(headerChunk);
    }

    // Extract methods - handle both direct children and class_body children
    const methodTypes = ['method_definition', 'function_definition', 'method_declaration'];
    const childrenToProcess = [];

    // Collect children to process (avoid recursive loops)
    for (const child of classNode.children) {
      if (!child) continue; // Skip null/undefined

      if (child.type === 'class_body' && child.children && Array.isArray(child.children)) {
        // JavaScript/TypeScript class_body contains methods
        childrenToProcess.push(...child.children.filter(c => c)); // Filter out nulls
      } else {
        childrenToProcess.push(child);
      }
    }

    for (const child of childrenToProcess) {
      if (!child) continue; // Skip null/undefined

      if (methodTypes.includes(child.type)) {
        const methodChunk = this.createChunk(
          child,
          CHUNK_TYPES.METHOD,
          language,
          filePath,
          content,
          classId
        );
        if (methodChunk && methodChunk.tokenCount >= this.options.minTokens) {
          // Split large methods
          if (methodChunk.tokenCount > this.options.maxTokens) {
            chunks.push(...this.splitLargeChunk(methodChunk));
          } else {
            chunks.push(methodChunk);
          }
        }
      }
      // Recursively handle nested classes (but not class_body to avoid infinite loop)
      else if (
        (child.type === 'class_declaration' || child.type === 'class_definition') &&
        child !== classNode // Prevent infinite loop
      ) {
        chunks.push(...this.chunkClass(child, language, filePath, content));
      }
    }

    return chunks;
  }

  /**
   * Extract class header (signature, docstring, properties)
   * @param {SyntaxNode} classNode - Class AST node
   * @param {string} language - Source language
   * @param {string} filePath - Source file path
   * @param {string} content - Full file content
   * @param {string} classId - Class chunk ID
   * @returns {CodeChunk|null} Class header chunk or null if too small
   */
  extractClassHeader(classNode, language, filePath, content, classId) {
    // Find first method
    let firstMethodStart = classNode.endPosition.row;
    const methodTypes = ['method_definition', 'function_definition'];

    for (const child of classNode.children) {
      if (methodTypes.includes(child.type)) {
        firstMethodStart = Math.min(firstMethodStart, child.startPosition.row);
        break;
      }
    }

    const lines = content.split('\n');
    const headerLines = lines.slice(classNode.startPosition.row, firstMethodStart);
    const headerContent = headerLines.join('\n');

    if (this.estimateTokens(headerContent) < this.options.minTokens) {
      return null;
    }

    return {
      id: classId,
      content: headerContent,
      type: CHUNK_TYPES.CLASS,
      language: language,
      filePath: filePath,
      lineStart: classNode.startPosition.row + 1,
      lineEnd: firstMethodStart,
      tokenCount: this.estimateTokens(headerContent),
      name: this.extractName(classNode, language),
      signature: null,
      parentChunk: null
    };
  }

  /**
   * Split a large chunk into smaller overlapping chunks
   * @param {CodeChunk} chunk - Large chunk to split
   * @returns {CodeChunk[]} Array of smaller chunks
   */
  splitLargeChunk(chunk) {
    const chunks = [];
    const lines = chunk.content.split('\n');
    const targetLines = Math.ceil(this.options.targetTokens / 4); // ~4 chars per token, ~10 chars per line
    const overlapLines = Math.ceil(this.options.overlapTokens / 4);

    let startLine = 0;
    let partIndex = 0;

    while (startLine < lines.length) {
      const endLine = Math.min(startLine + targetLines, lines.length);
      const chunkLines = lines.slice(startLine, endLine);
      const chunkContent = chunkLines.join('\n');

      const tokenCount = this.estimateTokens(chunkContent);

      // Skip if too small (except for last chunk)
      if (tokenCount >= this.options.minTokens || endLine >= lines.length) {
        chunks.push({
          id: `${chunk.id}_part${partIndex}`,
          content: chunkContent,
          type: chunk.type,
          language: chunk.language,
          filePath: chunk.filePath,
          lineStart: chunk.lineStart + startLine,
          lineEnd: chunk.lineStart + endLine - 1,
          tokenCount,
          name: chunk.name ? `${chunk.name} (part ${partIndex + 1})` : null,
          signature: partIndex === 0 ? chunk.signature : null,
          parentChunk: chunk.parentChunk
        });
        partIndex++;
      }

      // Move start with overlap
      startLine = endLine - overlapLines;
      if (startLine >= endLine) break; // Avoid infinite loop
    }

    return chunks;
  }
}

// Static property (outside class for CommonJS compatibility)
SemanticChunker.NODE_TYPE_MAP = NODE_TYPE_MAP;

module.exports = { SemanticChunker, CHUNK_TYPES, DEFAULT_OPTIONS };
