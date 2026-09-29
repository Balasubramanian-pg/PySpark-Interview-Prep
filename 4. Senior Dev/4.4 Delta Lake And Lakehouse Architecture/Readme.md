# 4.4 Delta Lake And Lakehouse Architecture

**Delta Lake** is an open-source storage layer that brings ACID transactions, schema enforcement, time travel, and scalable metadata handling to data lakes built on Parquet files. A **Lakehouse** architecture combines the low-cost, open storage of a data lake with the reliability and performance guarantees of a data warehouse. Delta Lake is the storage foundation that makes the Lakehouse possible, and the **Medallion Architecture** (Bronze, Silver, Gold) is the most common pattern for organizing data within it. This section covers Delta Lake internals, core features, optimization techniques, and the architectural patterns that senior data engineers are expected to explain in interviews.

#### Delta Lake Transaction Log

The **transaction log** (stored in the `_delta_log` directory) is the single source of truth for a Delta table. Every write, update, delete, merge, or schema change creates a new, atomic commit in the log. The log records metadata about which Parquet files are part of the table at each version, along with statistics for data skipping and schema information. The transaction log enables ACID guarantees by providing **serializable isolation for writes** and **snapshot isolation for reads**. Multiple concurrent writers can modify the table without corrupting data because Delta Lake uses **optimistic concurrency control**: each writer checks for conflicting commits before finalizing its own.

The log consists of JSON files for each commit (e.g., `00000000000000000010.json`) and periodic Parquet checkpoint files that compact the log for faster reads. **Scalable metadata handling** means Delta Lake treats metadata like data, using Spark's distributed processing to handle petabyte-scale tables with billions of files.

#### ACID Transactions

Delta Lake brings four ACID properties to data lakes:

- **Atomicity**: Each commit is all-or-nothing. A failed write never leaves partial data visible.
- **Consistency**: Schema enforcement and constraints ensure data integrity.
- **Isolation**: Readers see a consistent snapshot of the table. Writers use serializable isolation.
- **Durability**: Once a commit is recorded in the transaction log, it survives failures.

The isolation levels are important to understand:

| Isolation Level | Reads | Writes | Notes |
|---|---|---|---|
| Snapshot Isolation | Readers see a consistent snapshot as of query start | Not applicable | Default for reads |
| Serializable Isolation | Not applicable | Multiple concurrent writers can modify the table | Default for writes; strongest isolation level |
| WriteSerializable | Readers may see a state not present in the log | Writers can commit | Weaker than Serializable; used when multi-table writes are involved |

#### Time Travel

**Time travel** allows you to query a Delta table as it existed at a specific version or timestamp. Every committed change creates a new table version in the log. Time travel reconstructs a historical snapshot by reading the files referenced by that version, without needing a full copy of the table.

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("TimeTravelDemo").getOrCreate()

# Read a specific version
df_version_5 = spark.read.format("delta").option("versionAsOf", 5).load("/data/sales")

# Read a specific timestamp
df_yesterday = (
    spark.read.format("delta")
    .option("timestampAsOf", "2025-01-01")
    .load("/data/sales")
)

# Restore the table to a previous version
spark.sql("RESTORE TABLE sales TO VERSION AS OF 5")
```

The SQL equivalent:

```sql
-- Query a specific version
SELECT * FROM sales VERSION AS OF 5;

-- Query a specific timestamp
SELECT * FROM sales TIMESTAMP AS OF '2025-01-01';

-- View table history
DESCRIBE HISTORY sales;

-- Restore to a previous version
RESTORE TABLE sales TO VERSION AS OF 5;
```

Time travel depends on both transaction log retention and physical data file retention. `delta.logRetentionDuration` controls log entry retention (default 30 days). `VACUUM` removes unreferenced files and by default keeps them for 7 days.

#### Schema Enforcement and Evolution

**Schema enforcement** (also called "schema on write") ensures that written data matches the table's defined schema. If a column is defined as INT and incoming data contains a STRING, the write fails. This prevents bad data from silently corrupting the table.

**Schema evolution** allows the schema to change in a controlled way. New columns can be added automatically when `mergeSchema` is enabled.

```python
# Schema enforcement: this will fail if the DataFrame schema doesn't match
df.write.format("delta").mode("append").save("/data/sales")

# Schema evolution: allow new columns to be added
df.write.format("delta") \
    .option("mergeSchema", "true") \
    .mode("append") \
    .save("/data/sales")

# Disable schema enforcement entirely (not recommended)
spark.conf.set("spark.databricks.delta.schema.autoMerge.enabled", "true")
```

| Feature | Behavior | Configuration |
|---|---|---|
| Schema enforcement | Rejects writes with incompatible schema | Enabled by default |
| Schema evolution | Adds missing columns automatically | `.option("mergeSchema", "true")` or `spark.databricks.delta.schema.autoMerge.enabled` |

#### MERGE for Upserts

The **MERGE** operation (upsert) is one of Delta Lake's most powerful features. It allows you to atomically insert, update, and delete rows in a target table based on a source DataFrame or table.

```python
from delta.tables import DeltaTable

deltaTable = DeltaTable.forPath(spark, "/data/target")

(deltaTable.alias("t")
 .merge(
     source_df.alias("s"),
     "s.id = t.id"
 )
 .whenMatchedUpdateAll()
 .whenNotMatchedInsertAll()
 .execute()
)
```

SQL equivalent:

```sql
MERGE INTO target t
USING source s
ON s.id = t.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

MERGE is commonly used in `foreachBatch` for streaming upserts:

```python
def upsert_to_delta(microBatchOutputDF, batchId):
    deltaTable = DeltaTable.forPath(spark, "/data/target")
    (deltaTable.alias("t")
     .merge(
         microBatchOutputDF.alias("s"),
         "s.id = t.id"
     )
     .whenMatchedUpdateAll()
     .whenNotMatchedInsertAll()
     .execute()
    )

query = (
    streaming_df.writeStream
    .foreachBatch(upsert_to_delta)
    .outputMode("update")
    .option("checkpointLocation", "/checkpoints/merge_demo")
    .start()
)
```

#### Performance Optimization

Delta Lake provides several mechanisms to maintain performance as data grows.

**File compaction with OPTIMIZE** merges small files into larger, more efficiently sized files. Small files degrade read performance due to metadata overhead and reduce the effectiveness of data skipping.

```python
# Compact small files
spark.sql("OPTIMIZE sales")

# Compact with Z-Ordering on specific columns
spark.sql("OPTIMIZE sales ZORDER BY (region, date)")
```

**Z-Ordering** co-locates related data in the same file set, improving data skipping. It works by mapping multi-dimensional data to a one-dimensional curve, ensuring that similar values are stored near each other.

**Liquid clustering** is the newer, recommended alternative to partitioning and Z-Ordering for new tables. It provides flexible clustering keys that can be redefined without rewriting existing data. It uses the Hilbert curve for multi-dimensional clustering, which significantly improves data skipping over Z-Ordering.

| Optimization | Mechanism | When to Use |
|---|---|---|
| OPTIMIZE | File compaction (bin-packing) | After streaming ingestion creates small files |
| Z-ORDER BY | Multi-dimensional data clustering | On columns frequently used in filters |
| Liquid Clustering | Flexible, change-friendly clustering | New tables; Databricks recommends over Z-Order |
| Auto Compaction | Automatic small-file compaction | Enabled by default on Databricks |
| Optimize Write | Pre-write bin-packing | Enabled by default on Databricks |

#### Vacuum and Retention

**VACUUM** removes unreferenced files from storage. It is not triggered automatically. The default retention threshold is 7 days, and running VACUUM with a retention less than 168 hours requires disabling a safety check.

```python
# Vacuum files older than 7 days (default)
spark.sql("VACUUM sales")

# Vacuum with a specific retention
spark.sql("VACUUM sales RETAIN 168 HOURS")
```

VACUUM directly impacts time travel: if VACUUM removes files needed by an older version, that version becomes unqueryable.

#### Medallion Architecture (Bronze, Silver, Gold)

The **Medallion Architecture** organizes data into layers of increasing refinement. In its simplest form, it consists of three layers:

| Layer | Purpose | Data Quality | Typical Operations |
|---|---|---|---|
| Bronze (raw) | Raw ingested data | As-is from source | Append-only ingestion, schema inference |
| Silver (refined) | Cleaned, validated data | Deduplicated, filtered, joined | MERGE, schema enforcement, quality checks |
| Gold (business-ready) | Aggregated for analytics | Business-level metrics | Aggregations, joins, denormalization |

- **Bronze layer**: Raw data is ingested from sources such as Kafka, files, or databases. No transformations are applied beyond basic ingestion. This layer preserves the original data for replay and auditing.
- **Silver layer**: Data is cleaned, deduplicated, validated, and enriched. Quality checks are applied. This layer typically uses MERGE for incremental updates and schema enforcement to maintain quality.
- **Gold layer**: Data is aggregated and modeled for specific business use cases. This layer serves BI tools, dashboards, and ML models.

#### Delta Lake vs Parquet

| Aspect | Parquet Files | Delta Lake |
|---|---|---|
| ACID transactions | No | Yes |
| Schema enforcement | No | Yes |
| Time travel | No | Yes |
| Concurrent writers | No | Yes (optimistic concurrency) |
| Small file handling | Manual | OPTIMIZE, auto compaction |
| Streaming support | Limited | Native batch and streaming |
| Metadata handling | File-based | Transaction log |

Delta Lake uses Parquet as its underlying file format but adds a transaction log that provides ACID transactions, time travel, and schema evolution.

#### Converting Parquet to Delta

Existing Parquet tables can be converted in place to Delta format without rewriting the data.

```python
from delta.tables import DeltaTable

DeltaTable.convertToDelta(spark, "parquet.`/path/to/parquet/table`")
```

SQL equivalent:

```sql
CONVERT TO DELTA parquet.`/path/to/parquet/table`;
```

#### Change Data Feed

**Change Data Feed (CDF)** records row-level changes (inserts, updates, deletes) to a Delta table. When enabled, downstream consumers can read only the changes since a given version, without scanning the full table.

```python
# Enable CDF on a table
spark.sql("ALTER TABLE sales SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")

# Read changes since version 5
changes = (
    spark.read.format("delta")
    .option("readChangeFeed", "true")
    .option("startingVersion", 5)
    .load("/data/sales")
)
```

#### Relevant Configuration Parameters

| Parameter | Default | Description |
|---|---|---|
| `spark.databricks.delta.schema.autoMerge.enabled` | `false` | Enables automatic schema evolution on write |
| `delta.logRetentionDuration` | `30 days` | Retention for transaction log entries |
| `delta.deletedFileRetentionDuration` | `7 days` | Default retention for VACUUM |
| `spark.databricks.delta.autoCompact.enabled` | `true` (Databricks) | Enables automatic file compaction |
| `spark.databricks.delta.optimizeWrite.enabled` | `true` (Databricks) | Enables pre-write bin-packing |
| `spark.databricks.delta.optimizeWrite.binSize` | `1024` (MB) | Target file size for optimize write |
| `spark.databricks.delta.stats.collect` | `true` | Enables statistics collection for data skipping |
| `spark.databricks.delta.stats.skipping` | `true` | Enables data skipping using statistics |
| `spark.databricks.delta.checkpoint.interval` | `10` | Number of commits before writing a checkpoint |
| `delta.enableChangeDataFeed` | `false` | Enables Change Data Feed |
| `delta.enableDeletionVectors` | `false` | Enables deletion vectors for faster deletes |

#### Best Practices

- Use Delta Lake as the default table format for all Lakehouse tables.
- Always enable schema enforcement to prevent bad data from entering the table.
- Use MERGE for incremental upserts instead of overwriting entire tables.
- Run OPTIMIZE regularly on tables that receive frequent small writes, such as streaming ingestion.
- Use liquid clustering for new tables instead of partitioning and Z-Ordering.
- Set `delta.logRetentionDuration` and VACUUM retention according to your time travel and compliance requirements.
- Enable Change Data Feed for tables that feed downstream incremental consumers.
- Partition on low-cardinality columns used in filters; avoid over-partitioning.
- Monitor table size, file count, and query performance in the Delta Lake tab of the Spark UI.
- Use `DESCRIBE HISTORY` and `DESCRIBE DETAIL` to inspect table state and history.

#### Common Pitfalls and Limitations

- Running VACUUM with a short retention removes files needed for time travel, breaking historical queries.
- Over-partitioning creates the small-file problem, which degrades read performance.
- Z-Ordering is not idempotent; repeated runs may not reduce time and can be expensive.
- Schema evolution can silently add columns. Enable it deliberately and monitor schema changes.
- MERGE can read the source multiple times, causing metrics to be multiplied in streaming queries.
- Delta Lake's ACID guarantees are per-table only. Cross-table transactions are not supported.
- Checkpoint files in `_delta_log` can become stale or corrupted; avoid manual modification.
- Time travel is read-only and does not roll back the table. Use RESTORE to make an older version current.
- Converting Parquet to Delta requires that the Parquet directory follows a compatible layout.
- Deletion vectors improve delete performance but can interact with readers that do not support them.

#### Summary

Delta Lake is the storage layer that brings ACID transactions, schema enforcement, time travel, and scalable metadata handling to data lakes. The transaction log is the foundation, recording every change and enabling snapshot isolation for reads and serializable isolation for writes. Time travel reconstructs historical snapshots by reading files referenced by previous versions. MERGE provides atomic upserts. OPTIMIZE, Z-Ordering, and liquid clustering maintain query performance as data grows. The Medallion Architecture organizes data into Bronze, Silver, and Gold layers of increasing refinement. In interviews, the strongest answers connect these features to concrete production concerns: small-file management, concurrent writers, late-arriving data, and downstream incremental consumption.

Notebook link: {{NOTEBOOK_URL}}
