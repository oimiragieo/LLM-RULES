'use strict';

/**
 * Simple YAML parser for workflow definitions
 * Handles basic YAML structures: objects, arrays, strings, numbers, booleans
 *
 * @param {string} yamlString - YAML content to parse
 * @returns {Object} Parsed workflow definition
 */
function parseWorkflow(yamlString) {
  if (!yamlString || typeof yamlString !== 'string' || yamlString.trim() === '') {
    throw new Error('Workflow definition is empty or invalid');
  }

  try {
    // Remove comments and normalize line endings
    const lines = yamlString
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('#');
        if (commentIndex >= 0) {
          // Don't remove # in quoted strings
          const beforeComment = line.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;
          if (quoteCount % 2 === 0) {
            return beforeComment;
          }
        }
        return line;
      });

    return parseYamlLines(lines, 0).result;
  } catch (e) {
    if (e.message.includes('empty')) throw e;
    throw new Error(`Invalid YAML: ${e.message}`);
  }
}

/**
 * Parse YAML lines recursively
 */
function parseYamlLines(lines, startIndent) {
  const result = {};
  let i = 0;
  let isArray = false;
  const arrayResult = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Calculate indent
    const indent = line.length - trimmed.length;

    // If less indented, return to parent
    if (indent < startIndent && trimmed !== '') {
      break;
    }

    // Check for array item
    if (trimmed.startsWith('- ')) {
      isArray = true;
      const afterDash = trimmed.substring(2);
      const value = afterDash.trim();

      // Check if it's a key-value pair in array (e.g., "- id: step1")
      const colonMatch = value.match(/^([^:]+):\s*(.*)/);
      if (colonMatch) {
        const key = colonMatch[1].trim();
        const val = colonMatch[2].trim();

        // Build the item object
        const item = {};
        if (val !== '') {
          item[key] = parseValue(val);
        }

        // Check for nested content under this array item
        // Nested content is indented more than the "- " (indent + 2)
        let j = i + 1;
        const itemIndent = indent + 2;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trimStart();
          if (nextTrimmed === '') {
            j++;
            continue;
          }
          const nextIndent = nextLine.length - nextTrimmed.length;
          if (nextIndent < itemIndent) {
            break;
          }

          // Parse this nested line
          if (nextTrimmed.includes(':')) {
            const nestedColon = nextTrimmed.indexOf(':');
            const nestedKey = nextTrimmed.substring(0, nestedColon).trim();
            const nestedVal = nextTrimmed.substring(nestedColon + 1).trim();

            if (nestedVal === '' || nestedVal === '|' || nestedVal === '>') {
              // Has deeper nested content
              const deepLines = lines.slice(j + 1);
              let deepIndent = -1;
              for (const dl of deepLines) {
                const dt = dl.trimStart();
                if (dt !== '') {
                  deepIndent = dl.length - dt.length;
                  break;
                }
              }
              if (deepIndent > nextIndent) {
                const nested = parseYamlLines(deepLines, deepIndent);
                item[nestedKey] = nested.isArray ? nested.arrayResult : nested.result;
                j += nested.linesConsumed + 1;
              } else {
                item[nestedKey] = null;
                j++;
              }
            } else {
              item[nestedKey] = parseValue(nestedVal);
              j++;
            }
          } else {
            j++;
          }
        }

        // If val was empty but we had nested content under that key
        if (val === '' && !item[key]) {
          // Check if there's nested content for this key
          const nestedLines = lines.slice(i + 1);
          let nestedIndent = -1;
          for (const nl of nestedLines) {
            const nt = nl.trimStart();
            if (nt !== '') {
              nestedIndent = nl.length - nt.length;
              break;
            }
          }
          if (nestedIndent > indent + 2) {
            const nested = parseYamlLines(nestedLines, nestedIndent);
            item[key] = nested.isArray ? nested.arrayResult : nested.result;
          }
        }

        arrayResult.push(item);
        i = j;
      } else if (value === '') {
        // Array item with nested object (e.g., "- \n    key: value")
        const nextLine = lines[i + 1];
        if (nextLine) {
          const nextTrimmed = nextLine.trimStart();
          const nextIndent = nextLine.length - nextTrimmed.length;
          if (nextIndent > indent) {
            const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
            arrayResult.push(nested.isArray ? nested.arrayResult : nested.result);
            i += nested.linesConsumed + 1;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else {
        // Simple array value (e.g., "- value")
        arrayResult.push(parseValue(value));
        i++;
      }
      continue;
    }

    // Check for key-value pair
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const afterColon = trimmed.substring(colonIndex + 1);
      const value = afterColon.trim();

      if (value === '' || value === '|' || value === '>') {
        // Nested object or multiline string
        // Find next non-empty line to determine indent
        let nextIndent = -1;
        for (let k = i + 1; k < lines.length; k++) {
          const nextTrimmed = lines[k].trimStart();
          if (nextTrimmed !== '') {
            nextIndent = lines[k].length - nextTrimmed.length;
            break;
          }
        }

        if (nextIndent > indent) {
          const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
          result[key] = nested.isArray ? nested.arrayResult : nested.result;
          i += nested.linesConsumed + 1;
        } else {
          result[key] = null;
          i++;
        }
      } else {
        result[key] = parseValue(value);
        i++;
      }
    } else if (trimmed.endsWith(':')) {
      // Just a key without value (e.g., "key:")
      const key = trimmed.slice(0, -1).trim();
      // Find next non-empty line to determine indent
      let nextIndent = -1;
      for (let k = i + 1; k < lines.length; k++) {
        const nextTrimmed = lines[k].trimStart();
        if (nextTrimmed !== '') {
          nextIndent = lines[k].length - nextTrimmed.length;
          break;
        }
      }

      if (nextIndent > indent) {
        const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
        result[key] = nested.isArray ? nested.arrayResult : nested.result;
        i += nested.linesConsumed + 1;
      } else {
        result[key] = null;
        i++;
      }
    } else {
      i++;
    }
  }

  return {
    result: isArray ? arrayResult : result,
    isArray,
    arrayResult,
    linesConsumed: i,
  };
}

/**
 * Parse a YAML value
 */
function parseValue(value) {
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Validate a workflow definition
 *
 * @param {Object} workflow - Parsed workflow definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorkflow(workflow) {
  const errors = [];

  // Required fields
  if (!workflow.name) {
    errors.push('Missing required field: name');
  }

  if (!workflow.phases) {
    errors.push('Missing required field: phases');
  }

  // Validate step IDs are unique
  if (workflow.phases) {
    const stepIds = new Set();

    for (const [phaseName, phaseConfig] of Object.entries(workflow.phases)) {
      if (phaseConfig && phaseConfig.steps) {
        for (const step of phaseConfig.steps) {
          if (step.id) {
            if (stepIds.has(step.id)) {
              errors.push(`Duplicate step ID: ${step.id} in phase ${phaseName}`);
            }
            stepIds.add(step.id);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  parseWorkflow,
  validateWorkflow,
};
