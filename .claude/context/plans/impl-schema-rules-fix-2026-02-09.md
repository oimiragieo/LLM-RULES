<!-- Agent: planner | Task: #6 | Session: 2026-02-09 -->

# Implementation Plan: Schema & Rules Quality Fix

## Executive Summary

Fix all critical quality issues from the skill expansion batch: standardize 75 active schemas to canonical Structure B envelope with `additionalProperties:false`, delete 12 hollow stub schemas (replaced by a single generic base), standardize `$id` domains to `agent-studio.dev`, delete 8 stub rules files, enhance 7 domain rules files, and document everything in ADR-095 and updated creator rules.

## Objectives

1. Eliminate all hollow stub schemas (12 files) and replace with a single generic base
2. Add `additionalProperties:false` to all 75 active schemas (SEC-SCHEMA-001 P0 fix)
3. Migrate 19 Structure A schemas to canonical Structure B envelope
4. Standardize all `$id` values to `agent-studio.dev` domain
5. Delete 8 valueless stub rules and enhance 7 domain-specific rules
6. Document decisions in ADR-095 and update creator rules to prevent recurrence

## Security Conditions (from Security Review)

All 5 conditions for full approval MUST be satisfied:

| # | Condition | Plan Phase | Task |
|---|-----------|-----------|------|
| 1 | Implement `additionalProperties:false` BEFORE any other schema changes | Phase 1 | 1.2 |
| 2 | Preserve security-adjacent rules during cleanup | Phase R | R.3 |
| 3 | Document all four envelope variants in ADR | Phase 4 | 4.1 |
| 4 | Verify domain ownership before `$id` standardization | Phase 2 | 2.3 |
| 5 | Run backward compatibility validation before deploying | Phase 2 | 2.5 |

## Risks

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|-------------|------------|----------|
| Breaking schema consumers | HIGH | LOW (no runtime validation exists) | No consumers currently validate; review git diff | `git checkout -- .claude/schemas/` |
| Lost security schema quality (A3) | HIGH | LOW | Backup A3 schemas before migration; preserve all domain properties | `git checkout -- .claude/schemas/skill-{name}-output.schema.json` |
| Incorrect migration transforms | MEDIUM | MEDIUM | JSON parse validation after every batch; manual spot-check | `git checkout -- .claude/schemas/` per phase |
| Time overrun | MEDIUM | MEDIUM | Stop after Phase 2 if needed; Phase 3 and R can be deferred | Partial delivery is valuable |
| Orphaned references after deletion | MEDIUM | LOW | Grep for deleted filenames after each deletion step | Restore file from git |

## Phases

---

### Phase 1: Foundation (2-3 hours)

**Purpose**: Create generic base schema, add `additionalProperties:false` to ALL schemas (SEC-SCHEMA-001 P0), delete 12 hollow stubs, verify JSON validity.
**Dependencies**: None
**Parallel OK**: No (must complete before Phase 2)

**Error Handling**: If any JSON parse fails in 1.2, fix the specific file manually before proceeding. If stub deletion breaks references, restore file and add to exceptions list.

**Verification Gate**:
```bash
node -e "const fs=require('fs'); const files=fs.readdirSync('.claude/schemas').filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let ok=0,fail=0; files.forEach(f=>{try{const s=JSON.parse(fs.readFileSync('.claude/schemas/'+f,'utf8')); if(s.additionalProperties===false)ok++; else fail++}catch(e){fail++}}); console.log('OK:',ok,'FAIL:',fail,'TOTAL:',files.length)"
```
Expected: OK: 76, FAIL: 0, TOTAL: 76 (75 active + 1 base)

#### Tasks

- [ ] **1.1** Create generic base schema (~15 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "const fs=require('fs'); const schema={'\$schema':'http://json-schema.org/draft-07/schema#','\$id':'https://agent-studio.dev/schemas/generic-skill-output-base.schema.json','title':'Generic Skill Output Base','description':'Base schema for skills without domain-specific output validation. Skills using this schema intentionally accept any structured output. When a skill develops domain-specific output needs, replace the \$ref with a full schema.','type':'object','required':['status','output'],'properties':{'status':{'type':'string','enum':['success','partial','failed'],'description':'Execution status of the skill'},'output':{'type':'object','description':'Skill-specific output data. This base schema accepts any properties. Override with domain-specific schema when output structure is known.','minProperties':0}},'additionalProperties':false}; fs.writeFileSync('.claude/schemas/generic-skill-output-base.schema.json',JSON.stringify(schema,null,2)+'\n'); console.log('Created generic-skill-output-base.schema.json')"
  ```

  **Verify**:
  ```bash
  node -e "const s=JSON.parse(require('fs').readFileSync('.claude/schemas/generic-skill-output-base.schema.json','utf8')); console.log('valid JSON:', !!s); console.log('has status:', !!s.properties.status); console.log('has output:', !!s.properties.output); console.log('additionalProperties:', s.additionalProperties); console.log('draft-07:', s['\$schema']==='http://json-schema.org/draft-07/schema#')"
  ```
  Expected: all `true`, `additionalProperties: false`, `draft-07: true`

  **Rollback**:
  ```bash
  node -e "require('fs').unlinkSync('.claude/schemas/generic-skill-output-base.schema.json'); console.log('Deleted base schema')"
  ```

- [ ] **1.2** Add `additionalProperties:false` to ALL existing schemas (~60 min) [SEC-SCHEMA-001 P0]
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **IMPORTANT**: This task satisfies Security Condition #1 (implement additionalProperties BEFORE other changes). Must complete before any envelope migration.

  **Command**: Write and execute the following script at `.claude/context/tmp/add-additional-props.cjs`:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  let modified = 0, skipped = 0, errors = 0;
  files.forEach(f => {
    try {
      const path = dir + '/' + f;
      const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
      let changed = false;
      // Add at root level
      if (schema.additionalProperties !== false) {
        schema.additionalProperties = false;
        changed = true;
      }
      // Add at output level (if output has properties defined)
      if (schema.properties && schema.properties.output &&
          schema.properties.output.type === 'object' &&
          schema.properties.output.properties &&
          Object.keys(schema.properties.output.properties).length > 0 &&
          schema.properties.output.additionalProperties !== false) {
        schema.properties.output.additionalProperties = false;
        changed = true;
      }
      // Add at result level (A2 variant - if result has properties defined)
      if (schema.properties && schema.properties.result &&
          schema.properties.result.type === 'object' &&
          schema.properties.result.properties &&
          Object.keys(schema.properties.result.properties).length > 0 &&
          schema.properties.result.additionalProperties !== false) {
        schema.properties.result.additionalProperties = false;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
        modified++;
        console.log('MODIFIED:', f);
      } else {
        skipped++;
      }
    } catch (e) {
      errors++;
      console.error('ERROR:', f, e.message);
    }
  });
  console.log('Summary: modified=' + modified + ' skipped=' + skipped + ' errors=' + errors + ' total=' + files.length);
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let has=0,missing=0; files.forEach(f=>{const s=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); if(s.additionalProperties===false)has++;else{missing++;console.log('MISSING:',f)}}); console.log('Has additionalProperties:false:',has,'Missing:',missing,'Total:',files.length)"
  ```
  Expected: `Missing: 0` (all schemas have `additionalProperties:false` at root)

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-*-output.schema.json
  ```

- [ ] **1.3** Validate all schemas are valid JSON after modification (~10 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let ok=0,fail=0; files.forEach(f=>{try{JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'));ok++}catch(e){fail++;console.error('INVALID JSON:',f,e.message)}}); console.log('Valid:',ok,'Invalid:',fail)"
  ```

  **Verify**: Same command. Expected: `Invalid: 0`

  **Rollback**: N/A (read-only check)

- [ ] **1.4** Delete 12 hollow stub schemas (~15 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const stubs = [
    'skill-swarm-coordination-output.schema.json',
    'skill-consensus-voting-output.schema.json',
    'skill-binary-analysis-patterns-output.schema.json',
    'skill-memory-forensics-output.schema.json',
    'skill-protocol-reverse-engineering-output.schema.json',
    'skill-ai-ml-expert-output.schema.json',
    'skill-scientific-skills-output.schema.json',
    'skill-writing-skills-output.schema.json',
    'skill-git-expert-output.schema.json',
    'skill-doc-generator-output.schema.json',
    'skill-readme-output.schema.json',
    'skill-summarize-changes-output.schema.json'
  ];
  let deleted = 0;
  stubs.forEach(f => {
    const path = '.claude/schemas/' + f;
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
      deleted++;
      console.log('DELETED:', f);
    } else {
      console.log('NOT FOUND:', f);
    }
  });
  console.log('Deleted', deleted, 'of', stubs.length, 'stubs');
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const count=fs.readdirSync('.claude/schemas').filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')).length; console.log('Schema files remaining:', count); console.log('Expected: 76 (75 active + 1 base)')"
  ```
  Expected: `Schema files remaining: 76`

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-swarm-coordination-output.schema.json .claude/schemas/skill-consensus-voting-output.schema.json .claude/schemas/skill-binary-analysis-patterns-output.schema.json .claude/schemas/skill-memory-forensics-output.schema.json .claude/schemas/skill-protocol-reverse-engineering-output.schema.json .claude/schemas/skill-ai-ml-expert-output.schema.json .claude/schemas/skill-scientific-skills-output.schema.json .claude/schemas/skill-writing-skills-output.schema.json .claude/schemas/skill-git-expert-output.schema.json .claude/schemas/skill-doc-generator-output.schema.json .claude/schemas/skill-readme-output.schema.json .claude/schemas/skill-summarize-changes-output.schema.json
  ```

- [ ] **1.5** Verify no broken references to deleted stubs (~10 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const { execSync } = require('child_process');
  const stubs = ['swarm-coordination-output.schema','consensus-voting-output.schema','binary-analysis-patterns-output.schema','memory-forensics-output.schema','protocol-reverse-engineering-output.schema','ai-ml-expert-output.schema','scientific-skills-output.schema','writing-skills-output.schema','git-expert-output.schema','doc-generator-output.schema','readme-output.schema','summarize-changes-output.schema'];
  let found = 0;
  stubs.forEach(stub => {
    try {
      const result = execSync('grep -rl \"' + stub + '\" .claude/context .claude/rules .claude/skills --include=\"*.md\" --include=\"*.json\" 2>nul || echo \"\"', { encoding: 'utf8' }).trim();
      if (result) { console.log('REFERENCE FOUND for', stub, ':', result); found++; }
    } catch(e) {}
  });
  console.log('Total broken references:', found);
  "
  ```

  **Verify**: Expected: `Total broken references: 0`

  **Rollback**: N/A (read-only check). If references found, update those files before proceeding.

- [ ] **1.6** COMMIT CHECKPOINT: Phase 1 foundation (~5 min)
  Target Agent: `developer`

  **Command**:
  ```bash
  git add .claude/schemas/ && git commit -m "fix: Phase 1 schema foundation - add additionalProperties:false, delete 12 stubs, create base schema"
  ```

  **Verify**:
  ```bash
  git log --oneline -1
  ```
  Expected: Commit message contains "Phase 1"

  **Rollback**:
  ```bash
  git revert HEAD --no-edit
  ```

**Success Criteria**: 76 schema files on disk, all valid JSON, all have `additionalProperties:false` at root, generic base schema exists, zero broken references.

---

### Phase 2: Batch Standardization (2-3 hours)

**Purpose**: Standardize `$id` domains to `agent-studio.dev`, update `$schema` to Draft-07, update schema catalog with 12 base-schema entries and 22 orphaned entries.
**Dependencies**: Phase 1 complete
**Parallel OK**: Partially (2.1 and 2.2 can run in parallel)

**Error Handling**: If `$id` standardization breaks any reference, grep for the old `$id` value and update references. If catalog update has conflicts, resolve manually.

**Verification Gate**:
```bash
node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let badId=0,badSchema=0; files.forEach(f=>{const s=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); if(!s['\$id']||!s['\$id'].includes('agent-studio.dev'))badId++; if(s['\$schema']&&!s['\$schema'].includes('draft-07'))badSchema++}); console.log('Non-agent-studio.dev $id:',badId,'Non-draft-07 $schema:',badSchema)"
```
Expected: `Non-agent-studio.dev $id: 0`, `Non-draft-07 $schema: 0`

#### Tasks

- [ ] **2.1** Standardize `$schema` to Draft-07 on all schemas (~15 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  let modified = 0;
  files.forEach(f => {
    const path = dir + '/' + f;
    const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (schema['\$schema'] && schema['\$schema'] !== 'http://json-schema.org/draft-07/schema#') {
      schema['\$schema'] = 'http://json-schema.org/draft-07/schema#';
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      modified++;
      console.log('FIXED $schema:', f);
    } else if (!schema['\$schema']) {
      schema['\$schema'] = 'http://json-schema.org/draft-07/schema#';
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      modified++;
      console.log('ADDED $schema:', f);
    }
  });
  console.log('Modified:', modified, 'of', files.length);
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let bad=0; files.forEach(f=>{const s=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); if(s['\$schema']!=='http://json-schema.org/draft-07/schema#'){bad++;console.log('BAD:',f,s['\$schema'])}}); console.log('Non-draft-07 schemas:',bad)"
  ```
  Expected: `Non-draft-07 schemas: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-*-output.schema.json
  ```

- [ ] **2.2** Standardize `$id` to `agent-studio.dev` domain (~30 min) [SEC Condition #4]
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  let modified = 0;
  files.forEach(f => {
    const path = dir + '/' + f;
    const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
    const expectedId = 'https://agent-studio.dev/schemas/' + f;
    let changed = false;
    if (!schema['\$id']) {
      schema['\$id'] = expectedId;
      changed = true;
      console.log('ADDED $id:', f);
    } else if (schema['\$id'].includes('claude-code.anthropic.com')) {
      schema['\$id'] = expectedId;
      changed = true;
      console.log('FIXED domain:', f);
    } else if (schema['\$id'] !== expectedId) {
      console.log('ADJUSTED $id:', f, 'from', schema['\$id'], 'to', expectedId);
      schema['\$id'] = expectedId;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      modified++;
    }
  });
  console.log('Modified:', modified, 'of', files.length);
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let bad=0,missing=0; files.forEach(f=>{const s=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); if(!s['\$id']){missing++;console.log('MISSING $id:',f)} else if(!s['\$id'].includes('agent-studio.dev')){bad++;console.log('BAD domain:',f,s['\$id'])}}); console.log('Missing $id:',missing,'Bad domain:',bad)"
  ```
  Expected: `Missing $id: 0`, `Bad domain: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-*-output.schema.json
  ```

- [ ] **2.3** Verify domain ownership documentation (~10 min) [SEC Condition #4]
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Note**: `agent-studio.dev` is the project's chosen namespace. Since `$id` is informational only (no runtime `$ref` resolution exists), domain ownership is a documentation concern. This task documents the convention.

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const note = '\n### $id Domain Convention (2026-02-09)\n\n**Domain**: \`agent-studio.dev\`\n**Usage**: Schema identification only (no runtime $ref resolution)\n**Rationale**: Single consistent namespace for all 76 skill output schemas\n**Risk**: None (informational URI, not fetched at runtime)\n\n';
  const path = '.claude/context/memory/decisions.md';
  const content = fs.readFileSync(path, 'utf8');
  if (!content.includes('$id Domain Convention')) {
    fs.appendFileSync(path, note);
    console.log('Added $id domain convention note to decisions.md');
  } else {
    console.log('Already documented');
  }
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const content=fs.readFileSync('.claude/context/memory/decisions.md','utf8'); console.log('Contains domain convention:', content.includes('$id Domain Convention'))"
  ```
  Expected: `Contains domain convention: true`

  **Rollback**:
  ```bash
  git checkout -- .claude/context/memory/decisions.md
  ```

- [ ] **2.4** Update schema-catalog.md: 12 stub entries point to base schema (~30 min)
  Target Agent: `technical-writer`
  Recommended Skills: `doc-generator`, `verification-before-completion`

  **Command**: Edit `.claude/context/artifacts/catalogs/schema-catalog.md` to:
  1. Remove the 12 individual entries for deleted stub schemas
  2. Add a "Generic Base Schema" section listing all 12 skills that use `generic-skill-output-base.schema.json`
  3. Add 22 orphaned entries (schemas that exist on disk but are missing from catalog)

  The executing agent should:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const onDisk = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  const catalog = fs.readFileSync('.claude/context/artifacts/catalogs/schema-catalog.md', 'utf8');
  let missing = 0;
  onDisk.forEach(f => {
    const name = f.replace('skill-','').replace('-output.schema.json','');
    if (!catalog.includes(name)) {
      missing++;
      console.log('ORPHANED:', f);
    }
  });
  console.log('Total orphaned (missing from catalog):', missing);
  "
  ```

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const onDisk = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  const catalog = fs.readFileSync('.claude/context/artifacts/catalogs/schema-catalog.md', 'utf8');
  const stubSkills = ['swarm-coordination','consensus-voting','binary-analysis-patterns','memory-forensics','protocol-reverse-engineering','ai-ml-expert','scientific-skills','writing-skills','git-expert','doc-generator','readme','summarize-changes'];
  let orphaned = 0;
  onDisk.forEach(f => {
    const name = f.replace('skill-','').replace('-output.schema.json','');
    if (!catalog.includes(name)) { orphaned++; console.log('STILL ORPHANED:', name); }
  });
  stubSkills.forEach(s => {
    if (!catalog.includes(s)) { console.log('STUB NOT IN CATALOG:', s); }
  });
  console.log('Orphaned schemas:', orphaned);
  console.log('Expected: 0');
  "
  ```
  Expected: `Orphaned schemas: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/context/artifacts/catalogs/schema-catalog.md
  ```

- [ ] **2.5** Run backward compatibility validation (~15 min) [SEC Condition #5]
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  let issues = 0;
  files.forEach(f => {
    const schema = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    // Check 1: Must have required status and output
    if (!schema.required || !schema.required.includes('status') || !schema.required.includes('output')) {
      // A1/A2/A3 schemas not yet migrated will fail this - that is expected and handled in Phase 3
      if (schema.required && (schema.required.includes('skillName') || schema.required.includes('skill_name'))) {
        // Structure A - will be migrated in Phase 3, skip for now
      } else if (!schema.required) {
        console.log('WARNING: No required array:', f);
        issues++;
      }
    }
    // Check 2: Must have additionalProperties:false at root
    if (schema.additionalProperties !== false) {
      console.log('FAIL: Missing additionalProperties:false:', f);
      issues++;
    }
    // Check 3: Must have $id with agent-studio.dev
    if (!schema['\$id'] || !schema['\$id'].includes('agent-studio.dev')) {
      console.log('FAIL: Bad $id:', f);
      issues++;
    }
    // Check 4: Must have $schema as draft-07
    if (schema['\$schema'] !== 'http://json-schema.org/draft-07/schema#') {
      console.log('FAIL: Bad $schema:', f);
      issues++;
    }
  });
  console.log('Total issues:', issues, '(Structure A schemas will be fixed in Phase 3)');
  "
  ```

  **Verify**: Same command. Expected: `Total issues: 0` (excluding Structure A schemas noted as Phase 3 items)

  **Rollback**: N/A (read-only check)

- [ ] **2.6** COMMIT CHECKPOINT: Phase 2 standardization (~5 min)
  Target Agent: `developer`

  **Command**:
  ```bash
  git add .claude/schemas/ .claude/context/artifacts/catalogs/schema-catalog.md .claude/context/memory/decisions.md && git commit -m "fix: Phase 2 schema standardization - $id domains, Draft-07, catalog updates"
  ```

  **Verify**:
  ```bash
  git log --oneline -1
  ```

  **Rollback**:
  ```bash
  git revert HEAD --no-edit
  ```

**Success Criteria**: All 76 schemas use `agent-studio.dev` `$id`, all use Draft-07 `$schema`, catalog has zero orphaned entries, 12 stub skills point to generic base in catalog, backward compatibility validated.

---

### Phase 3: Structure A Migration (2-3 hours)

**Purpose**: Migrate 19 Structure A schemas (14 A1 + 5 A2) and 5 Structure A3 flat schemas to canonical Structure B envelope (`{status, output}`).
**Dependencies**: Phase 2 complete
**Parallel OK**: No (sequential per-file transforms)

**Error Handling**: If a migration produces invalid JSON, revert that single file with `git checkout -- .claude/schemas/{file}` and migrate manually. If domain properties are lost, restore from backup.

**Verification Gate**:
```bash
node -e "const fs=require('fs'); const dir='.claude/schemas'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); let hasSkillName=0,hasResult=0; files.forEach(f=>{const s=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); if(s.properties&&s.properties.skillName)hasSkillName++; if(s.properties&&s.properties.result&&s.required&&s.required.includes('result'))hasResult++}); console.log('Schemas with root skillName:',hasSkillName,'Schemas with root result:',hasResult); console.log('Expected: 0 and 0')"
```

#### Tasks

- [ ] **3.1** Backup A3 security schemas before migration (~5 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const backupDir = '.claude/context/tmp/schema-backup';
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const a3 = ['skill-differential-review-output.schema.json','skill-insecure-defaults-output.schema.json','skill-static-analysis-output.schema.json','skill-variant-analysis-output.schema.json','skill-semgrep-rule-creator-output.schema.json'];
  a3.forEach(f => {
    fs.copyFileSync(dir + '/' + f, backupDir + '/' + f);
    console.log('Backed up:', f);
  });
  console.log('Backup complete:', backupDir);
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const count=fs.readdirSync('.claude/context/tmp/schema-backup').length; console.log('Backup files:', count, 'Expected: 5')"
  ```

  **Rollback**: N/A (backup is non-destructive)

- [ ] **3.2** Migrate 14 Category A1 schemas (remove skillName/version/timestamp, add status) (~90 min)
  Target Agent: `developer`
  Recommended Skills: `tdd`, `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a1 = ['skill-tdd-output','skill-debugging-output','skill-plan-generator-output','skill-code-analyzer-output','skill-best-practices-guidelines-output','skill-code-quality-expert-output','skill-code-style-validator-output','skill-dry-principle-output','skill-ripgrep-output','skill-code-semantic-search-output','skill-code-structural-search-output','skill-verification-before-completion-output','skill-agent-creator-output','skill-skill-creator-output'];
  let migrated = 0, errors = 0;
  a1.forEach(name => {
    const f = name + '.schema.json';
    const path = dir + '/' + f;
    try {
      const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
      // Remove Structure A root fields
      ['skillName','version','timestamp'].forEach(key => {
        if (schema.properties && schema.properties[key]) {
          delete schema.properties[key];
        }
        if (schema.required) {
          schema.required = schema.required.filter(r => r !== key);
        }
      });
      // Add status enum if not present
      if (!schema.properties.status) {
        schema.properties.status = {
          type: 'string',
          enum: ['success', 'partial', 'failed'],
          description: 'Execution status of the skill'
        };
      }
      // Ensure status is required
      if (!schema.required.includes('status')) {
        schema.required.push('status');
      }
      // Ensure output is required
      if (!schema.required.includes('output')) {
        schema.required.push('output');
      }
      // Ensure only status and output are required (clean up)
      schema.required = schema.required.filter(r => r === 'status' || r === 'output');
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      migrated++;
      console.log('MIGRATED A1:', f);
    } catch (e) {
      errors++;
      console.error('ERROR:', f, e.message);
    }
  });
  console.log('Migrated:', migrated, 'Errors:', errors);
  "
  ```

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a1 = ['skill-tdd-output','skill-debugging-output','skill-plan-generator-output','skill-code-analyzer-output','skill-best-practices-guidelines-output','skill-code-quality-expert-output','skill-code-style-validator-output','skill-dry-principle-output','skill-ripgrep-output','skill-code-semantic-search-output','skill-code-structural-search-output','skill-verification-before-completion-output','skill-agent-creator-output','skill-skill-creator-output'];
  let ok=0,fail=0;
  a1.forEach(name => {
    const f = name + '.schema.json';
    const s = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const hasStatus = s.properties && s.properties.status && s.properties.status.enum;
    const hasOutput = s.properties && s.properties.output;
    const noSkillName = !s.properties || !s.properties.skillName;
    const noVersion = !s.properties || !s.properties.version;
    const noTimestamp = !s.properties || !s.properties.timestamp;
    if (hasStatus && hasOutput && noSkillName && noVersion && noTimestamp) { ok++; }
    else { fail++; console.log('FAIL:', f, {hasStatus,hasOutput,noSkillName,noVersion,noTimestamp}); }
  });
  console.log('A1 migration OK:', ok, 'FAIL:', fail);
  "
  ```
  Expected: `A1 migration OK: 14 FAIL: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-tdd-output.schema.json .claude/schemas/skill-debugging-output.schema.json .claude/schemas/skill-plan-generator-output.schema.json .claude/schemas/skill-code-analyzer-output.schema.json .claude/schemas/skill-best-practices-guidelines-output.schema.json .claude/schemas/skill-code-quality-expert-output.schema.json .claude/schemas/skill-code-style-validator-output.schema.json .claude/schemas/skill-dry-principle-output.schema.json .claude/schemas/skill-ripgrep-output.schema.json .claude/schemas/skill-code-semantic-search-output.schema.json .claude/schemas/skill-code-structural-search-output.schema.json .claude/schemas/skill-verification-before-completion-output.schema.json .claude/schemas/skill-agent-creator-output.schema.json .claude/schemas/skill-skill-creator-output.schema.json
  ```

- [ ] **3.3** Migrate 5 Category A2 schemas (rename result to output, add status) (~45 min)
  Target Agent: `developer`
  Recommended Skills: `tdd`, `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a2 = ['skill-frontend-expert-output','skill-react-expert-output','skill-nextjs-expert-output','skill-android-expert-output','skill-ios-expert-output'];
  let migrated = 0, errors = 0;
  a2.forEach(name => {
    const f = name + '.schema.json';
    const path = dir + '/' + f;
    try {
      const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
      // Rename result to output
      if (schema.properties && schema.properties.result) {
        schema.properties.output = schema.properties.result;
        delete schema.properties.result;
      }
      // Remove Structure A root fields
      ['skillName','version','timestamp'].forEach(key => {
        if (schema.properties && schema.properties[key]) delete schema.properties[key];
        if (schema.required) schema.required = schema.required.filter(r => r !== key);
      });
      // Replace 'result' with 'output' in required
      if (schema.required) {
        schema.required = schema.required.map(r => r === 'result' ? 'output' : r);
      }
      // Add status enum
      if (!schema.properties.status) {
        schema.properties.status = {
          type: 'string',
          enum: ['success', 'partial', 'failed'],
          description: 'Execution status of the skill'
        };
      }
      // Set required to exactly [status, output]
      schema.required = ['status', 'output'];
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      migrated++;
      console.log('MIGRATED A2:', f);
    } catch (e) {
      errors++;
      console.error('ERROR:', f, e.message);
    }
  });
  console.log('Migrated:', migrated, 'Errors:', errors);
  "
  ```

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a2 = ['skill-frontend-expert-output','skill-react-expert-output','skill-nextjs-expert-output','skill-android-expert-output','skill-ios-expert-output'];
  let ok=0,fail=0;
  a2.forEach(name => {
    const f = name + '.schema.json';
    const s = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const hasStatus = s.properties && s.properties.status;
    const hasOutput = s.properties && s.properties.output;
    const noResult = !s.properties || !s.properties.result;
    const noSkillName = !s.properties || !s.properties.skillName;
    if (hasStatus && hasOutput && noResult && noSkillName) { ok++; }
    else { fail++; console.log('FAIL:', f); }
  });
  console.log('A2 migration OK:', ok, 'FAIL:', fail);
  "
  ```
  Expected: `A2 migration OK: 5 FAIL: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/schemas/skill-frontend-expert-output.schema.json .claude/schemas/skill-react-expert-output.schema.json .claude/schemas/skill-nextjs-expert-output.schema.json .claude/schemas/skill-android-expert-output.schema.json .claude/schemas/skill-ios-expert-output.schema.json
  ```

- [ ] **3.4** Migrate 5 Category A3 security schemas (wrap flat properties in output) (~60 min)
  Target Agent: `developer`
  Recommended Skills: `tdd`, `verification-before-completion`

  **CRITICAL**: These are Tier-1 quality schemas (Trail of Bits security skills). Preserve ALL domain-specific validation. The migration wraps existing flat properties inside an `output` object. Security Condition #2 applies.

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a3 = ['skill-differential-review-output','skill-insecure-defaults-output','skill-static-analysis-output','skill-variant-analysis-output','skill-semgrep-rule-creator-output'];
  let migrated = 0, errors = 0;
  a3.forEach(name => {
    const f = name + '.schema.json';
    const path = dir + '/' + f;
    try {
      const schema = JSON.parse(fs.readFileSync(path, 'utf8'));
      // If already has status/output at root, skip
      if (schema.required && schema.required.includes('status') && schema.required.includes('output') && schema.properties.output) {
        console.log('ALREADY MIGRATED:', f);
        migrated++;
        return;
      }
      // Save current domain properties and required
      const domainProperties = { ...schema.properties };
      const domainRequired = schema.required ? [...schema.required] : [];
      // Remove meta fields from domain properties (keep domain-specific only)
      ['skill_name','skillName','version','timestamp'].forEach(key => {
        delete domainProperties[key];
      });
      const cleanRequired = domainRequired.filter(r => !['skill_name','skillName','version','timestamp'].includes(r));
      // Rebuild schema with Structure B envelope
      schema.required = ['status', 'output'];
      schema.properties = {
        status: {
          type: 'string',
          enum: ['success', 'partial', 'failed'],
          description: 'Execution status of the skill'
        },
        output: {
          type: 'object',
          description: 'Domain-specific output for ' + name.replace('skill-','').replace('-output',''),
          required: cleanRequired,
          properties: domainProperties,
          additionalProperties: false
        }
      };
      schema.additionalProperties = false;
      fs.writeFileSync(path, JSON.stringify(schema, null, 2) + '\n');
      migrated++;
      console.log('MIGRATED A3:', f, '- Preserved', Object.keys(domainProperties).length, 'domain properties');
    } catch (e) {
      errors++;
      console.error('ERROR:', f, e.message);
    }
  });
  console.log('Migrated:', migrated, 'Errors:', errors);
  "
  ```

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const a3 = ['skill-differential-review-output','skill-insecure-defaults-output','skill-static-analysis-output','skill-variant-analysis-output','skill-semgrep-rule-creator-output'];
  let ok=0,fail=0;
  a3.forEach(name => {
    const f = name + '.schema.json';
    const s = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const hasStatus = s.required && s.required.includes('status');
    const hasOutput = s.required && s.required.includes('output');
    const outputHasProps = s.properties && s.properties.output && s.properties.output.properties && Object.keys(s.properties.output.properties).length > 0;
    const outputHasReq = s.properties && s.properties.output && s.properties.output.required && s.properties.output.required.length > 0;
    if (hasStatus && hasOutput && outputHasProps && outputHasReq) { ok++; }
    else { fail++; console.log('FAIL:', f, {hasStatus,hasOutput,outputHasProps,outputHasReq}); }
  });
  console.log('A3 migration OK:', ok, 'FAIL:', fail);
  "
  ```
  Expected: `A3 migration OK: 5 FAIL: 0`

  **Rollback**:
  ```bash
  node -e "const fs=require('fs'); const src='.claude/context/tmp/schema-backup'; const dst='.claude/schemas'; fs.readdirSync(src).forEach(f=>{fs.copyFileSync(src+'/'+f,dst+'/'+f);console.log('Restored:',f)})"
  ```

- [ ] **3.5** Final validation: all 76 schemas valid JSON with Structure B envelope (~15 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const dir = '.claude/schemas';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill-') && f.endsWith('.schema.json'));
  let ok=0, issues=[];
  files.forEach(f => {
    try {
      const s = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
      const checks = [];
      if (s.additionalProperties !== false) checks.push('no additionalProperties:false');
      if (!s['\$id'] || !s['\$id'].includes('agent-studio.dev')) checks.push('bad $id');
      if (s['\$schema'] !== 'http://json-schema.org/draft-07/schema#') checks.push('bad $schema');
      if (!s.required || !s.required.includes('status')) checks.push('no status required');
      if (!s.required || !s.required.includes('output')) checks.push('no output required');
      if (checks.length > 0) { issues.push(f + ': ' + checks.join(', ')); }
      else { ok++; }
    } catch (e) { issues.push(f + ': INVALID JSON - ' + e.message); }
  });
  console.log('PASS:', ok, '/', files.length);
  if (issues.length > 0) { console.log('ISSUES:'); issues.forEach(i => console.log(' -', i)); }
  else { console.log('ALL SCHEMAS PASS VALIDATION'); }
  "
  ```

  **Verify**: Same command. Expected: `ALL SCHEMAS PASS VALIDATION`

  **Rollback**: N/A (read-only check)

- [ ] **3.6** COMMIT CHECKPOINT: Phase 3 migration (~5 min)
  Target Agent: `developer`

  **Command**:
  ```bash
  git add .claude/schemas/ && git commit -m "fix: Phase 3 Structure A migration - 14 A1 + 5 A2 + 5 A3 schemas migrated to canonical envelope"
  ```

  **Verify**:
  ```bash
  git log --oneline -1
  ```

  **Rollback**:
  ```bash
  git revert HEAD --no-edit
  ```

**Success Criteria**: All 76 schemas have `{status, output}` Structure B envelope. Zero schemas have `skillName`, `version`, `timestamp`, or `result` at root. All A3 security schemas preserve their domain properties inside `output`.

---

### Phase R: Rules Cleanup (2-3 hours, parallel with Phases 2-3)

**Purpose**: Delete 8 valueless stub rules files, enhance 7 domain-specific stubs with actionable content. Satisfies Security Condition #2 (preserve security-adjacent rules).
**Dependencies**: None (rules are independent of schemas)
**Parallel OK**: YES -- can run in parallel with Phases 2-3

**Error Handling**: If a deleted rules file is referenced by an agent, restore the file and document the reference. If an enhanced rules file fails quality review, iterate on content.

**Verification Gate**:
```bash
node -e "const fs=require('fs'); const dir='.claude/rules'; const files=fs.readdirSync(dir).filter(f=>f.endsWith('.md')); let stubs=0; files.forEach(f=>{const content=fs.readFileSync(dir+'/'+f,'utf8'); const lines=content.split('\n').length; if(lines<30){stubs++;console.log('STUB:',f,'('+lines+' lines)')}}); console.log('Stub rules files (<30 lines):',stubs)"
```
Expected: `Stub rules files (<30 lines): 0`

#### Tasks

- [ ] **R.1** Delete 8 stub rules files (~15 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const fs = require('fs');
  const stubs = [
    'scientific-skills.md',
    'git-expert.md',
    'doc-generator.md',
    'readme.md',
    'summarize-changes.md',
    'writing-skills.md',
    'binary-analysis-patterns.md',
    'memory-forensics.md'
  ];
  let deleted = 0;
  stubs.forEach(f => {
    const path = '.claude/rules/' + f;
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
      deleted++;
      console.log('DELETED:', f);
    } else {
      console.log('NOT FOUND:', f);
    }
  });
  console.log('Deleted', deleted, 'of', stubs.length, 'stubs');
  "
  ```

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const stubs=['scientific-skills.md','git-expert.md','doc-generator.md','readme.md','summarize-changes.md','writing-skills.md','binary-analysis-patterns.md','memory-forensics.md']; let exists=0; stubs.forEach(f=>{if(fs.existsSync('.claude/rules/'+f)){exists++;console.log('STILL EXISTS:',f)}}); console.log('Remaining stubs:',exists,'Expected: 0')"
  ```
  Expected: `Remaining stubs: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/rules/scientific-skills.md .claude/rules/git-expert.md .claude/rules/doc-generator.md .claude/rules/readme.md .claude/rules/summarize-changes.md .claude/rules/writing-skills.md .claude/rules/binary-analysis-patterns.md .claude/rules/memory-forensics.md
  ```

- [ ] **R.2** Verify no broken references to deleted rules files (~10 min)
  Target Agent: `developer`
  Recommended Skills: `verification-before-completion`

  **Command**:
  ```bash
  node -e "
  const { execSync } = require('child_process');
  const deleted = ['scientific-skills.md','git-expert.md','doc-generator.md','readme.md','summarize-changes.md','writing-skills.md','binary-analysis-patterns.md','memory-forensics.md'];
  let found = 0;
  deleted.forEach(f => {
    try {
      const result = execSync('grep -rl \"rules/' + f + '\" .claude/agents .claude/skills .claude/context --include=\"*.md\" --include=\"*.json\" 2>nul || echo \"\"', { encoding: 'utf8' }).trim();
      if (result) { console.log('REFERENCE FOUND for', f, ':', result); found++; }
    } catch(e) {}
  });
  console.log('Broken references:', found);
  "
  ```

  **Verify**: Expected: `Broken references: 0`

  **Rollback**: N/A (read-only check)

- [ ] **R.3** Enhance 7 domain-specific rules files (~120 min) [SEC Condition #2]
  Target Agent: `technical-writer`
  Recommended Skills: `writing-skills`, `doc-generator`, `verification-before-completion`

  **CRITICAL**: Security-adjacent rules (consensus-voting, protocol-reverse-engineering) MUST be enhanced, NOT deleted. This satisfies Security Condition #2.

  Enhance each of the following 7 rules files with domain-specific content. Each enhanced file must have: Core Principles, Standards/Patterns, Anti-Patterns, Integration Points sections. Target: 80-150 lines each.

  **Files to enhance**:
  1. `.claude/rules/consensus-voting.md` -- Add: voting protocols (majority/supermajority/unanimous), conflict resolution, quorum requirements, Byzantine fault tolerance, integration with master-orchestrator
  2. `.claude/rules/swarm-coordination.md` -- Add: Queen/Worker topology, fan-out/fan-in patterns, failure handling, message passing format, maximum parallel agents
  3. `.claude/rules/diagram-generator.md` -- Add: Mermaid syntax rules, diagram type selection matrix, node count limits (~200), output location rules
  4. `.claude/rules/sequential-thinking.md` -- Add: thought numbering rules, revision protocol, branching rules, optimal stopping, integration with planner
  5. `.claude/rules/protocol-reverse-engineering.md` -- Add: packet capture rules, protocol state machine patterns, documentation format, tool integration
  6. `.claude/rules/test-generator.md` -- Add: test type selection matrix, fixture generation rules, naming conventions, edge case enumeration
  7. `.claude/rules/insight-extraction.md` -- Add: extraction triggers, insight format template, deduplication, domain tagging, memory integration

  **Command**: For each file, the technical-writer agent should read the existing content, read the corresponding SKILL.md, and write enhanced rules following the pattern of high-quality rules like `tdd.md` or `debugging.md`. Use `Edit` tool for each file.

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const targets = ['consensus-voting.md','swarm-coordination.md','diagram-generator.md','sequential-thinking.md','protocol-reverse-engineering.md','test-generator.md','insight-extraction.md'];
  let ok=0, fail=0;
  targets.forEach(f => {
    const content = fs.readFileSync('.claude/rules/' + f, 'utf8');
    const lines = content.split('\n').length;
    const hasCore = content.includes('Core Principles') || content.includes('Core Rules');
    const hasAnti = content.includes('Anti-Pattern');
    const hasIntegration = content.includes('Integration');
    if (lines >= 60 && hasCore && hasAnti && hasIntegration) { ok++; }
    else { fail++; console.log('NEEDS WORK:', f, '(' + lines + ' lines, core:' + hasCore + ', anti:' + hasAnti + ', integ:' + hasIntegration + ')'); }
  });
  console.log('Enhanced OK:', ok, 'Needs work:', fail);
  "
  ```
  Expected: `Enhanced OK: 7 Needs work: 0`

  **Rollback**:
  ```bash
  git checkout -- .claude/rules/consensus-voting.md .claude/rules/swarm-coordination.md .claude/rules/diagram-generator.md .claude/rules/sequential-thinking.md .claude/rules/protocol-reverse-engineering.md .claude/rules/test-generator.md .claude/rules/insight-extraction.md
  ```

- [ ] **R.4** Update rules-catalog.md (remove deleted, verify enhanced) (~15 min)
  Target Agent: `technical-writer`
  Recommended Skills: `verification-before-completion`

  **Command**: Edit `.claude/context/artifacts/catalogs/rules-catalog.md` to:
  1. Remove entries for the 8 deleted rules files
  2. Update entries for the 7 enhanced rules files with new descriptions

  **Verify**:
  ```bash
  node -e "
  const fs = require('fs');
  const catalog = fs.readFileSync('.claude/context/artifacts/catalogs/rules-catalog.md', 'utf8');
  const deleted = ['scientific-skills','git-expert','doc-generator','readme','summarize-changes','writing-skills','binary-analysis-patterns','memory-forensics'];
  let issues = 0;
  deleted.forEach(name => {
    // Check if the catalog still references deleted rules as active entries
    // (references in 'deleted' sections are OK)
    if (catalog.includes('rules/' + name + '.md')) {
      console.log('WARNING: catalog still references deleted rule:', name);
      issues++;
    }
  });
  console.log('Issues:', issues);
  "
  ```

  **Rollback**:
  ```bash
  git checkout -- .claude/context/artifacts/catalogs/rules-catalog.md
  ```

- [ ] **R.5** COMMIT CHECKPOINT: Phase R rules cleanup (~5 min)
  Target Agent: `developer`

  **Command**:
  ```bash
  git add .claude/rules/ .claude/context/artifacts/catalogs/rules-catalog.md && git commit -m "fix: Phase R rules cleanup - delete 8 stubs, enhance 7 domain rules"
  ```

  **Verify**:
  ```bash
  git log --oneline -1
  ```

  **Rollback**:
  ```bash
  git revert HEAD --no-edit
  ```

**Success Criteria**: 8 stub rules deleted, 7 rules enhanced to 80+ lines with Core Principles/Anti-Patterns/Integration Points, zero broken references, rules-catalog.md updated.

---

### Phase 4: Documentation and Prevention (1-2 hours)

**Purpose**: Write ADR-095 documenting all decisions, update schema-creator rules to enforce new standards, update skill-creator checklist, record learnings.
**Dependencies**: Phases 1-3 and R complete
**Parallel OK**: No

**Error Handling**: If ADR conflicts with existing decisions.md content, append rather than overwrite. If schema-creator rules update is too aggressive, review and adjust.

**Verification Gate**: ADR-095 exists in decisions.md, schema-creator.md references Draft-07 and `additionalProperties:false`, learnings.md updated.

#### Tasks

- [ ] **4.1** Write ADR-095 in decisions.md (~30 min) [SEC Condition #3]
  Target Agent: `technical-writer`
  Recommended Skills: `doc-generator`, `verification-before-completion`

  **CRITICAL**: Must document ALL FOUR envelope variants (A1, A2, A3, B) per Security Condition #3. Include migration rationale and backward compatibility notes.

  **Command**: Append ADR-095 to `.claude/context/memory/decisions.md`. The ADR must include:
  - Context: 87 schemas with 4 envelope variants after skill expansion
  - Decision: Structure B canonical, Draft-07, `additionalProperties:false`, `agent-studio.dev` `$id`
  - All 4 variants documented: A1 (skillName/version/timestamp/output), A2 (skillName/timestamp/result), A3 (flat Trail of Bits), B (status/output)
  - Alternatives considered: Structure A canonical (rejected), Draft 2020-12 (rejected), $ref pattern (rejected)
  - Consequences: 75 active schemas use identical envelope, generic base makes genericity explicit

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const content=fs.readFileSync('.claude/context/memory/decisions.md','utf8'); console.log('Has ADR-095:', content.includes('ADR-095')); console.log('Documents A1:', content.includes('skillName/version/timestamp/output') || content.includes('Category A1')); console.log('Documents A2:', content.includes('skillName/timestamp/result') || content.includes('Category A2')); console.log('Documents A3:', content.includes('Trail of Bits') || content.includes('Category A3')); console.log('Documents B:', content.includes('status/output') || content.includes('Structure B'))"
  ```
  Expected: All `true`

  **Rollback**:
  ```bash
  git checkout -- .claude/context/memory/decisions.md
  ```

- [ ] **4.2** Update schema-creator rules to enforce new standards (~30 min)
  Target Agent: `technical-writer`
  Recommended Skills: `writing-skills`, `verification-before-completion`

  **Command**: Edit `.claude/rules/schema-creator.md` to:
  1. Change `Draft 2020-12` to `draft-07` in template and text
  2. Change `$schema` URL from `https://json-schema.org/draft/2020-12/schema` to `http://json-schema.org/draft-07/schema#`
  3. Update `$id` pattern to `https://agent-studio.dev/schemas/skill-{name}-output.schema.json`
  4. Add `additionalProperties: false` at root and output levels in the template
  5. Add `status` enum and `output` object as the only root-level required properties
  6. Add note: "Skills without domain output should reference `generic-skill-output-base.schema.json` rather than creating a hollow stub"

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const content=fs.readFileSync('.claude/rules/schema-creator.md','utf8'); console.log('Has draft-07:', content.includes('draft-07')); console.log('No 2020-12:', !content.includes('2020-12')); console.log('Has additionalProperties:', content.includes('additionalProperties')); console.log('Has agent-studio.dev:', content.includes('agent-studio.dev')); console.log('Has generic base ref:', content.includes('generic-skill-output-base'))"
  ```
  Expected: All `true`

  **Rollback**:
  ```bash
  git checkout -- .claude/rules/schema-creator.md
  ```

- [ ] **4.3** Update skill-creator post-creation checklist (~15 min)
  Target Agent: `technical-writer`
  Recommended Skills: `verification-before-completion`

  **Command**: Edit `.claude/rules/skill-creator.md` to add to the Post-Creation Checklist:
  - `[ ] Schema uses Structure B envelope (status/output)`
  - `[ ] Schema has additionalProperties:false at root and output`
  - `[ ] Schema uses Draft-07 ($schema)`
  - `[ ] Schema $id uses agent-studio.dev domain`
  - `[ ] If no domain output, reference generic-skill-output-base.schema.json in catalog (do NOT create hollow stub)`

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const content=fs.readFileSync('.claude/rules/skill-creator.md','utf8'); console.log('Has Structure B:', content.includes('Structure B')); console.log('Has additionalProperties:', content.includes('additionalProperties')); console.log('Has Draft-07:', content.includes('Draft-07') || content.includes('draft-07')); console.log('Has generic base:', content.includes('generic-skill-output-base'))"
  ```
  Expected: All `true`

  **Rollback**:
  ```bash
  git checkout -- .claude/rules/skill-creator.md
  ```

- [ ] **4.4** Record learnings in learnings.md (~15 min)
  Target Agent: `developer`
  Recommended Skills: `insight-extraction`, `verification-before-completion`

  **Command**: Append to `.claude/context/memory/learnings.md`:
  1. "Batch Schema Migration Pattern" -- script-based migration with JSON parse/modify/write, verification at each phase
  2. "additionalProperties:false as Security Control" -- prevents mass-assignment-style bypass via CWE-20
  3. "Hollow Stub Detection" -- when artifacts are byte-for-byte identical, replace with single base + catalog reference
  4. "Four-Phase Schema Migration" -- foundation (base+delete), standardization (properties), migration (envelope), documentation (ADR)

  **Verify**:
  ```bash
  node -e "const fs=require('fs'); const content=fs.readFileSync('.claude/context/memory/learnings.md','utf8'); console.log('Has batch migration:', content.includes('Batch Schema Migration')); console.log('Has additionalProperties learning:', content.includes('additionalProperties') && content.includes('Security Control'))"
  ```

  **Rollback**:
  ```bash
  git checkout -- .claude/context/memory/learnings.md
  ```

- [ ] **4.5** Final commit: Phase 4 documentation (~5 min)
  Target Agent: `developer`

  **Command**:
  ```bash
  git add .claude/context/memory/ .claude/rules/schema-creator.md .claude/rules/skill-creator.md && git commit -m "docs: Phase 4 documentation - ADR-095, updated creator rules, learnings"
  ```

  **Verify**:
  ```bash
  git log --oneline -3
  ```

  **Rollback**:
  ```bash
  git revert HEAD --no-edit
  ```

**Success Criteria**: ADR-095 documents all 4 envelope variants and migration rationale. schema-creator.md enforces Structure B + Draft-07 + `additionalProperties:false`. skill-creator.md prevents hollow stub creation. Learnings captured.

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction.

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed schema standardization and rules cleanup work from this plan (impl-schema-rules-fix-2026-02-09.md). Extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created, such as a schema-validator agent or batch-migration skill)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Timeline Summary

| Phase | Description | Tasks | Est. Time | Parallel? |
|-------|-------------|-------|-----------|-----------|
| Phase 1 | Foundation (base schema, additionalProperties, stub deletion) | 6 | 2-3 hours | No |
| Phase 2 | Batch Standardization ($schema, $id, catalog) | 6 | 2-3 hours | Partially |
| Phase 3 | Structure A Migration (A1 + A2 + A3) | 6 | 2-3 hours | No |
| Phase R | Rules Cleanup (delete 8, enhance 7) | 5 | 2-3 hours | YES (parallel with 2-3) |
| Phase 4 | Documentation and Prevention (ADR, creator rules) | 5 | 1-2 hours | No |
| Phase FINAL | Reflection | 1 | 0.5 hours | No |
| **Total** | | **29** | **8-12 hours** | **~6-8 hours wall-clock** |

## Commit Checkpoint Pattern

This plan modifies 76+ schema files, 15+ rules files, and 5+ catalog/memory files. Per the commit checkpoint pattern (10+ files threshold), commit checkpoints are included at the end of each phase:

- Phase 1 checkpoint (Task 1.6): Foundation changes committed
- Phase 2 checkpoint (Task 2.6): Standardization changes committed
- Phase 3 checkpoint (Task 3.6): Migration changes committed
- Phase R checkpoint (Task R.5): Rules changes committed
- Phase 4 checkpoint (Task 4.5): Documentation changes committed

## Agent Assignment Summary

| Phase | Primary Agent | Secondary Agent | Skills |
|-------|--------------|----------------|--------|
| Phase 1 | `developer` | -- | `verification-before-completion` |
| Phase 2 | `developer` | `technical-writer` (2.4) | `verification-before-completion`, `doc-generator` |
| Phase 3 | `developer` | -- | `tdd`, `verification-before-completion` |
| Phase R | `developer` (R.1-R.2), `technical-writer` (R.3-R.4) | -- | `writing-skills`, `doc-generator`, `verification-before-completion` |
| Phase 4 | `technical-writer` (4.1-4.3), `developer` (4.4-4.5) | -- | `doc-generator`, `writing-skills`, `insight-extraction`, `verification-before-completion` |
