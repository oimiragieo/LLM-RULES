// Extracted diagram parsing/building helpers

function parseClassStructure(files) {
  const classes = [];

  files.forEach(file => {
    const { content, extension } = file;

    if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
      // TypeScript/JavaScript class parsing
      const classRegex =
        /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*{/g;
      let match;

      while ((match = classRegex.exec(content)) !== null) {
        const className = match[1];
        const extendsClass = match[2] || null;
        const implementsList = match[3] ? match[3].split(',').map(i => i.trim()) : [];

        // Extract methods and properties
        const classBodyMatch = content.substring(match.index).match(/{([\s\S]*?)}/);
        const methods = [];
        const properties = [];

        if (classBodyMatch) {
          const body = classBodyMatch[1];

          // Methods
          const methodRegex = /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)/g;
          let methodMatch;
          while ((methodMatch = methodRegex.exec(body)) !== null) {
            if (!['constructor', 'get', 'set'].includes(methodMatch[1])) {
              methods.push(methodMatch[1]);
            }
          }

          // Properties
          const propRegex = /(?:public|private|protected)?\s+(\w+)\s*:\s*([^;=\n]+)/g;
          let propMatch;
          while ((propMatch = propRegex.exec(body)) !== null) {
            properties.push({ name: propMatch[1], type: propMatch[2].trim() });
          }
        }

        classes.push({
          name: className,
          extends: extendsClass,
          implements: implementsList,
          methods,
          properties,
          file: file.relativePath,
        });
      }
    } else if (extension === '.py') {
      // Python class parsing
      const classRegex = /class\s+(\w+)(?:\(([^)]+)\))?:/g;
      let match;

      while ((match = classRegex.exec(content)) !== null) {
        const className = match[1];
        const bases = match[2] ? match[2].split(',').map(b => b.trim()) : [];

        classes.push({
          name: className,
          extends: bases.length > 0 ? bases[0] : null,
          implements: bases.slice(1),
          methods: [],
          properties: [],
          file: file.relativePath,
        });
      }
    }
  });

  return classes;
}

/**
 * Parse database schema from SQL
 */
function parseERSchema(content) {
  const entities = [];

  // Parse CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const columnsBlock = match[2];

    const attributes = [];
    const relationships = [];

    // Parse columns
    const columnLines = columnsBlock.split(/,\s*(?![^(]*\))/);

    columnLines.forEach(line => {
      const trimmed = line.trim();

      // Column definition
      const columnMatch = trimmed.match(/^(\w+)\s+(\w+(?:\([^)]+\))?)/);
      if (columnMatch) {
        const columnName = columnMatch[1];
        const columnType = columnMatch[2];
        const isPK = /PRIMARY\s+KEY/i.test(trimmed);
        const isFK = /FOREIGN\s+KEY|REFERENCES/i.test(trimmed);

        attributes.push({
          name: columnName,
          type: columnType,
          isPrimaryKey: isPK,
          isForeignKey: isFK,
        });
      }

      // Foreign key constraints
      const fkMatch = trimmed.match(/FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      if (fkMatch) {
        relationships.push({
          type: 'FOREIGN_KEY',
          from: tableName,
          to: fkMatch[2],
          fromColumn: fkMatch[1],
          toColumn: fkMatch[3],
        });
      }
    });

    entities.push({
      name: tableName,
      attributes,
      relationships,
    });
  }

  return entities;
}

/**
 * Generate architecture diagram from description
 */
function generateArchitectureDiagram(description, _title) {
  const nodes = new Set();
  const edges = [];

  // Parse simple arrow syntax: A -> B, A --> B
  const arrowRegex = /(\w+(?:\s+\w+)*)\s*(?:->|-->|=>)\s*(\w+(?:\s+\w+)*)/g;
  let match;

  while ((match = arrowRegex.exec(description)) !== null) {
    const from = match[1].trim().replace(/\s+/g, '_');
    const to = match[2].trim().replace(/\s+/g, '_');

    nodes.add(from);
    nodes.add(to);
    edges.push({ from, to });
  }

  // If no arrows found, extract component names
  if (nodes.size === 0) {
    const words = description.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    words.forEach(w => nodes.add(w.replace(/\s+/g, '_')));
  }

  let mermaid = 'graph TB\n';

  // Add nodes
  Array.from(nodes).forEach(node => {
    const label = node.replace(/_/g, ' ');
    mermaid += `    ${node}[${label}]\n`;
  });

  // Add edges
  edges.forEach(({ from, to }) => {
    mermaid += `    ${from} --> ${to}\n`;
  });

  return {
    mermaid,
    nodes: Array.from(nodes).map(id => ({
      id,
      label: id.replace(/_/g, ' '),
      type: 'component',
    })),
    edges,
  };
}

/**
 * Generate sequence diagram from description
 */
function generateSequenceDiagram(description, _title) {
  const participants = new Set();
  const interactions = [];

  // Parse arrow syntax: A -> B: message
  const arrowRegex = /(\w+)\s*(?:->|-->|->>)\s*(\w+)\s*:\s*(.+?)(?=\n|$)/g;
  let match;

  while ((match = arrowRegex.exec(description)) !== null) {
    const from = match[1];
    const to = match[2];
    const message = match[3].trim();

    participants.add(from);
    participants.add(to);
    interactions.push({ from, to, message });
  }

  // If no interactions found, create simple flow from words
  if (participants.size === 0) {
    const words = description.match(/\b[A-Z][a-z]+\b/g) || [];
    words.forEach(w => participants.add(w));

    for (let i = 0; i < words.length - 1; i++) {
      interactions.push({
        from: words[i],
        to: words[i + 1],
        message: 'request',
      });
    }
  }

  let mermaid = 'sequenceDiagram\n';

  // Add participants
  Array.from(participants).forEach(p => {
    mermaid += `    participant ${p}\n`;
  });

  mermaid += '\n';

  // Add interactions
  interactions.forEach(({ from, to, message }) => {
    mermaid += `    ${from}->>${to}: ${message}\n`;
  });

  return {
    mermaid,
    nodes: Array.from(participants).map(id => ({ id, label: id, type: 'participant' })),
    edges: interactions.map(i => ({ from: i.from, to: i.to, label: i.message })),
  };
}

/**
 * Generate class diagram from parsed classes
 */
function generateClassDiagram(classes) {
  let mermaid = 'classDiagram\n';

  classes.forEach(cls => {
    // Class definition
    mermaid += `    class ${cls.name} {\n`;

    // Properties
    cls.properties.forEach(prop => {
      mermaid += `        +${prop.type} ${prop.name}\n`;
    });

    // Methods
    cls.methods.forEach(method => {
      mermaid += `        +${method}()\n`;
    });

    mermaid += '    }\n';

    // Relationships
    if (cls.extends) {
      mermaid += `    ${cls.extends} <|-- ${cls.name}\n`;
    }
    cls.implements.forEach(iface => {
      mermaid += `    ${iface} <|.. ${cls.name}\n`;
    });
  });

  return {
    mermaid,
    nodes: classes.map(c => ({ id: c.name, label: c.name, type: 'class' })),
    edges: classes.flatMap(c => {
      const edges = [];
      if (c.extends) edges.push({ from: c.extends, to: c.name, label: 'extends' });
      c.implements.forEach(i => edges.push({ from: i, to: c.name, label: 'implements' }));
      return edges;
    }),
  };
}

/**
 * Generate ER diagram from parsed entities
 */
function generateERDiagram(entities) {
  let mermaid = 'erDiagram\n';

  entities.forEach(entity => {
    mermaid += `    ${entity.name} {\n`;

    entity.attributes.forEach(attr => {
      const constraint = attr.isPrimaryKey ? 'PK' : attr.isForeignKey ? 'FK' : '';
      mermaid += `        ${attr.type} ${attr.name} ${constraint}\n`;
    });

    mermaid += '    }\n';
  });

  // Add relationships
  const relationships = entities.flatMap(e => e.relationships);
  relationships.forEach(rel => {
    mermaid += `    ${rel.from} ||--o{ ${rel.to} : "has"\n`;
  });

  return {
    mermaid,
    nodes: entities.map(e => ({ id: e.name, label: e.name, type: 'entity' })),
    edges: relationships.map(r => ({ from: r.from, to: r.to, label: 'has' })),
  };
}

/**
 * Generate flowchart from description
 */
function generateFlowchart(description, _title) {
  const nodes = [];
  const edges = [];
  let nodeId = 0;

  // Parse decision points and actions
  const lines = description
    .split(/\n|;|,/)
    .map(l => l.trim())
    .filter(Boolean);

  lines.forEach((line, idx) => {
    const id = `node${nodeId++}`;

    // Decision (if/when/whether)
    if (/^(?:if|when|whether)/i.test(line)) {
      nodes.push({ id, label: line, type: 'decision', shape: 'diamond' });
    }
    // Start/End
    else if (/^(?:start|begin|end|finish)/i.test(line)) {
      nodes.push({ id, label: line, type: 'terminal', shape: 'rounded' });
    }
    // Action
    else {
      nodes.push({ id, label: line, type: 'process', shape: 'rectangle' });
    }

    // Connect to previous node
    if (idx > 0) {
      edges.push({ from: nodes[idx - 1].id, to: id, label: '' });
    }
  });

  let mermaid = 'flowchart TD\n';

  nodes.forEach(node => {
    const shape =
      node.shape === 'diamond'
        ? `{${node.label}}`
        : node.shape === 'rounded'
          ? `([${node.label}])`
          : `[${node.label}]`;
    mermaid += `    ${node.id}${shape}\n`;
  });

  edges.forEach(edge => {
    mermaid += `    ${edge.from} --> ${edge.to}\n`;
  });

  return {
    mermaid,
    nodes: nodes.map(n => ({ id: n.id, label: n.label, type: n.type })),
    edges,
  };
}

/**
 * Generate state diagram from description
 */
function generateStateDiagram(description, _title) {
  const states = new Set();
  const transitions = [];

  // Parse state transitions: StateA -> StateB
  const transitionRegex = /(\w+(?:\s+\w+)*)\s*(?:->|-->)\s*(\w+(?:\s+\w+)*)/g;
  let match;

  while ((match = transitionRegex.exec(description)) !== null) {
    const from = match[1].trim().replace(/\s+/g, '_');
    const to = match[2].trim().replace(/\s+/g, '_');

    states.add(from);
    states.add(to);
    transitions.push({ from, to });
  }

  // If no transitions, extract state names
  if (states.size === 0) {
    const words = description.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    words.forEach(w => states.add(w.replace(/\s+/g, '_')));
  }

  let mermaid = 'stateDiagram-v2\n';

  // Add states
  Array.from(states).forEach(state => {
    const label = state.replace(/_/g, ' ');
    if (state !== label) {
      mermaid += `    ${state}: ${label}\n`;
    }
  });

  // Add transitions
  transitions.forEach(({ from, to }) => {
    mermaid += `    ${from} --> ${to}\n`;
  });

  return {
    mermaid,
    nodes: Array.from(states).map(id => ({ id, label: id.replace(/_/g, ' '), type: 'state' })),
    edges: transitions,
  };
}

/**
 * Main diagram generation function
 */

export {
  parseClassStructure,
  parseERSchema,
  generateArchitectureDiagram,
  generateSequenceDiagram,
  generateClassDiagram,
  generateERDiagram,
  generateFlowchart,
  generateStateDiagram,
};
