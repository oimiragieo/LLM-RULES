'use strict';

function buildTemplate({
  candidateAbstract,
  candidateOverview,
  candidateContent,
  existingMemories,
}) {
  const lines = [
    'Determine how to handle this candidate memory.',
    '',
    '**Candidate Memory**:',
    `Abstract: ${candidateAbstract}`,
    `Overview: ${candidateOverview}`,
    `Content: ${candidateContent}`,
    '',
    '**Existing Similar Memories**:',
    existingMemories,
    '',
    'Please decide the operation type:',
    '- CREATE: This is a completely new memory, should be created',
    '- UPDATE: Candidate memory is a supplement/update to existing memory, should update the most relevant one',
    '- MERGE: Candidate memory is related to multiple existing memories, should be merged',
    '- SKIP: Candidate memory duplicates existing memories, no need to save',
    '',
    'Return JSON format:',
    '{',
    '  "decision": "create|update|merge|skip",',
    '  "reason": "Decision reason",',
    '  "merged_content": "If UPDATE or MERGE, provide merged L2 content"',
    '}',
    '',
    'Notes:',
    '- If candidate memory provides new information, choose UPDATE or MERGE',
    '- If candidate memory is completely duplicate, choose SKIP',
    '- If candidate memory is a new topic, choose CREATE',
    '- merged_content is only needed for UPDATE/MERGE, and should be complete L2 content',
  ];

  return lines.join('\n');
}

function getDedupDecisionPrompt(
  candidateContent,
  candidateAbstract,
  candidateOverview,
  existingMemories
) {
  const safeContent = candidateContent ? String(candidateContent) : '';
  const safeAbstract = candidateAbstract ? String(candidateAbstract) : '';
  const safeOverview = candidateOverview ? String(candidateOverview) : '';
  const safeExisting = existingMemories ? String(existingMemories) : '';

  return {
    system:
      'You decide whether to create, update, merge, or skip candidate memories and return strict JSON.',
    user: buildTemplate({
      candidateAbstract: safeAbstract,
      candidateOverview: safeOverview,
      candidateContent: safeContent,
      existingMemories: safeExisting,
    }),
  };
}

module.exports = { getDedupDecisionPrompt };
