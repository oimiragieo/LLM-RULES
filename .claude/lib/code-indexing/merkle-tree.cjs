/**
 * Merkle Tree for Efficient Change Detection
 *
 * Builds a tree structure where each node contains:
 * - Hash of its children (for directories)
 * - Hash of file content (for files)
 *
 * Enables O(log n) change detection by comparing tree hashes instead of
 * checking every file individually.
 *
 * @module code-indexing/merkle-tree
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Merkle Tree Node
 */
class MerkleNode {
  constructor(type, name, hash, children = null, metadata = {}) {
    this.type = type; // 'file' | 'directory'
    this.name = name;
    this.hash = hash;
    this.children = children; // Map<string, MerkleNode> for directories
    this.metadata = metadata; // { mtime, size, etc. }
  }

  /**
   * Serialize node to JSON
   */
  toJSON() {
    const result = {
      type: this.type,
      name: this.name,
      hash: this.hash,
      metadata: this.metadata,
    };

    if (this.children) {
      result.children = {};
      for (const [name, child] of Object.entries(this.children)) {
        result.children[name] = child.toJSON();
      }
    }

    return result;
  }

  /**
   * Create node from JSON
   */
  static fromJSON(data) {
    const node = new MerkleNode(data.type, data.name, data.hash, null, data.metadata || {});

    if (data.children) {
      node.children = {};
      for (const [name, childData] of Object.entries(data.children)) {
        node.children[name] = MerkleNode.fromJSON(childData);
      }
    }

    return node;
  }
}

/**
 * Merkle Tree Builder
 */
class MerkleTree {
  constructor(rootPath, excludePatterns = []) {
    this.rootPath = rootPath;
    this.excludePatterns = excludePatterns;
    this.root = null;
  }

  _globToRegExp(pattern) {
    // Minimal glob support for the patterns we use in code-indexing:
    // - `*` matches within a path segment
    // - `**` matches across path segments
    // This is intentionally small and avoids pulling in a glob dependency.
    // Escape regex metacharacters but keep glob tokens `*` intact for replacement.
    const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&');

    const regexSource = escaped
      // `**/` should match "foo/" or be empty at the start of a path.
      .replace(/\*\*\//g, '(?:.*\\/)?')
      // `/**` should match "/foo" or be empty at the end of a path.
      .replace(/\/\*\*/g, '(?:\\/.*)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');

    return new RegExp(`^${regexSource}$`);
  }

  /**
   * Hash file content
   */
  async hashFile(filePath) {
    try {
      const content = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);

      // Include content + metadata in hash
      const hashInput = JSON.stringify({
        content: content.toString('base64'),
        size: stats.size,
        mtime: stats.mtimeMs,
      });

      return crypto.createHash('sha256').update(hashInput).digest('hex');
    } catch (_err) {
      // File might not exist or be unreadable
      return null;
    }
  }

  /**
   * Hash directory by combining children hashes
   */
  hashDirectory(children) {
    const childHashes = Object.values(children)
      .map(child => child.hash)
      .sort()
      .join('');

    return crypto.createHash('sha256').update(childHashes).digest('hex');
  }

  /**
   * Check if path should be excluded
   */
  shouldExclude(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    return this.excludePatterns.some(pattern => this._globToRegExp(pattern).test(normalized));
  }

  /**
   * Build Merkle tree for a directory
   */
  async buildTree(dirPath, relativePath = '') {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const children = {};

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');

        // Check exclusions
        if (this.shouldExclude(entryRelative)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively build subtree
          const subtree = await this.buildTree(entryPath, entryRelative);
          if (subtree) {
            children[entry.name] = subtree;
          }
        } else if (entry.isFile()) {
          // Hash file
          const hash = await this.hashFile(entryPath);
          if (hash) {
            const stats = await fs.stat(entryPath);
            children[entry.name] = new MerkleNode('file', entry.name, hash, null, {
              path: entryRelative,
              size: stats.size,
              mtime: stats.mtimeMs,
            });
          }
        }
      }

      // Hash directory from children
      if (Object.keys(children).length === 0) {
        return null; // Empty directory
      }

      const dirHash = this.hashDirectory(children);
      const dirName = path.basename(dirPath);

      return new MerkleNode('directory', dirName, dirHash, children, {
        path: relativePath,
      });
    } catch (_err) {
      // Directory might not exist or be inaccessible
      return null;
    }
  }

  /**
   * Build tree from root
   */
  async build() {
    this.root = await this.buildTree(this.rootPath, '');
    return this.root;
  }

  /**
   * Compare two trees and return differences
   */
  static diff(oldTree, newTree, basePath = '') {
    const differences = {
      added: [],
      modified: [],
      deleted: [],
    };

    if (!oldTree && newTree) {
      // Entire subtree added
      differences.added.push(basePath);
      return differences;
    }

    if (oldTree && !newTree) {
      // Entire subtree deleted
      differences.deleted.push(basePath);
      return differences;
    }

    if (!oldTree || !newTree) {
      return differences;
    }

    // If hashes match, no changes in this subtree
    if (oldTree.hash === newTree.hash) {
      return differences;
    }

    // Hashes differ - check children
    if (oldTree.type === 'file' && newTree.type === 'file') {
      // File modified
      differences.modified.push(basePath);
    } else if (oldTree.type === 'directory' && newTree.type === 'directory') {
      // Compare children
      const oldChildren = oldTree.children || {};
      const newChildren = newTree.children || {};
      const allNames = new Set([...Object.keys(oldChildren), ...Object.keys(newChildren)]);

      for (const name of allNames) {
        const childPath = path.join(basePath, name).replace(/\\/g, '/');
        const oldChild = oldChildren[name];
        const newChild = newChildren[name];

        const childDiff = MerkleTree.diff(oldChild, newChild, childPath);
        differences.added.push(...childDiff.added);
        differences.modified.push(...childDiff.modified);
        differences.deleted.push(...childDiff.deleted);
      }
    }

    return differences;
  }

  /**
   * Save tree to file
   */
  async save(filePath) {
    if (!this.root) {
      throw new Error('Tree not built. Call build() first.');
    }

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(this.root.toJSON(), null, 2));
  }

  /**
   * Load tree from file
   */
  static async load(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const json = JSON.parse(data);
      return MerkleNode.fromJSON(json);
    } catch (_err) {
      return null;
    }
  }
}

module.exports = { MerkleTree, MerkleNode };
