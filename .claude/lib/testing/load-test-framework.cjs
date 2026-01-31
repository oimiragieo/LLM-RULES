/**
 * Load Test Framework
 *
 * Simulates concurrent workflows, large codebases, and resource constraints
 * to test framework performance at enterprise scale.
 *
 * Usage:
 *   const LoadTestFramework = require('.claude/lib/testing/load-test-framework.cjs');
 *   const framework = new LoadTestFramework({ concurrentWorkflows: 100 });
 *   const workflows = await framework.simulateConcurrentWorkflows(100, 'even');
 */

const fs = require('node:fs').promises;
const path = require('node:path');
const os = require('node:os');

// Maximum number of metrics to retain (prevents memory leaks)
const MAX_METRICS = 1000;

class LoadTestFramework {
  constructor(config = {}) {
    this.concurrentWorkflows = config.concurrentWorkflows || 100;
    this.codebaseSize = config.codebaseSize || 50000; // LOC
    this.resourceLimits = config.resourceLimits || {
      memoryMB: 300,
      cpuPercent: 80,
    };
    this.testMode = config.testMode !== false; // Default to testMode for faster tests
    this.tempDir = null;
    this.workflows = [];
    this.metrics = {
      spawnTimes: [],
      memoryUsage: [],
      throughput: [],
    };
  }

  /**
   * Bound a metrics array to MAX_METRICS size
   * @private
   */
  _boundMetricsArray(arrayName) {
    if (this.metrics[arrayName].length > MAX_METRICS) {
      this.metrics[arrayName].shift(); // Remove oldest
    }
  }

  async setup() {
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'load-test-'));
  }

  async cleanup() {
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    }
    this.workflows = [];
    this.metrics = { spawnTimes: [], memoryUsage: [], throughput: [] };
  }

  /**
   * Simulate N concurrent workflows with specified traffic pattern
   *
   * @param {number} count - Number of workflows to simulate
   * @param {string} pattern - Traffic pattern: 'even', 'bursty', 'random'
   * @returns {Promise<Array>} Simulated workflows
   */
  async simulateConcurrentWorkflows(count, pattern = 'even') {
    const workflows = [];
    const delays = this.generateDelays(count, pattern);

    for (let i = 0; i < count; i++) {
      const startTime = Date.now();
      await this.sleep(delays[i]);

      const workflow = await this.createWorkflow(`workflow-${i}`, {
        tasks: Math.floor(Math.random() * 10) + 5, // 5-15 tasks
        phases: Math.floor(Math.random() * 3) + 3, // 3-5 phases
      });

      const spawnTime = Date.now() - startTime - delays[i];
      this.metrics.spawnTimes.push(spawnTime);
      if (this.metrics.spawnTimes.length > MAX_METRICS) {
        this.metrics.spawnTimes.shift(); // Remove oldest
      }
      workflows.push(workflow);
    }

    this.workflows = workflows;
    return workflows;
  }

  /**
   * Create a simulated workflow
   *
   * @param {string} id - Workflow ID
   * @param {object} config - Workflow configuration
   * @returns {Promise<object>} Workflow object
   */
  async createWorkflow(id, config) {
    const tasks = [];
    for (let i = 0; i < config.tasks; i++) {
      tasks.push({
        id: `${id}-task-${i}`,
        status: 'pending',
        data: { phase: Math.ceil((i + 1) / (config.tasks / config.phases)) },
      });
    }

    return {
      id,
      status: 'running',
      tasks,
      phases: config.phases,
      createdAt: Date.now(),
    };
  }

  /**
   * Generate traffic delays based on pattern
   *
   * @param {number} count - Number of delays
   * @param {string} pattern - Traffic pattern
   * @returns {Array<number>} Delays in ms
   */
  generateDelays(count, pattern) {
    const delays = [];
    // Use scaled-down delays for faster test execution
    const scale = this.testMode ? 0.01 : 1.0; // testMode reduces delays by 100x

    switch (pattern) {
      case 'even':
        // Evenly distributed over 500ms (scaled from 5s)
        const interval = (500 * scale) / count;
        for (let i = 0; i < count; i++) {
          delays.push(i * interval);
        }
        break;

      case 'bursty':
        // All requests within 100ms (scaled from 1s)
        for (let i = 0; i < count; i++) {
          delays.push(Math.random() * 100 * scale);
        }
        break;

      case 'random':
        // Random delays up to 1s (scaled from 10s)
        for (let i = 0; i < count; i++) {
          delays.push(Math.random() * 1000 * scale);
        }
        break;

      default:
        throw new Error(`Unknown pattern: ${pattern}`);
    }

    return delays.sort((a, b) => a - b);
  }

  /**
   * Simulate a large codebase
   *
   * @param {number} sizeInLOC - Total lines of code
   * @returns {Promise<object>} Codebase simulation
   */
  async simulateLargeCodebase(sizeInLOC) {
    const avgLOCPerFile = 500;
    const fileCount = Math.ceil(sizeInLOC / avgLOCPerFile);
    const files = [];

    for (let i = 0; i < fileCount; i++) {
      const loc = Math.min(avgLOCPerFile, sizeInLOC - i * avgLOCPerFile);
      files.push({
        path: `src/module${Math.floor(i / 10)}/file${i}.js`,
        loc,
        type: 'javascript',
      });
    }

    return {
      totalLOC: sizeInLOC,
      files,
      fileCount,
      languages: ['javascript'],
      frameworks: ['Node.js'],
    };
  }

  /**
   * Run brownfield detection on simulated codebase
   *
   * @param {object} codebase - Codebase object
   * @returns {Promise<object>} Detection results
   */
  async runBrownfieldDetection(codebase) {
    // Simulate detection logic
    await this.sleep(Math.min(codebase.totalLOC / 1000, 5000)); // Scale with size, max 5s

    return {
      languages: codebase.languages || ['javascript'],
      frameworks: codebase.frameworks || ['Node.js'],
      confidence: 0.9,
      detectedFiles: codebase.files.length,
    };
  }

  /**
   * Apply resource constraints
   *
   * @param {number} memoryMB - Memory limit in MB
   * @param {number} cpuPercent - CPU limit percentage
   */
  async applyResourceConstraints(memoryMB, cpuPercent) {
    this.resourceLimits.memoryMB = memoryMB;
    this.resourceLimits.cpuPercent = cpuPercent;

    // Simulate constraint checking
    const currentMem = process.memoryUsage().heapUsed / 1024 / 1024;
    if (currentMem > memoryMB * 0.9) {
      // Approaching limit, trigger GC
      global.gc?.();
    }
  }

  /**
   * Measure task spawn time for workflows
   *
   * @param {Array} workflows - Workflows to measure
   * @returns {Promise<Array<number>>} Spawn times in ms
   */
  async measureTaskSpawnTime(workflows) {
    if (workflows.length === 0) {
      return this.metrics.spawnTimes;
    }

    const spawnTimes = [];
    for (const _workflow of workflows.slice(0, 10)) {
      // Sample 10 workflows
      const startTime = Date.now();
      await this.simulateTaskOperation();
      spawnTimes.push(Date.now() - startTime);
    }

    return spawnTimes;
  }

  /**
   * Simulate a single task operation
   *
   * @returns {Promise<void>}
   */
  async simulateTaskOperation() {
    // Simulate task creation overhead (5-10ms in test mode, 50-100ms in normal mode)
    const baseDelay = this.testMode ? 5 : 50;
    const variance = this.testMode ? 5 : 50;
    await this.sleep(baseDelay + Math.random() * variance);
  }

  /**
   * Measure throughput (tasks per second)
   *
   * @param {number} workflowCount - Number of workflows to test
   * @returns {Promise<number>} Tasks per second
   */
  async measureThroughput(workflowCount) {
    const startTime = Date.now();
    let taskCount = 0;

    for (let i = 0; i < workflowCount; i++) {
      const workflow = await this.createWorkflow(`throughput-${i}`, {
        tasks: 10,
        phases: 3,
      });
      taskCount += workflow.tasks.length;
      // Add small delay to ensure measurable duration
      await this.sleep(1);
    }

    const duration = Math.max((Date.now() - startTime) / 1000, 0.001); // seconds, min 1ms
    const throughput = taskCount / duration;
    this.metrics.throughput.push(throughput);
    if (this.metrics.throughput.length > MAX_METRICS) {
      this.metrics.throughput.shift(); // Remove oldest
    }
    return throughput;
  }

  /**
   * Generate load test report
   *
   * @returns {Promise<string>} Markdown report
   */
  async generateLoadTestReport() {
    const avgSpawnTime =
      this.metrics.spawnTimes.length > 0
        ? this.metrics.spawnTimes.reduce((a, b) => a + b, 0) / this.metrics.spawnTimes.length
        : 0;

    const peakMemory = Math.max(
      ...this.metrics.memoryUsage,
      process.memoryUsage().heapUsed / 1024 / 1024
    );

    const report = `# Load Test Report

## Summary

- **Total Workflows**: ${this.workflows.length}
- **Average Spawn Time**: ${avgSpawnTime.toFixed(2)}ms
- **Peak Memory**: ${peakMemory.toFixed(2)}MB
- **Resource Limits**: ${this.resourceLimits.memoryMB}MB memory, ${this.resourceLimits.cpuPercent}% CPU

## Performance Metrics

- **Spawn Times**: min=${Math.min(...this.metrics.spawnTimes)}ms, max=${Math.max(...this.metrics.spawnTimes)}ms, avg=${avgSpawnTime.toFixed(2)}ms
- **Memory Usage**: ${peakMemory.toFixed(2)}MB
- **Throughput**: ${this.metrics.throughput.length > 0 ? this.metrics.throughput[this.metrics.throughput.length - 1].toFixed(2) : 'N/A'} tasks/sec
- **Latency**: p50=${avgSpawnTime.toFixed(0)}ms, p99=${(avgSpawnTime * 1.5).toFixed(0)}ms (estimated)

## Baseline Comparison

Comparing against baseline performance targets:
- Spawn Time Target: <5000ms - ${avgSpawnTime < 5000 ? '✅ PASS' : '❌ FAIL'}
- Memory Target: <${this.resourceLimits.memoryMB}MB - ${peakMemory < this.resourceLimits.memoryMB ? '✅ PASS' : '❌ FAIL'}

## Performance Degradation

${avgSpawnTime > 5000 ? '⚠️ WARNING: Spawn time exceeded target' : '✅ Performance within acceptable range'}
`;

    return report;
  }

  /**
   * Sleep helper
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LoadTestFramework;
