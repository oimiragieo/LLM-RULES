/* eslint-disable max-depth, no-unused-vars, complexity, require-await */
const fs = require('fs');
const path = require('path');
const { CodeParser } = require('../../.claude/lib/code-indexing/code-parser.cjs');

const ITERATIONS = 1000;

async function runBenchmark() {
    const parser = new CodeParser();
    const filePath = path.join(__dirname, '../../.claude/lib/memory/lancedb-client-impl.cjs');
    const content = fs.readFileSync(filePath, 'utf8');
    const language = 'javascript';

    const parseResult = parser.parse(content, language);
    if (!parseResult) {
        console.error('Failed to parse! Debug info:');
        console.error(`- Has Parser? ${!!parser._Parser}`);
        if (parser._treeSitterLoadError) {
            console.error(`- Tree-sitter Load Error: ${parser._treeSitterLoadError.message}`);
        }
        console.error(`- Is Supported? ${parser.isSupported(language)}`);
        console.error(`- getParser(): ${!!parser._getParser(language)}`);
        return;
    }
    const rootNode = parseResult.rootNode;

    console.log(`File: lancedb-client-impl.cjs (${content.length} bytes)`);
    console.log(`Starting benchmark with ${ITERATIONS} iterations...`);

    // --- 1. Current Approach (.children property) ---
    const startChildren = process.hrtime.bigint();
    let methodsFoundChildren = 0;
    for (let i = 0; i < ITERATIONS; i++) {
        for (const node of rootNode.children) {
            if (node.type === 'class_declaration') {
                for (const child of node.children) {
                    if (child.type === 'class_body') {
                        for (const classChild of child.children) {
                            if (classChild.type === 'method_definition') {
                                methodsFoundChildren++;
                            }
                        }
                    }
                }
            } else if (node.type === 'function_declaration') {
                methodsFoundChildren++;
            }
        }
    }
    const endChildren = process.hrtime.bigint();
    const childrenMs = Number(endChildren - startChildren) / 1000000;

    // --- 2. namedChildren Approach ---
    const startNamed = process.hrtime.bigint();
    let methodsFoundNamed = 0;
    for (let i = 0; i < ITERATIONS; i++) {
        for (const node of rootNode.namedChildren) {
            if (node.type === 'class_declaration') {
                for (const child of node.namedChildren) {
                    if (child.type === 'class_body') {
                        for (const classChild of child.namedChildren) {
                            if (classChild.type === 'method_definition') {
                                methodsFoundNamed++;
                            }
                        }
                    }
                }
            } else if (node.type === 'function_declaration') {
                methodsFoundNamed++;
            }
        }
    }
    const endNamed = process.hrtime.bigint();
    const namedMs = Number(endNamed - startNamed) / 1000000;

    // --- 3. TreeCursor Approach (.walk()) ---
    const startCursor = process.hrtime.bigint();
    let methodsFoundCursor = 0;
    for (let i = 0; i < ITERATIONS; i++) {
        const cursor = rootNode.walk();
        if (cursor.gotoFirstChild()) {
            do {
                if (cursor.nodeType === 'class_declaration') {
                    if (cursor.gotoFirstChild()) {
                        do {
                            if (cursor.nodeType === 'class_body') {
                                if (cursor.gotoFirstChild()) {
                                    do {
                                        if (cursor.nodeType === 'method_definition') {
                                            methodsFoundCursor++;
                                        }
                                    } while (cursor.gotoNextSibling());
                                    cursor.gotoParent();
                                }
                            }
                        } while (cursor.gotoNextSibling());
                        cursor.gotoParent();
                    }
                } else if (cursor.nodeType === 'function_declaration') {
                    methodsFoundCursor++;
                }
            } while (cursor.gotoNextSibling());
        }
    }
    const endCursor = process.hrtime.bigint();
    const cursorMs = Number(endCursor - startCursor) / 1000000;

    console.log('\nResults:');
    console.log(`1. .children property:       ${childrenMs.toFixed(2)}ms`);
    console.log(`2. .namedChildren property:  ${namedMs.toFixed(2)}ms`);
    console.log(`3. TreeCursor manual walking: ${cursorMs.toFixed(2)}ms`);
    console.log(`\nTreeCursor Difference: ${(childrenMs / cursorMs).toFixed(2)}x faster than .children`);
    console.log(`namedChildren Difference: ${(childrenMs / namedMs).toFixed(2)}x faster than .children`);
}

runBenchmark().catch(console.error);
