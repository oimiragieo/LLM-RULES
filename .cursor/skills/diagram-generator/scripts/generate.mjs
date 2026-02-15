#!/usr/bin/env node
'use strict';

import {
  main,
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateClassDiagram,
  generateERDiagram,
  generateFlowchart,
  generateStateDiagram,
} from '../../../../.claude/tools/visualization/diagram-generator/scripts/generate.mjs';

if (import.meta.url.startsWith('file:')) {
  const { fileURLToPath } = await import('url');
  const modulePath = fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath || process.argv[1] === modulePath.replace(/\\/g, '/')) {
    main();
  }
}

export {
  main,
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateClassDiagram,
  generateERDiagram,
  generateFlowchart,
  generateStateDiagram,
};
