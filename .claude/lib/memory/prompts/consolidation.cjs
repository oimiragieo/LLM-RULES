'use strict';

const CONSOLIDATION_SYSTEM_PROMPT = `You consolidate new memory into existing memories.
Return ONLY valid JSON with keys: action (merge|replace|skip), reason, merged_content (optional).
If the new memory is redundant or low value, choose skip.`;

const CONSOLIDATION_USER_PROMPT = `New memory:
{{newMemory}}

Similar existing memories:
{{similarMemories}}

Return JSON like:
{"action":"merge","reason":"...", "merged_content":"..."}
`;

module.exports = {
  CONSOLIDATION_SYSTEM_PROMPT,
  CONSOLIDATION_USER_PROMPT,
};
