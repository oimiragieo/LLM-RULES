// Extracted diagram scoring/description helpers

import {
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateFlowchart,
  generateStateDiagram,
} from './generate-builders-a.mjs';

function generateDiagramFromDescription(type, description, title) {
  switch (type) {
    case 'architecture':
      return generateArchitectureDiagram(description, title);
    case 'sequence':
      return generateSequenceDiagram(description, title);
    case 'flowchart':
    case 'flow':
      return generateFlowchart(description, title);
    case 'state':
      return generateStateDiagram(description, title);
    default:
      throw new Error(`Description-based generation not supported for type: ${type}`);
  }
}

/**
 * Calculate diagram complexity score (1-10)
 */
function calculateComplexity(nodeCount, edgeCount) {
  const totalElements = nodeCount + edgeCount;

  if (totalElements <= 5) return 1;
  if (totalElements <= 10) return 3;
  if (totalElements <= 20) return 5;
  if (totalElements <= 40) return 7;
  if (totalElements <= 60) return 9;
  return 10;
}

export { generateDiagramFromDescription, calculateComplexity };
