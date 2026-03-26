# LanceDB Rules

## Schema Design

- Define schemas using `lancedb` `Schema` with typed columns; never use untyped dicts as row data
- Always include a `vector` column of type `pa.list_(pa.float32(), <dim>)` matching your embedding model's output dimension
- Add a `id` string column as primary key for upsert and delete operations
- Store metadata (source, timestamp, chunk index) as typed columns — do not JSON-serialize into a single blob column

## Indexing

- Create an IVF_PQ index after writing at least 256 rows; creating earlier produces a degenerate index
- Set `num_partitions` to `sqrt(row_count)` (rounded to nearest power of 2) as a starting heuristic
- Set `num_sub_vectors` to `embedding_dim / 8` for balanced recall vs. size
- Always call `table.create_index(metric="cosine")` for normalized embeddings; use `"l2"` only for raw feature vectors
- Rebuild the index after bulk writes that increase row count by more than 20%

## Hybrid Search

- Combine vector ANN with full-text FTS using `table.search(...).where(...)` filter pushdown, not post-hoc Python filtering
- Use `LanceVectorIndex` + `LanceFtsIndex` together; never rely on vector-only search for keyword-heavy queries
- Apply reranking (reciprocal rank fusion or cross-encoder) after combining vector and FTS results
- Set `nprobes` to at least 20 for production ANN searches; default (1) is for benchmarking only

## Versioning and Time Travel

- LanceDB tables are versioned automatically on every write; use `table.checkout(version)` for auditing, not rollback in hot paths
- Compact periodically with `table.compact_files()` — uncompacted versions accumulate small fragment files that slow scans
- Set a retention policy via `table.cleanup_old_versions(older_than=timedelta(days=30))` to control disk growth
- Never delete the `.lance` directory manually; always use LanceDB API to avoid corrupting the manifest

## Batch Writes

- Write in batches of 512–4096 rows; single-row inserts create excessive fragment files
- Use `table.add(data, mode="append")` for incremental ingestion; use `mode="overwrite"` only for full reloads
- For upserts, delete by `id` then re-add — LanceDB has no native upsert; wrap in a transaction if using concurrent writers
- Embed vectors outside the write loop; never embed inside an `add()` call (blocks I/O thread)

## Anti-Patterns

- Never store embeddings in a plain SQLite or JSON file and call it a "vector store" — use LanceDB's columnar format
- Never skip index creation for tables >10K rows; full-scan ANN is O(n) and will timeout in production
- Never share a single LanceDB `Connection` across threads without a lock; use one connection per thread or process
- Never run `table.to_pandas()` on multi-million-row tables for filtering — push filters down via `where()` before collecting

## When to invoke

`Skill({ skill: 'database-expert' })` for LanceDB schema design and query optimization tasks
