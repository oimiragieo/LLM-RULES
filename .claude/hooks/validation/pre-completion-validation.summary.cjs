'use strict';

function isValidSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  const trimmed = summary.trim();
  if (trimmed.length < 50) return false;

  const fallbackPatterns = [
    /task\s+\d+\s+completed\s+without\s+summary\s+metadata/i,
    /^task\s+\d+\s+completed\s+without\s+summary/i,
    /^completed\s+without\s+summary/i,
    /^no\s+summary\s+(provided|available|metadata)/i,
    /^task\s+completed$/i,
    /^completed\s+task\s+\d+$/i,
    /^done$/i,
    /^finished$/i,
  ];

  return !fallbackPatterns.some(pattern => pattern.test(trimmed));
}

function isFallbackSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  return /task\s+\d+\s+completed\s+without\s+summary\s+metadata/i.test(summary.trim());
}

function enforceSummaryRequirements({ toolParams, getEnforcementMode, formatHookResult }) {
  const rawSummary = toolParams?.metadata?.summary;
  const summaryMode = getEnforcementMode('PRE_COMPLETION_SUMMARY_ENFORCEMENT', 'block');

  if (summaryMode !== 'off' && !isValidSummary(rawSummary)) {
    const summaryMsg =
      'TaskUpdate(completed) requires metadata.summary. Set PRE_COMPLETION_SUMMARY_ENFORCEMENT=warn to downgrade.';
    if (summaryMode === 'block') {
      console.log(formatHookResult('block', summaryMsg));
      process.exit(2);
    }

    process.stderr.write(
      '[pre-completion-validation] WARNING: TaskUpdate(completed) missing metadata.summary — reflection will be blind\n'
    );
  }

  const summaryRequiredMode = getEnforcementMode('SUMMARY_REQUIRED_ENFORCEMENT', 'block');
  if (summaryRequiredMode === 'off') return;

  const isFallback = isFallbackSummary(rawSummary);
  const isMissingOrShort =
    !rawSummary || typeof rawSummary !== 'string' || rawSummary.trim().length < 50;

  if (!isFallback && !isMissingOrShort) return;

  const blockReason = isFallback
    ? 'summary is the agent fallback string ("Task N completed without summary metadata") — provide a real summary describing what was done'
    : 'summary is missing, empty, or under 50 characters — provide a substantive summary (50+ chars)';
  const summaryRequiredMsg = `TaskUpdate blocked: summary metadata is required (50+ chars, not the fallback string). Reason: ${blockReason}. Set SUMMARY_REQUIRED_ENFORCEMENT=warn to downgrade.`;

  if (summaryRequiredMode === 'block') {
    console.log(formatHookResult('block', summaryRequiredMsg));
    process.exit(2);
  }

  process.stderr.write(
    `[pre-completion-validation] SUMMARY_REQUIRED_ENFORCEMENT WARNING: ${blockReason}\n`
  );
}

module.exports = {
  enforceSummaryRequirements,
  isValidSummary,
  isFallbackSummary,
};
