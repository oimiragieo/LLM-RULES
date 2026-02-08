/**
 * PatternDetector.cjs
 *
 * SPEC-023: Core engine for identifying workflow patterns using ML.
 * Coordinates FeatureEngineer and Clustering models.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const FeatureEngineer = require('./feature-engineer.cjs');
const KMeans = require('./models/clustering.cjs');

class PatternDetector {
  constructor(config = {}) {
    this.featureEngineer = new FeatureEngineer();
    this.clusteringModel = new KMeans(config.k || 5);
    this.trainingData = [];
    this.isTrained = false;
  }

  /**
   * Reset training state (clears ingested feature vectors and marks untrained).
   * Useful when rebuilding training from persisted session logs.
   */
  resetTraining() {
    this.trainingData = [];
    this.isTrained = false;
  }

  /**
   * Add a completed session to the training set.
   * @param {Object} session - Raw session object
   */
  ingest(session) {
    const features = this.featureEngineer.extractFeatures(session);
    this.trainingData.push(features);
    // In a real system, we might trigger re-training here or periodically
  }

  /**
   * Train the internal models on ingested data.
   */
  train() {
    if (this.trainingData.length < this.clusteringModel.k) {
      console.warn(
        '[PatternDetector] Not enough data to train. Need ' + this.clusteringModel.k + ' samples.'
      );
      return;
    }

    const result = this.clusteringModel.fit(this.trainingData);
    this.isTrained = true;
    return result;
  }

  /**
   * Disable "shadow mode" and return active predictions for a session.
   * @param {Object} session
   */
  analyze(session) {
    if (!this.isTrained) {
      return { patternId: -1, confidence: 0, reason: 'Model not trained' };
    }

    const features = this.featureEngineer.extractFeatures(session);
    const prediction = this.clusteringModel.predict(features);

    return {
      patternId: prediction.clusterId,
      distance: prediction.distance,
      features,
      // In V2, we would calculate distance-to-centroid as confidence
      confidence: Math.max(0, 1.0 - prediction.distance),
    };
  }

  /**
   * Save the current model state to disk.
   * @param {string} filepath
   */
  saveModel(filepath) {
    if (!this.isTrained) return;
    const state = this.clusteringModel.serialize();
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  }

  /**
   * Load a model state from disk.
   * @param {string} filepath
   */
  loadModel(filepath) {
    if (!fs.existsSync(filepath)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      this.clusteringModel = KMeans.deserialize(data);
      this.isTrained = true;
      return true;
    } catch (err) {
      console.error('[PatternDetector] Failed to load model:', err);
      return false;
    }
  }
}

module.exports = PatternDetector;
