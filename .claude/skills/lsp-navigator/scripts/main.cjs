'use strict';

// lsp-navigator uses Claude Code's native LSP tool.
// No CLI script needed. LSP operations are invoked directly as native tool calls:
//   lsp_goToDefinition({ filePath, line, character })
//   lsp_findReferences({ filePath, line, character })
//   lsp_hover({ filePath, line, character })
//   lsp_documentSymbol({ filePath, line, character })
//   lsp_workspaceSymbol({ filePath, line, character })
//   lsp_goToImplementation({ filePath, line, character })
//   lsp_prepareCallHierarchy({ filePath, line, character })
//   lsp_incomingCalls({ filePath, line, character })
//   lsp_outgoingCalls({ filePath, line, character })
//
// This file exists for structural completeness and the enterprise scaffold.
// See SKILL.md for usage guidance, decision tables, and workflow patterns.

module.exports = {
  execute: () => ({
    ok: true,
    message:
      'Use native LSP tool directly. See SKILL.md for operation reference and workflow patterns.',
    operations: [
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
    ],
  }),
};
