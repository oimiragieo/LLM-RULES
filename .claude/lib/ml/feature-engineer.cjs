/**
 * FeatureEngineer.cjs
 *
 * Transforms raw workflow execution data into normalized feature vectors
 * for machine learning models (SPEC-023).
 */

'use strict';

class FeatureEngineer {
    constructor() {
        this.agentVocabulary = new Map();
        this.toolVocabulary = new Map();
        this.nextAgentId = 1;
        this.nextToolId = 1;
    }

    /**
     * extracting features from a completed workflow session
     * @param {Object} sessionData - The raw session data (metrics, trace, history)
     * @returns {Object} Normalized feature vector
     */
    extractFeatures(sessionData) {
        const { history = [], metrics = {} } = sessionData;
        const rawLength = history.length;
        // Normalize sequenceLength so long history does not dominate Euclidean distance (0-500 -> 0-1)
        const SEQUENCE_LENGTH_CAP = 500;
        const sequenceLength = Math.max(0, Math.min(1, rawLength / SEQUENCE_LENGTH_CAP));

        const totalDuration = metrics.totalDuration ?? 0;
        const historyLen = Math.max(1, rawLength);

        return {
            // Sequence Features (One-Hot / Integer Encoded)
            agentSequence: this._encodeSequence(history.map(h => h.agent), this.agentVocabulary),
            toolSequence: this._encodeSequence(history.flatMap(h => h.tools || []), this.toolVocabulary),
            sequenceLength,

            // Timing Features (Normalized)
            totalDuration: this._normalize(totalDuration, 0, 3600000), // Max 1 hour
            avgTaskDuration: this._normalize(totalDuration / historyLen, 0, 300000), // Max 5 mins

            // Error Features
            errorRate: (metrics.errorCount ?? 0) / historyLen,
            hasCriticalError: (metrics.criticalErrors ?? 0) > 0 ? 1 : 0,

            // Resource Features
            totalTokens: this._normalize(metrics.tokenUsage ?? 0, 0, 100000), // Max 100k tokens
            peakMemory: this._normalize(metrics.peakMemoryMB ?? 0, 0, 1024), // Max 1GB
        };
    }

    /**
     * Normalize a value between 0 and 1 based on min/max range.
     */
    _normalize(value, min, max) {
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }

    /**
     * Encode a sequence of strings into integer IDs (simplified embedding).
     */
    _encodeSequence(items, vocabulary) {
        return items.map(item => {
            if (!vocabulary.has(item)) {
                vocabulary.set(item, vocabulary.size + 1);
            }
            return vocabulary.get(item);
        });
    }
}

module.exports = FeatureEngineer;
