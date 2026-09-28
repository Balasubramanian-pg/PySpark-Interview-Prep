# 2.9 File Formats And Compression

File format and compression choices are among the highest-leverage decisions in a PySpark pipeline. They directly determine storage cost, read and write throughput, network shuffle volume, and even whether predicate pushdown and column pruning are possible. A poor choice can make a job run ten times slower, while a well-chosen format and codec can reduce query time by up to 80 percent and storage footprint by 10x compared to naive row-based storage. Spark 3.x provides native, optimized readers and writers for Parquet, ORC, Avro, CSV, and JSON, each with distinct strengths and trade-offs.

### Row-Based vs Columnar Formats

The most important architectural distinction is between row-based and columnar storage.

**Row-based formats** (CSV, JSON, Avro) store all fields of a record together on disk. Reading a single column requires reading entire rows and discarding unwanted fields. They are well-suited for write-heavy workloads, streaming ingestion, and scenarios where entire records are consumed together, such as Change Data Capture (CDC).

**Columnar formats** (Parquet, ORC) store values from the same column contiguously. This enables two critical optimizations: reading only the columns a query needs (column pruning), and skipping row groups or stripes that do not satisfy filter predicates (predicate pushdown). Columnar formats also achieve much higher compression ratios because values within a column share similar data types and often similar values.

| Format | Storage Layout | Schema Evolution | Predicate Pushdown | Best For |
|--------|---------------|------------------|-------------------|----------|
| Parquet | Columnar | Excellent | Yes | Analytical queries, data warehousing |
| ORC | Columnar | Good (limited) | Yes (with indexes) | Hive integration, heavy analytical scans |
| Avro | Row-based | Excellent | No | Streaming, CDC, data exchange |
| CSV | Row-based text | Poor | No | Data exchange, quick debugging |
| JSON | Row-based text | Poor | No | Semi-structured ingestion, logs |

### Parquet

Parquet is Spark's default file format and the de facto standard for analytical workloads. It is columnar, splittable, and stores the schema in the file footer. Spark 3.x includes a vectorized Parquet reader that decodes data in batches, significantly improving scan throughput on wide tables.

**Writing Parquet with compression:**

```python
# Default compression is snappy
df.write.mode("overwrite").parquet("path/to/output")

# Specify a different codec explicitly
df.write \
    .option("compression", "zstd") \
    .mode("overwrite") \
    .parquet("path/to/output")

# Using the SQL configuration
spark.conf.set("spark.sql.parquet.compression.codec", "gzip")
df.write.mode("overwrite").parquet("path/to/output")
```

**SQL equivalent:**

```sql
-- Set compression at session level
SET spark.sql.parquet.compression.codec = zstd;

-- Create a Parquet table
CREATE TABLE my_table
USING PARQUET
OPTIONS (compression 'zstd')
AS SELECT * FROM source_table;
```

Parquet supports the following compression codecs: `snappy` (default), `gzip`, `lzo`, `brotli`, `lz4`, and `zstd`. The `compression` option on the writer overrides the session-level configuration.

**Parquet strengths:**
- Columnar layout with dictionary encoding and run-length encoding.
- Excellent schema evolution support, including adding and removing columns.
- Predicate pushdown on filter columns.
- Native vectorized reader in Spark 3.x for fast decoding.

**Parquet limitations:**
- Writing is more CPU-intensive than Avro due to encoding overhead.
- Not ideal for streaming ingestion where records arrive one at a time.
- Schema changes can sometimes require rewriting historical files in certain metastore configurations.

### ORC

ORC (Optimized Row Columnar) is another columnar format, originally developed for Hive. It provides high compression ratios, lightweight indexes, bloom filters, and stripe-level statistics that can accelerate predicate-heavy scans. ORC is particularly well-suited when Spark integrates with Hive or when queries involve large column scans with selective filters.

**Writing ORC:**

```python
# Default compression is snappy
df.write.mode("overwrite").orc("path/to/output")

# Specify zlib compression
df.write \
    .option("compression", "zlib") \
    .mode("overwrite") \
    .orc("path/to/output")
```

**SQL equivalent:**

```sql
SET spark.sql.orc.compression.codec = zlib;

CREATE TABLE my_orc_table
USING ORC
AS SELECT * FROM source_table;
```

ORC supports `snappy`, `zlib`, `lzo`, `zstd`, and `lz4` codecs. The default is `snappy`.

**ORC strengths:**
- Built-in indexes and bloom filters for fast predicate evaluation.
- High compression ratios, often producing smaller files than Parquet on the same data.
- Excellent read performance for numeric-heavy workloads and predicate-heavy scans.

**ORC limitations:**
- Schema evolution support is less mature than Parquet's.
- Spark's ORC reader historically had more edge cases than the Parquet reader.
- Less portable outside the Hadoop and Hive ecosystem.

### Avro

Avro is a row-based binary format with schema embedded in the file header. Its primary strengths are compact binary serialization and excellent schema evolution support, making it the format of choice for streaming systems such as Kafka and for Change Data Capture pipelines.

**Writing Avro:**

```python
# Avro requires the spark-avro package
# Default compression is snappy
df.write.format("avro").mode("overwrite").save("path/to/output")

# Specify deflate compression with a level
df.write \
    .format("avro") \
    .option("compression", "deflate") \
    .option("compressionLevel", 5) \
    .mode("overwrite") \
    .save("path/to/output")
```

**SQL equivalent:**

```sql
SET spark.sql.avro.compression.codec = deflate;
SET spark.sql.avro.deflate.level = 5;

CREATE TABLE my_avro_table
USING AVRO
AS SELECT * FROM source_table;
```

Avro supports `snappy` (default), `deflate`, `bzip2`, `xz`, and `zstandard`. The deflate compression level can be controlled via `spark.sql.avro.deflate.level`.

**Avro strengths:**
- Excellent schema evolution, including adding fields with defaults.
- Compact binary encoding.
- Fast writes, making it suitable for ingestion pipelines.
- Interoperable across languages and platforms.

**Avro limitations:**
- Row-based, so reading a single column requires reading the entire record.
- No predicate pushdown.
- Slower for analytical queries compared to Parquet and ORC.
- Wide Avro tables can exhibit poor query performance in certain Spark versions.

### CSV and JSON

CSV and JSON are text-based formats with no built-in compression by default. They are useful for data exchange, ingestion from external systems, and debugging, but they are unsuitable for large-scale analytical workloads.

```python
# CSV with gzip compression
df.write \
    .option("compression", "gzip") \
    .mode("overwrite") \
    .csv("path/to/output")

# JSON with gzip compression
df.write \
    .option("compression", "gzip") \
    .mode("overwrite") \
    .json("path/to/output")
```

Text-based formats support `none` (default), `bzip2`, `gzip`, `lz4`, `snappy`, `deflate`, and `zstd` compression codecs. Note that gzip and bzip2 are not splittable, meaning Spark cannot parallelize reads of a single gzip file; the entire file must be processed by one task. This is a significant limitation for large files.

### Compression Codecs

Compression is orthogonal to file format: any supported codec can be used with a compatible format. The choice of codec involves a trade-off between compression ratio, CPU cost, and splittability.

| Codec | Compression Ratio | Speed | Splittable | Typical Use |
|-------|-------------------|-------|------------|-------------|
| Snappy | Moderate | Very fast | Yes (in Parquet/ORC) | Default for Parquet, balanced choice |
| Gzip | High | Slow | No (in CSV/JSON) | Archival, cold storage |
| Zstd | High | Fast | Yes | Best balance for Parquet |
| LZ4 | Moderate | Very fast | Yes | Speed-critical workloads |
| Deflate | Moderate to high | Moderate | No | Avro default alternative |
| Bzip2 | Very high | Very slow | No | Rarely used in Spark |

Benchmark studies consistently show that Gzip achieves the best compression ratio at the cost of speed, while Snappy and LZ4 prioritize speed. Zstd offers a hybrid approach, combining good compression ratios with competitive speed. For Parquet and ORC, which are internally block-splittable, the codec does not affect splittability.

**Selecting a codec:**

```python
# Parquet with zstd for a balance of ratio and speed
df.write.option("compression", "zstd").parquet("path/to/output")

# ORC with zlib for higher compression
df.write.option("compression", "zlib").orc("path/to/output")

# CSV with gzip (note: not splittable)
df.write.option("compression", "gzip").csv("path/to/output")
```

### Performance Implications

File format and compression choices affect performance at every stage of a pipeline.

- **Read throughput:** Columnar formats with vectorized readers can scan 1.5 to 2.5 GB/s per core on dictionary-encoded columns, while row-based formats are significantly slower for selective queries.
- **Storage cost:** Parquet and ORC typically reduce storage by an order of magnitude compared to uncompressed CSV.
- **Shuffle volume:** When Spark shuffles data, it uses the internal Tungsten binary format, not the file format on disk. However, the file format influences how much data is read before the shuffle.
- **Predicate pushdown:** Columnar formats allow Spark to skip row groups that do not match filters. Row-based formats cannot skip data based on column predicates.
- **Schema handling:** Providing an explicit schema at read time avoids an extra pass over the data for inference and prevents incorrect type inference, especially with JSON and CSV.
- **Small file problem:** Writing many small files (a common outcome of excessive partitioning) creates scheduling overhead and metadata pressure. Use `coalesce()` or `repartition()` before writing to control file count.

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.parquet.compression.codec` | `snappy` | Codec for Parquet writes. |
| `spark.sql.orc.compression.codec` | `snappy` | Codec for ORC writes. |
| `spark.sql.avro.compression.codec` | `snappy` | Codec for Avro writes. |
| `spark.sql.avro.deflate.level` | `-1` | Deflate compression level for Avro (1-9). |
| `spark.sql.parquet.enableVectorizedReader` | `true` | Enables the vectorized Parquet reader. |
| `spark.sql.orc.enableVectorizedReader` | `true` | Enables the vectorized ORC reader. |
| `spark.sql.parquet.filterPushdown` | `true` | Enables Parquet filter pushdown. |
| `spark.sql.orc.filterPushdown` | `true` | Enables ORC filter pushdown. |

### Best Practices and When to Use

- **Use Parquet as the default for analytical workloads.** It has the best ecosystem support, mature schema evolution, and strong performance in Spark 3.x.
- **Use ORC when Hive integration is a priority** or when queries are dominated by predicate-heavy scans on numeric columns.
- **Use Avro for streaming ingestion and CDC pipelines.** Its row-based layout and schema evolution support make it ideal for write-heavy, append-only workloads.
- **Use CSV and JSON only for ingestion and exchange.** Convert to Parquet or ORC as early as possible in the pipeline.
- **Prefer zstd compression for Parquet** when storage cost is a concern and CPU headroom is available. Snappy remains a safe default when write latency matters.
- **Avoid gzip and bzip2 for large files** unless the format is internally splittable (Parquet, ORC). A single gzip CSV file cannot be read in parallel.
- **Provide explicit schemas at read time.** Schema inference adds a full scan and can produce incorrect types, particularly for JSON.
- **Coalesce or repartition before writing** to control output file count and avoid the small file problem.
- **Partition output by low-cardinality filter columns** (e.g., date, region) to enable partition pruning on subsequent reads.

### Common Pitfalls and Limitations

- **Default compression is not always optimal.** Snappy is fast but yields moderate compression. For cold data or cost-sensitive storage, zstd or gzip may be better.
- **Not all codecs are splittable.** Gzip and bzip2 files cannot be split by Spark. A single large gzip file is processed by one task, creating a bottleneck.
- **Schema evolution differences.** Parquet and Avro handle schema changes gracefully. ORC and CSV do not. Choose the format based on whether schema changes are expected.
- **Avro wide tables.** Queries against Avro tables with many columns can be unexpectedly slow in certain Spark versions.
- **Writing many small files.** Partitioning by high-cardinality columns (e.g., user ID) creates thousands of tiny files, degrading read performance.
- **Compression level tuning.** For deflate and zstd, the default level is not always optimal. Higher levels improve compression at the cost of CPU.
- **Ignoring file size targets.** Aim for 128 MB to 1 GB per output file for Parquet and ORC. Files that are too small or too large both hurt performance.
- **Not leveraging predicate pushdown.** Filtering on a column that is not stored in a way that supports pushdown (e.g., a computed expression) prevents Spark from skipping data.

### Summary

File format and compression are not afterthoughts; they are first-class performance decisions in PySpark. Parquet is the default and best general-purpose choice for analytical workloads, offering columnar storage, predicate pushdown, and strong schema evolution. ORC excels in Hive-centric environments and predicate-heavy scans. Avro is the format of choice for streaming and CDC due to its row-based layout and schema evolution. CSV and JSON are suitable only for ingestion and exchange. Compression codecs trade ratio against speed: Snappy for speed, Zstd for balance, and Gzip for maximum ratio at the cost of CPU and splittability. By choosing the right format and codec, tuning configuration parameters, and following best practices around schema, partitioning, and file sizing, you can achieve dramatic improvements in both storage cost and query performance in Spark 3.x.
