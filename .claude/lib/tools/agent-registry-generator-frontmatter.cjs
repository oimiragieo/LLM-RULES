'use strict';

const { DOMAIN_MAPPING } = require('./agent-registry-generator-config.cjs');

/**
 * Parse YAML frontmatter from markdown content.
 * @param {string} content
 * @param {{ yaml: any }} deps
 * @returns {Object|null}
 */
function parseAgentFrontmatter(content, deps = {}) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;
  const { yaml = null } = deps;

  try {
    if (yaml) {
      const parsed = yaml.load(frontmatterMatch[1], { schema: yaml.CORE_SCHEMA });
      if (!parsed || !parsed.name || !parsed.description) return null;
      return parsed;
    }
    const parsed = parseSimpleYaml(frontmatterMatch[1]);
    if (!parsed || !parsed.name || !parsed.description) return null;
    return parsed;
  } catch (_error) {
    try {
      const parsed = parseSimpleYaml(frontmatterMatch[1]);
      if (!parsed || !parsed.name || !parsed.description) return null;
      return parsed;
    } catch (_fallbackError) {
      return null;
    }
  }
}

/**
 * Simple YAML parser for basic frontmatter.
 * @param {string} yamlContent
 * @returns {Object}
 */
function parseSimpleYaml(yamlContent) {
  const result = {};
  const lines = yamlContent.split('\n');
  let currentKey = null;
  let inArray = false;
  let arrayValues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (inArray && currentKey) {
      if (trimmed === '[') continue;
      if (trimmed === ']') {
        result[currentKey] = arrayValues;
        arrayValues = [];
        inArray = false;
        currentKey = null;
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const raw = trimmed.slice(2).trim();
        const withoutComment = raw.replace(/\s+#.*$/, '').trim();
        if (withoutComment) arrayValues.push(parseYamlValue(withoutComment));
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex <= 0) {
        const raw = trimmed.replace(/,\s*$/, '').trim();
        const withoutComment = raw.replace(/\s+#.*$/, '').trim();
        if (!withoutComment) continue;

        if (withoutComment.startsWith('[') && withoutComment.endsWith(']')) {
          const arrayContent = withoutComment.slice(1, -1);
          arrayContent
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(v => arrayValues.push(parseYamlValue(v)));
          continue;
        }

        arrayValues.push(parseYamlValue(withoutComment));
        continue;
      }

      result[currentKey] = arrayValues;
      arrayValues = [];
      inArray = false;
      currentKey = null;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        result[key] = arrayContent
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        inArray = false;
        currentKey = null;
        continue;
      }

      if (value === '' || value === '[') {
        currentKey = key;
        inArray = true;
        arrayValues = [];
      } else {
        result[key] = parseYamlValue(value);
        currentKey = null;
      }
    }
  }

  if (inArray && currentKey) {
    result[currentKey] = arrayValues;
  }

  return result;
}

/**
 * Parse a YAML scalar value.
 * @param {string} value
 * @returns {*}
 */
function parseYamlValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Extract trigger phrases from agent metadata.
 * @param {Object} agentDef
 * @param {string} agentId
 * @returns {string[]}
 */
function extractTriggerPhrases(agentDef, agentId) {
  const phrases = [];
  const namePhrases = agentId.split('-').filter(p => p.length > 2);
  phrases.push(...namePhrases);

  if (agentDef.description) {
    const actionWords =
      agentDef.description.match(
        /\b(implement|review|test|debug|design|analyze|fix|build|create|deploy|optimize|refactor|validate|audit|plan|coordinate|orchestrate)\w*/gi
      ) || [];
    phrases.push(...actionWords.map(w => w.toLowerCase()));
  }

  if (agentDef.skills && Array.isArray(agentDef.skills)) {
    phrases.push(...agentDef.skills.filter(s => s.length > 2));
  }

  return [...new Set(phrases)];
}

/**
 * Extract examples and tags from definition metadata.
 * @param {Object} agentDef
 * @param {string[]} triggerPhrases
 * @param {string[]} skills
 * @returns {{ examples: string[], tags: string[] }}
 */
function extractExamplesAndTags(agentDef, triggerPhrases, skills) {
  const examples = Array.isArray(agentDef.examples)
    ? agentDef.examples
    : Array.isArray(agentDef.capability_examples)
      ? agentDef.capability_examples
      : [];
  const tagsFromFrontmatter = Array.isArray(agentDef.tags) ? agentDef.tags : [];
  const tagsFromPhrases = (triggerPhrases || [])
    .flatMap(phrase => phrase.toLowerCase().split(/\s+/))
    .filter(word => word.length > 2);
  const tags = [...new Set([...tagsFromFrontmatter, ...tagsFromPhrases, ...(skills || [])])];
  return { examples, tags };
}

/**
 * Infer domain from definition/agent metadata.
 * @param {Object} agentDef
 * @param {string} agentId
 * @param {string} category
 * @returns {string}
 */
function inferDomain(agentDef, agentId, category) {
  if (agentDef.skills && Array.isArray(agentDef.skills)) {
    for (const skill of agentDef.skills) {
      const skillLower = skill.toLowerCase();
      const domain = DOMAIN_MAPPING[skillLower];
      if (domain) return domain;
    }
  }

  const idLower = agentId.toLowerCase();
  for (const [keyword, domain] of Object.entries(DOMAIN_MAPPING)) {
    if (idLower.includes(keyword)) return domain;
  }

  const categoryDomains = {
    core: 'code',
    specialized: 'code',
    domain: 'code',
    orchestrator: 'orchestration',
  };

  return categoryDomains[category] || 'code';
}

module.exports = {
  parseAgentFrontmatter,
  parseSimpleYaml,
  extractTriggerPhrases,
  extractExamplesAndTags,
  inferDomain,
};
