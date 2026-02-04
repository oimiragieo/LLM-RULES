'use strict';

const MEMORY_AREAS = {
  MAIN: 'main',
  FRAGMENTS: 'fragments',
  SOLUTIONS: 'solutions',
};

const DEFAULT_AREA = MEMORY_AREAS.MAIN;

function isValidArea(area) {
  return Object.values(MEMORY_AREAS).includes(String(area || ''));
}

module.exports = {
  MEMORY_AREAS,
  DEFAULT_AREA,
  isValidArea,
};
