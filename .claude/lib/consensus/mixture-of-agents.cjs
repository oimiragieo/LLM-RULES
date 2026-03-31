'use strict';

/**
 * Mixture-of-Agents (MoA) Consensus Tool
 * =======================================
 *
 * Fans out a prompt to N configurable model backends, collects all responses
 * concurrently via Promise.allSettled(), and synthesizes a single consensus
 * answer from the successful responses.
 *
 * Architecture:
 *   1. runConsensus() dispatches the prompt to all N models in parallel.
 *   2. Promise.allSettled() collects results without short-circuiting on failure.
 *   3. Successful responses are merged by the synthesize function.
 *   4. Failed models are recorded in the errors array.
 *
 * Error resilience:
 *   - Consensus is produced from as few as 1 successful response.
 *   - If ALL models fail, consensus is null and errors lists every model.
 *
 * Testability:
 *   - The dispatcher function is injected via options.dispatcher.
 *   - Tests supply mock dispatchers that resolve/reject to simulate model behavior.
 *   - The synthesizer function is also injectable via options.synthesize.
 *
 * @module consensus/mixture-of-agents
 */

// ---------------------------------------------------------------------------
// Default dispatcher
// ---------------------------------------------------------------------------

/**
 * Default dispatcher — throws an error because no real backend is configured.
 * Replace with a real implementation by passing options.dispatcher.
 *
 * @param {string} model  Model identifier
 * @param {string} _prompt  The user prompt
 * @returns {Promise<string>}
 */
async function _defaultDispatcher(model, _prompt) {
  throw new Error(
    `No dispatcher configured for model "${model}". ` +
      'Pass options.dispatcher to runConsensus() to provide a backend.'
  );
}

// ---------------------------------------------------------------------------
// Default synthesizer
// ---------------------------------------------------------------------------

/**
 * Default synthesizer — merges an array of successful model responses into a
 * single consensus string.
 *
 * When only one response is available it is returned verbatim.
 * When multiple responses are available they are concatenated with labels so
 * downstream callers can tell them apart; a caller that wants smarter
 * aggregation (e.g. an LLM-based summariser) should inject a custom
 * options.synthesize function.
 *
 * @param {Array<{model: string, response: string}>} responses  Successful responses
 * @returns {string}
 */
function _defaultSynthesize(responses) {
  if (responses.length === 0) {
    return null;
  }
  if (responses.length === 1) {
    return responses[0].response;
  }
  return responses.map((r, i) => `[${i + 1}. ${r.model}]\n${r.response}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ConsensusResult
 * @property {string|null} consensus  Synthesized answer, or null if all models failed.
 * @property {Array<{model: string, response: string}>} responses  Successful responses.
 * @property {Array<{model: string, error: string}>}    errors     Failed model records.
 */

/**
 * Run a Mixture-of-Agents consensus over the supplied models.
 *
 * @param {string}   prompt          The prompt to dispatch to each model.
 * @param {string[]} models          List of model identifiers to fan out to.
 * @param {Object}   [options={}]    Optional configuration.
 * @param {Function} [options.dispatcher]
 *   async (model: string, prompt: string) => string
 *   Called once per model. Defaults to a no-op that rejects with an error.
 * @param {Function} [options.synthesize]
 *   (responses: Array<{model, response}>) => string|null
 *   Merges successful responses into the consensus. Defaults to a simple
 *   concatenation with model labels.
 * @returns {Promise<ConsensusResult>}
 */
async function runConsensus(prompt, models, options = {}) {
  const dispatcher =
    typeof options.dispatcher === 'function' ? options.dispatcher : _defaultDispatcher;
  const synthesize =
    typeof options.synthesize === 'function' ? options.synthesize : _defaultSynthesize;

  // Fan out all model calls concurrently; never short-circuit on failure.
  const settled = await Promise.allSettled(models.map(model => dispatcher(model, prompt)));

  /** @type {Array<{model: string, response: string}>} */
  const responses = [];
  /** @type {Array<{model: string, error: string}>} */
  const errors = [];

  settled.forEach((result, index) => {
    const model = models[index];
    if (result.status === 'fulfilled') {
      responses.push({ model, response: result.value });
    } else {
      const reason = result.reason;
      const error = reason instanceof Error ? reason.message : String(reason);
      errors.push({ model, error });
    }
  });

  const consensus = responses.length > 0 ? synthesize(responses) : null;

  return { consensus, responses, errors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { runConsensus };
