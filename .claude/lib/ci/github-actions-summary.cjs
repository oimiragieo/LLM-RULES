'use strict';

function renderSection(title, lines) {
  return [`## ${title}`, ...lines].join('\n');
}

function formatBoolean(value) {
  return value ? 'yes' : 'no';
}

function formatCount(value) {
  const count = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `\`${count}\``;
}

function formatCode(value) {
  return `\`${String(value)}\``;
}

function sortArtifacts(artifacts) {
  return [...artifacts].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function sortCategories(byCategory = {}) {
  return Object.entries(byCategory).sort((left, right) => {
    const countDelta = Number(right[1] || 0) - Number(left[1] || 0);
    if (countDelta !== 0) return countDelta;
    return left[0].localeCompare(right[0]);
  });
}

function buildImpactedValidationSummary(payload = {}) {
  const recommendedCommands = Array.isArray(payload.recommendedCommands)
    ? payload.recommendedCommands.filter(
        command => typeof command === 'string' && command.trim() !== ''
      )
    : [];
  const changedFiles = Array.isArray(payload.changedFiles) ? payload.changedFiles.length : 0;
  const lines = [
    `- Advisory: ${formatBoolean(payload.advisory)}`,
    `- Changed files: ${formatCount(changedFiles)}`,
  ];

  if (payload.rationale) {
    lines.push(`- Rationale: ${String(payload.rationale)}`);
  }

  if (recommendedCommands.length === 0) {
    lines.push('- Recommended commands: none');
  } else {
    lines.push('- Recommended commands:');
    for (const command of recommendedCommands) {
      lines.push(`  - ${formatCode(command)}`);
    }
  }

  return renderSection('Impacted Validation', lines);
}

function buildReleaseGateSummary(payload = {}) {
  const requiredBump = String(payload.requiredBump || 'minor');
  const failures = Array.isArray(payload.failures) ? payload.failures : [];
  const lines = [
    `- Semver class: ${formatCode(requiredBump)}`,
    `- Release path: ${formatCode(requiredBump)}`,
    `- Docs only: ${formatBoolean(payload.docsOnly)}`,
    `- Migration guide required: ${formatBoolean(requiredBump === 'major')}`,
    `- Gate status: ${payload.ok === false ? 'failing' : 'passing'}`,
  ];

  if (failures.length > 0) {
    lines.push('- Failures:');
    for (const failure of failures) {
      lines.push(`  - ${String(failure)}`);
    }
  }

  return renderSection('Release Gate', lines);
}

function buildFailureEvidenceSummary(payload = {}) {
  const artifacts = Array.isArray(payload.artifacts) ? sortArtifacts(payload.artifacts) : [];
  const lines = [`- Artifact count: ${formatCount(artifacts.length)}`];

  if (artifacts.length === 0) {
    lines.push('- Artifacts: none');
    return renderSection('Failure Evidence', lines);
  }

  lines.push('- Artifacts:');
  for (const artifact of artifacts) {
    const label = artifact.url
      ? `[${String(artifact.name)}](${String(artifact.url)})`
      : String(artifact.name || 'unnamed-artifact');
    const details = [artifact.kind || 'artifact', artifact.createdAt || 'unknown-time']
      .map(value => formatCode(value))
      .join(', ');
    lines.push(`  - ${label} (${details})`);
  }

  return renderSection('Failure Evidence', lines);
}

function buildFlakeOpsSummary(payload = {}) {
  const categories = sortCategories(payload.byCategory || {});
  const lines = [
    `- Observation window: ${formatCode(payload.observationWindow || 'unknown')}`,
    `- Total artifacts: ${formatCount(payload.totalArtifacts)}`,
    `- Total occurrences: ${formatCount(payload.totalOccurrences)}`,
    `- Actionable: ${formatBoolean(payload.actionable)}`,
  ];

  if (payload.issueUrl) {
    const issueNumber = String(payload.issueUrl).match(/\/(\d+)(?:\/)?$/);
    const issueLabel = issueNumber ? `#${issueNumber[1]}` : 'issue';
    lines.push(`- Tracking issue: [${issueLabel}](${String(payload.issueUrl)})`);
  }

  if (categories.length === 0) {
    lines.push('- Category counts: none');
  } else {
    lines.push('- Category counts:');
    for (const [category, count] of categories) {
      lines.push(`  - ${formatCode(category)}: ${formatCount(count)}`);
    }
  }

  return renderSection('Flake Ops', lines);
}

function normalizeSummaryKind(kind) {
  return String(kind || '')
    .trim()
    .toLowerCase();
}

function buildSummary(kind, payload = {}) {
  const normalizedKind = normalizeSummaryKind(kind);

  switch (normalizedKind) {
    case 'impacted-validation':
      return buildImpactedValidationSummary(payload);
    case 'release-gate':
      return buildReleaseGateSummary(payload);
    case 'failure-evidence':
      return buildFailureEvidenceSummary(payload);
    case 'flake-ops':
      return buildFlakeOpsSummary(payload);
    default:
      throw new Error(`Unsupported summary kind: ${kind}`);
  }
}

module.exports = {
  buildFailureEvidenceSummary,
  buildFlakeOpsSummary,
  buildImpactedValidationSummary,
  buildReleaseGateSummary,
  buildSummary,
  normalizeSummaryKind,
};
