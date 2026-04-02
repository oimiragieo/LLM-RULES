#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  ROUTING_TABLE,
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
} = require('../../lib/routing/routing-table.cjs');
const { DOMAIN_ROUTING_TABLE } = require('../../lib/routing/routing-table-hierarchical.cjs');
const {
  DOMAIN_SUB_ROUTERS,
  SUB_ROUTER_CONFIG,
} = require('../../lib/routing/sub-router-selection.cjs');
const { EmbeddingGenerator } = require('../../lib/code-indexing/embedding-generator.cjs');

const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');
const AGENT_SKILL_MATRIX_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'config',
  'agent-skill-matrix.json'
);

function addPhrases(byAgent, agentId, phrases = []) {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) {
    return;
  }

  if (!byAgent.has(normalizedAgentId)) {
    byAgent.set(normalizedAgentId, []);
  }

  const bucket = byAgent.get(normalizedAgentId);
  for (const phrase of phrases) {
    const normalizedPhrase = String(phrase || '').trim();
    if (!normalizedPhrase) {
      continue;
    }
    bucket.push(normalizedPhrase);
  }
}

function loadAgentRegistry() {
  try {
    if (fs.existsSync(AGENT_REGISTRY_PATH)) {
      const registry = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
      if (registry && registry.agents) {
        return registry;
      }
    }
  } catch (_err) {
    // best-effort; ignore registry load failures
  }

  return null;
}

function collectRegistryPhrases(byAgent, registry) {
  if (!registry || !registry.agents) {
    return;
  }

  for (const [agentId, card] of Object.entries(registry.agents)) {
    if (DOMAIN_SUB_ROUTERS.includes(agentId)) {
      continue;
    }

    const phrases = [agentId, card?.displayName, card?.category];

    for (const capability of card?.capabilities || []) {
      phrases.push(capability?.name, capability?.domain, capability?.description);
      if (Array.isArray(capability?.triggerPhrases)) phrases.push(...capability.triggerPhrases);
      if (Array.isArray(capability?.examples)) phrases.push(...capability.examples);
      if (Array.isArray(capability?.tags)) phrases.push(...capability.tags);
    }

    if (Array.isArray(card?.alwaysSkills)) {
      phrases.push(...card.alwaysSkills);
    }

    addPhrases(byAgent, agentId, phrases);
  }
}

function chunkTerms(terms, size = 12) {
  const chunks = [];
  for (let index = 0; index < terms.length; index += size) {
    chunks.push(terms.slice(index, index + size));
  }
  return chunks;
}

function collectFlatRoutingPhrases(byAgent) {
  for (const [keyword, agentId] of Object.entries(ROUTING_TABLE)) {
    const phrase = keyword.length >= 3 ? keyword : `task about ${keyword}`;
    addPhrases(byAgent, agentId, [phrase]);
  }

  for (const [intentKey, phrases] of Object.entries(INTENT_KEYWORDS)) {
    const agentId = INTENT_TO_AGENT[intentKey];
    if (!agentId || !Array.isArray(phrases)) continue;
    addPhrases(byAgent, agentId, phrases);
  }
}

function collectSubRouterPhrases(byAgent) {
  for (const subRouter of DOMAIN_SUB_ROUTERS) {
    const config = SUB_ROUTER_CONFIG[subRouter];
    if (!config) continue;

    const domainKeywords = Object.entries(DOMAIN_ROUTING_TABLE)
      .filter(([, entry]) => entry?.router === subRouter)
      .map(([keyword]) => keyword);
    const ruleAgents = config.rules.map(rule => rule.agent);
    const ruleSignals = config.rules.flatMap(rule => rule.signals || []);
    const uniqueTerms = Array.from(
      new Set([config.domain.replace(/-/g, ' '), ...domainKeywords, ...ruleSignals, ...ruleAgents])
    );
    const summaryPhrases = [
      `${config.domain} domain router for ${domainKeywords.slice(0, 20).join(' ')}`,
      `${config.domain} specialist router defaulting to ${config.defaultAgent}`,
      ...config.rules.map(
        rule =>
          `${config.domain} route ${rule.agent} for ${(rule.signals || []).slice(0, 4).join(' ')}`
      ),
      ...chunkTerms(uniqueTerms).map(chunk => `${config.domain} ${chunk.join(' ')}`),
    ];

    addPhrases(byAgent, subRouter, [
      subRouter,
      config.domain,
      `${config.domain} domain router`,
      `${config.domain} specialist router`,
      `${config.domain} sub router`,
      `delegate ${config.domain} requests`,
      `route ${config.domain} prompts`,
      config.defaultAgent,
      ...summaryPhrases,
      ...domainKeywords,
      ...ruleAgents,
      ...ruleSignals,
    ]);
  }
}

/**
 * Collect skill description phrases per agent from skill-index + agent-skill-matrix.
 * Primary skills are weighted 2x (description added twice), secondary/always 1x.
 * This enriches agent prototypes with fine-grained skill capabilities.
 */
function collectSkillPhrases(byAgent) {
  let skillIndex, matrix;
  try {
    if (!fs.existsSync(SKILL_INDEX_PATH) || !fs.existsSync(AGENT_SKILL_MATRIX_PATH)) return;
    skillIndex = safeParseJSON(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
    matrix = safeParseJSON(fs.readFileSync(AGENT_SKILL_MATRIX_PATH, 'utf8'));
    if (!skillIndex?.skills || !matrix?.agents) return;
  } catch (_e) {
    return;
  }

  const skills = skillIndex.skills;

  // Flatten matrix: { category: { agentId: { primary, secondary, always } } } → per-agent skill tiers
  for (const category of Object.values(matrix.agents)) {
    if (!category || typeof category !== 'object') continue;
    for (const [agentId, tiers] of Object.entries(category)) {
      if (!tiers || typeof tiers !== 'object') continue;

      const primarySkills = Array.isArray(tiers.primary) ? tiers.primary : [];
      const secondarySkills = Array.isArray(tiers.secondary) ? tiers.secondary : [];
      const alwaysSkills = Array.isArray(tiers.always) ? tiers.always : [];

      // Primary skills: description added 2x for weighting
      for (const skillName of primarySkills) {
        const skill = skills[skillName];
        if (skill?.description) {
          addPhrases(byAgent, agentId, [skill.description, skill.description]);
        }
      }

      // Secondary + always: description added 1x
      for (const skillName of [...secondarySkills, ...alwaysSkills]) {
        const skill = skills[skillName];
        if (skill?.description) {
          addPhrases(byAgent, agentId, [skill.description]);
        }
      }
    }
  }
}

/**
 * Generate per-skill prototype vectors with owner metadata.
 * Each skill is embedded from its description + category + domain + tags.
 * Returns: { skillName: { vector: number[], owners: string[] } }
 */
async function generateSkillPrototypes(generator) {
  let skillIndex, matrix;
  try {
    if (!fs.existsSync(SKILL_INDEX_PATH)) return {};
    skillIndex = safeParseJSON(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
    if (!skillIndex?.skills) return {};
  } catch (_e) {
    return {};
  }
  try {
    matrix = fs.existsSync(AGENT_SKILL_MATRIX_PATH)
      ? safeParseJSON(fs.readFileSync(AGENT_SKILL_MATRIX_PATH, 'utf8'))
      : null;
  } catch (_e) {
    matrix = null;
  }

  // Build owner map from matrix: skillName → [agentIds]
  const ownerMap = new Map();
  if (matrix?.agents) {
    for (const category of Object.values(matrix.agents)) {
      if (!category || typeof category !== 'object') continue;
      for (const [agentId, tiers] of Object.entries(category)) {
        const allSkills = [
          ...(Array.isArray(tiers.primary) ? tiers.primary : []),
          ...(Array.isArray(tiers.secondary) ? tiers.secondary : []),
          ...(Array.isArray(tiers.always) ? tiers.always : []),
        ];
        for (const s of allSkills) {
          if (!ownerMap.has(s)) ownerMap.set(s, new Set());
          ownerMap.get(s).add(agentId);
        }
      }
    }
  }

  // Also use agentPrimary from skill-index as fallback owners
  const skills = skillIndex.skills;
  const skillPrototypes = {};
  const entries = Object.entries(skills);
  console.error(`Embedding ${entries.length} skill prototypes...`);

  for (const [skillName, skill] of entries) {
    if (!skill.description) continue;
    const text = [
      skill.description,
      skill.category ? `Category: ${skill.category}` : '',
      skill.domain ? `Domain: ${skill.domain}` : '',
      Array.isArray(skill.tags) ? `Tags: ${skill.tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('. ');

    try {
      const embedding = await generator.embed(text);
      const owners = ownerMap.has(skillName)
        ? Array.from(ownerMap.get(skillName))
        : Array.isArray(skill.agentPrimary)
          ? skill.agentPrimary
          : [];

      skillPrototypes[skillName] = {
        vector: normalizeL2(embedding),
        owners,
      };
    } catch (_e) {
      // Skip skills that fail to embed
    }
  }

  return skillPrototypes;
}

function collectPhrasesPerAgent() {
  const byAgent = new Map();
  const registry = loadAgentRegistry();

  collectRegistryPhrases(byAgent, registry);
  collectFlatRoutingPhrases(byAgent);
  collectSubRouterPhrases(byAgent);
  collectSkillPhrases(byAgent);

  for (const [agentId, phrases] of byAgent.entries()) {
    byAgent.set(agentId, Array.from(new Set(phrases)));
  }

  return byAgent;
}

function normalizeL2(vec) {
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vec;
  return vec.map(value => value / norm);
}

function parseArgs(argv) {
  const args = { output: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function generateRoutingPrototypes(outputPath) {
  const byAgent = collectPhrasesPerAgent();

  const cacheEnabled = process.env.ROUTING_PROTOTYPES_CACHE === '1';
  const cachePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'data',
    'routing-prototypes-embedding-cache.json'
  );
  const generator = new EmbeddingGenerator({ cacheEnabled, cachePath });
  await generator.initialize();

  const dimensions = generator.getDimensions();
  const prototypes = {};
  for (const [agentId, phrases] of byAgent.entries()) {
    if (!phrases.length) continue;
    const embeddings = await generator.batchEmbed(phrases);
    const mean = embeddings[0].map(
      (_, index) => embeddings.reduce((sum, vec) => sum + vec[index], 0) / embeddings.length
    );
    prototypes[agentId] = normalizeL2(mean);
  }

  // Generate per-skill prototypes with owner metadata (dual-level indexing)
  console.error(`Agent prototypes: ${Object.keys(prototypes).length}`);
  const skillPrototypes = await generateSkillPrototypes(generator);
  console.error(`Skill prototypes: ${Object.keys(skillPrototypes).length}`);

  const payload = {
    version: '2.0.0',
    dimensions,
    model: 'Xenova/all-MiniLM-L6-v2',
    generatedAt: new Date().toISOString(),
    prototypes,
    skillPrototypes,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: generate-routing-prototypes [--output <path>]');
    process.exit(0);
  }

  const outputPath =
    args.output || path.join(PROJECT_ROOT, '.claude', 'config', 'routing-prototypes.json');
  await generateRoutingPrototypes(outputPath);
  console.log('Generated routing prototypes.');
}

const wrappedMain = wrapCLITool(main, 'generate-routing-prototypes');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  addPhrases,
  collectPhrasesPerAgent,
  collectRegistryPhrases,
  collectFlatRoutingPhrases,
  collectSubRouterPhrases,
  generateRoutingPrototypes,
  normalizeL2,
  parseArgs,
};
