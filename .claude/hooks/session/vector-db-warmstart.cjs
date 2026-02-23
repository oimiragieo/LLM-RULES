#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

function main() {
    const workerPath = path.join(__dirname, 'vector-db-warmstart-worker.cjs');

    // Spawn the vector db warm-start in a detached background process
    // This ensures the user's prompt isn't blocked waiting for LanceDB 
    // and the ONNX runtime or transformers to load into memory
    const child = spawn(process.execPath, [workerPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });

    // Unref to allow the orchestrator/caller to exit immediately
    child.unref();
    process.exit(0);
}

if (require.main === module) {
    main();
}
