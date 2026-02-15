function showHelp() {
  console.log(`
Repo RAG - High-recall codebase retrieval

Usage:
  node search.mjs --query "search query" [options]

Options:
  --query <query>       Search query (required)
  --path <path>         Target directory to search (default: current dir)
  --limit <n>           Maximum results to return (default: 10)
  --type <type>         Search type: hybrid, keyword, symbol, semantic, path (default: hybrid)
  --extensions <exts>   Comma-separated file extensions (default: ts,tsx,js,jsx,py,mjs,cjs,vue,svelte)
  --format <format>     Output format: json, markdown (default: json)
  --threshold <n>       Minimum relevance score 0-1 (default: 0.3)

Examples:
  node search.mjs --query "authentication patterns"
  node search.mjs --query "class UserService" --type symbol
  node search.mjs --query "error handling" --path src/ --limit 20
  node search.mjs --query "authentication middleware" --extensions ts,js
  `);
}

function formatMarkdown(output) {
  const lines = [];

  lines.push('# Repo RAG Search Results\n');
  lines.push(`**Query**: ${output.input.query}`);
  lines.push(`**Strategy**: ${output.search.strategies_used.join(', ')}`);
  lines.push(`**Files Scanned**: ${output.search.files_scanned}`);
  lines.push(`**Matches Found**: ${output.search.matches_found}`);
  lines.push(`**Duration**: ${output.execution.duration_ms}ms\n`);

  if (output.results.length === 0) {
    lines.push('*No results found.*\n');
  } else {
    lines.push('## Results\n');

    output.results.forEach((result, idx) => {
      lines.push(`### ${idx + 1}. ${result.file}:${result.line}`);
      lines.push(`- **Type**: ${result.match_type}`);
      lines.push(`- **Relevance**: ${(result.relevance_score * 100).toFixed(0)}%`);

      if (result.symbol) {
        lines.push(`- **Symbol**: ${result.symbol.type} \`${result.symbol.name}\``);
      }

      lines.push('\n```');
      lines.push(result.snippet);
      lines.push('```\n');
    });
  }

  if (output.summary.recommendations.length > 0) {
    lines.push('## Recommendations\n');
    output.summary.recommendations.forEach(rec => {
      lines.push(`- ${rec}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

async function validateOutputSchema(output, schemaFullPath, readFileFn) {
  try {
    const schemaContent = await readFileFn(schemaFullPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    const requiredFields = schema.required || [];
    for (const field of requiredFields) {
      if (!(field in output)) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('Schema validation failed:', err.message);
    return false;
  }
}

export { formatMarkdown, showHelp, validateOutputSchema };
