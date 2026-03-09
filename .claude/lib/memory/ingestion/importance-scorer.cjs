'use strict';

/**
 * Importance Scorer for Memory Ingestion
 * ======================================
 * Assigns an importance rating (0.0 to 1.0) to ingested content.
 * Content below a certain threshold (default 0.5) may not be stored 
 * to conserve LanceDB capacity.
 */

// Simple heuristic keyword weights for fast initial scoring
const HIGH_VALUE_TERMS = [
    'architecture', 'decision', 'security', 'password', 'api key',
    'credential', 'vulnerability', 'error', 'exception', 'critical',
    'refactor', 'schema', 'migration', 'database', 'token', 'auth'
];

const MEDIUM_VALUE_TERMS = [
    'update', 'fix', 'bug', 'issue', 'test', 'config', 'setup',
    'install', 'deploy', 'release', 'version'
];

/**
 * Fast Regex-based heuristic scorer to avoid expensive LLM calls
 * on every single ingested file snippet.
 * 
 * @param {string} text 
 * @returns {number} 0.0 to 1.0
 */
function heuristicScore(text) {
    if (!text) return 0.1;

    const lowerText = text.toLowerCase();
    let score = 0.3; // Baseline score

    // High value triggers
    let highMatches = 0;
    for (const term of HIGH_VALUE_TERMS) {
        if (lowerText.includes(term)) highMatches++;
    }
    score += highMatches * 0.15;

    // Medium value triggers
    let medMatches = 0;
    for (const term of MEDIUM_VALUE_TERMS) {
        if (lowerText.includes(term)) medMatches++;
    }
    score += medMatches * 0.05;

    // Length bonus: very short or very long texts might be 
    // slightly less/more important contextually, but cap it.
    if (text.length > 500) score += 0.1;
    if (text.length > 2000) score += 0.1;

    // Cap at 1.0
    return Math.min(Math.max(score, 0.1), 1.0);
}

/**
 * Main entry point for scoring. Currently uses heuristics.
 * Later phases will integrate `claude-agent-sdk` for advanced semantic scoring.
 * 
 * @param {string} text 
 * @returns {Promise<number>}
 */
async function scoreContent(text) {
    // Simulating an async call for future LLM integration
    return heuristicScore(text);
}

module.exports = {
    scoreContent,
    heuristicScore
};
