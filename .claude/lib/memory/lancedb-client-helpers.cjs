const fs = require('fs');
const { createLogger } = require('../utils/logger.cjs');

const logger = createLogger('lancedb-client-helpers');

const TYPED_METADATA_FIELDS = {
  filePath: 'meta_filePath',
  language: 'meta_language',
  type: 'meta_type',
  lineStart: 'meta_lineStart',
  lineEnd: 'meta_lineEnd',
  name: 'meta_name',
  signature: 'meta_signature',
  tokenCount: 'meta_tokenCount',
};

function configureCudaPath() {
  if (process.platform !== 'win32' || process.env.CUDA_PATH) return;

  const cudaVersions = ['v13.1', 'v13.0', 'v12.1', 'v12.0', 'v11.8', 'v11.7', 'v11.6', 'v11.5'];
  const cudaBasePath = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA';

  for (const version of cudaVersions) {
    const cudaPath = `${cudaBasePath}\\${version}`;
    const cudaBinPath = `${cudaPath}\\bin`;

    if (!fs.existsSync(cudaBinPath)) continue;

    const files = fs.readdirSync(cudaBinPath);
    const cudartDll = files.find(f => /^cudart64_\d+\.dll$/i.test(f));
    if (!cudartDll) continue;

    process.env.CUDA_PATH = cudaPath;
    process.env.PATH = `${cudaBinPath};${process.env.PATH || ''}`;
    logger.info('CUDA_PATH configured', { version, cudartDll });
    break;
  }

  if (!process.env.CUDA_PATH) {
    console.warn('⚠️  No CUDA installation detected in standard locations.');
    console.warn('   GPU acceleration requires CUDA Toolkit.');
    console.warn('   Install from: https://developer.nvidia.com/cuda-downloads');
  }
}

function distanceToSimilarity(distance) {
  const d = Number(distance);
  if (!Number.isFinite(d)) return 0;
  if (d <= 0) return 1;
  return 1 / (1 + d);
}

function stableTestEmbedding(text, dims = 384) {
  const vec = new Array(dims).fill(0);
  const str = String(text || '');
  for (let i = 0; i < str.length; i++) {
    vec[i % dims] += (str.charCodeAt(i) % 31) / 31;
  }
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toTypedMetadataColumns(metadata) {
  const m = typeof metadata === 'object' && metadata ? metadata : {};
  return {
    meta_filePath: m.filePath ? String(m.filePath) : '',
    meta_language: m.language ? String(m.language) : '',
    meta_type: m.type ? String(m.type) : '',
    meta_lineStart: Number.isFinite(m.lineStart) ? Number(m.lineStart) : -1,
    meta_lineEnd: Number.isFinite(m.lineEnd) ? Number(m.lineEnd) : -1,
    meta_name: m.name ? String(m.name) : '',
    meta_signature: m.signature ? String(m.signature) : '',
    meta_tokenCount: Number.isFinite(m.tokenCount) ? Number(m.tokenCount) : -1,
  };
}

function buildTypedWhereClause(filters) {
  if (!filters || typeof filters !== 'object') return null;
  const clauses = [];
  for (const [key, value] of Object.entries(filters)) {
    const column = TYPED_METADATA_FIELDS[key];
    if (!column) return null;
    clauses.push(`${column} = ${toSqlLiteral(value)}`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

function shouldUseTypedFilters(filters, options = {}) {
  if (!filters || typeof filters !== 'object') return false;
  const forceTyped = options.typedFilters === true || process.env.LANCEDB_TYPED_FILTERS === 'on';
  if (forceTyped) return true;
  return ['lineStart', 'lineEnd', 'tokenCount'].some(key => key in filters);
}

function buildLegacyMetadataWhereClause(filters) {
  if (!filters || typeof filters !== 'object') return null;
  const clauses = [];
  for (const [key, value] of Object.entries(filters)) {
    const k = String(key).replace(/'/g, "''");
    const v = String(value).replace(/'/g, "''");
    clauses.push(`metadata LIKE '%"${k}":"${v}"%'`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

module.exports = {
  TYPED_METADATA_FIELDS,
  buildLegacyMetadataWhereClause,
  buildTypedWhereClause,
  configureCudaPath,
  distanceToSimilarity,
  shouldUseTypedFilters,
  stableTestEmbedding,
  toSqlLiteral,
  toTypedMetadataColumns,
};
