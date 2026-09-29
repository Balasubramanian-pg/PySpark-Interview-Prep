# 4.3 Structured Streaming

**Structured Streaming** is Spark's scalable, fault-tolerant stream processing engine built on the Spark SQL engine. It models a stream as an **unbounded table** that receives new rows over time, and a streaming query as an incremental query over that table. This matters because it unifies batch and streaming APIs, supports event-time processing with **watermarks**, provides end-to-end exactly-once guarantees with checkpointing and replayable sources, and allows many Spark SQL operations to run in a streaming context. Interview questions usually focus on execution model, output modes, state management, watermarks, joins, fault tolerance, and performance tuning.

#### Execution Model

Structured Streaming executes a query incrementally as new data arrives. The driver plans the query, and each **micro-batch** reads new input, updates state if needed, and writes output. The logical plan is optimized by Catalyst, and the physical execution uses the same Tungsten engine as batch Spark SQL.

- **Input sources** include Kafka, file sources, rate, socket, and table sources. Production sources must be replayable for fault tolerance.
- **Stateful operations** include streaming aggregations, `dropDuplicates`, stream-stream joins, and arbitrary stateful operations such as `mapGroupsWithState`.
- **Sinks** include files, Kafka, `foreachBatch`, `foreach`, console, memory, and table sinks. Production sinks should be idempotent or transactional for exactly-once semantics.
- **Checkpointing** records query progress, offsets, and state so a failed query can resume from where it stopped.
- **Triggers** control when micro-batches run. Common options are default, `processingTime`, `once`, `availableNow`, and `continuous`.

| Trigger | Behavior | Typical Use |
|---|---|---|
| Default | Runs micro-batches as fast as possible | Lowest latency micro-batch |
| `processingTime` | Runs at a fixed interval | Predictable latency and load |
| `once` | Processes all available data once and stops | Deprecated in favor of `availableNow` |
| `availableNow` | Processes all available data in multiple batches and stops | Backfills and incremental batch-style jobs |
| `continuous` | Runs a long-lived continuous query with low latency | Simple stateless operations only |

Output modes determine what is written to the sink after each micro-batch.

| Output Mode | Writes | Supported Operations | Notes |
|---|---|---|---|
| Append | Only new rows | Stateless, aggregations with watermark, stream-stream joins with watermark | Default mode |
| Update | New and updated rows | Aggregations, `dropDuplicates` | Not supported by file sink |
| Complete | Entire result table | Aggregations | Not supported with watermark; state grows without bound |

#### Event-Time and Watermarks

Event-time processing uses the timestamp inside the data, not the arrival time. A **watermark** is a threshold that tells Spark how long to wait for late data. It is defined with `withWatermark(eventTimeColumn, delay)`. Spark tracks the maximum observed event time and drops state and late records older than `maxEventTime - delay`.

Watermarks are required for append mode streaming aggregations and for stream-stream joins. They bound state size and allow Spark to finalize results. A larger watermark delay tolerates more late data but increases state size and result latency. A smaller delay reduces state but drops late events earlier.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, window

spark = (
    SparkSession.builder
    .appName("StructuredStreamingWatermarkDemo")
    .master("local[*]")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")

stream_df = (
    spark.readStream
    .format("rate")
    .option("rowsPerSecond", 5)
    .option("numPartitions", 1)
    .load()
)

windowed_counts = (
    stream_df
    .withWatermark("timestamp", "10 seconds")
    .groupBy(window(col("timestamp"), "5 seconds"))
    .count()
)

query = (
    windowed_counts.writeStream
    .outputMode("update")
    .format("memory")
    .queryName("window_counts")
    .option("checkpointLocation", "/tmp/checkpoints/structured_streaming_demo")
    .trigger(processingTime="2 seconds")
    .start()
)

import time
time.sleep(10)
query.stop()

spark.sql("SELECT * FROM window_counts ORDER BY window.start").show(truncate=False)
spark.stop()
```

The SQL analogue uses a temporary view created from the watermarked streaming DataFrame:

```python
stream_df.withWatermark("timestamp", "10 seconds").createOrReplaceTempView("events")
```

```sql
SELECT window(timestamp, '5 seconds') AS w, count(*) AS cnt
FROM events
GROUP BY window(timestamp, '5 seconds');
```

#### Stateful Operations

Stateful operations keep intermediate state across micro-batches. The state store is backed by HDFS-compatible storage by default, and RocksDB can be enabled for larger state. State size is the primary scalability concern for streaming aggregations, deduplication, and joins.

- **Streaming aggregation**: `groupBy(...).agg(...)` keeps per-key state. Watermark enables state cleanup and append mode.
- **Deduplication**: `dropDuplicates` keeps seen keys. Without a watermark, state grows forever. With a watermark, older keys are removed.
- **Stream-stream join**: Both sides need watermarks and time bounds. State is retained for the join window.
- **Arbitrary stateful processing**: `mapGroupsWithState`, `flatMapGroupsWithState`, and `applyInPandasWithState` allow custom state logic with timeouts.

| Stateful Operation | Watermark Required | Output Modes | Main Risk |
|---|---|---|---|
| Aggregation | For append mode and state cleanup | Append, update, complete | Unbounded state without watermark |
| `dropDuplicates` | Recommended for cleanup | Append, update | Unbounded key state |
| Stream-stream join | Yes | Append, update | Large join state and late data |
| Arbitrary state | User-managed | Append, update | State size and timeout bugs |

A deduplication example with watermark:

```python
deduped = (
    stream_df
    .withWatermark("timestamp", "1 minute")
    .dropDuplicates(["value"])
)
```

#### Stream-Static and Stream-Stream Joins

A **stream-static join** joins a streaming DataFrame with a batch DataFrame. It is stateless on the streaming side and does not require a watermark. The static side is refreshed when the query starts unless it is periodically refreshed by restarting or by using a different pattern.

A **stream-stream join** joins two streaming DataFrames. It requires watermarks on both sides and time-range conditions so Spark can bound state.

```python
impressions = (
    spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "localhost:9092")
    .option("subscribe", "impressions")
    .load()
    .selectExpr("CAST(value AS STRING) AS json")
)

clicks = (
    spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "localhost:9092")
    .option("subscribe", "clicks")
    .load()
    .selectExpr("CAST(value AS STRING) AS json")
)

joined = (
    impressions
    .withWatermark("impressionTime", "10 minutes")
    .join(
        clicks.withWatermark("clickTime", "10 minutes"),
        impressions.adId == clicks.adId,
        "inner"
    )
    .where("clickTime BETWEEN impressionTime AND impressionTime + INTERVAL 1 HOUR")
)
```

SQL equivalent for the join shape:

```sql
SELECT i.adId, i.impressionTime, c.clickTime
FROM impressions i
JOIN clicks c
  ON i.adId = c.adId
 AND c.clickTime BETWEEN i.impressionTime AND i.impressionTime + INTERVAL 1 HOUR;
```

#### Fault Tolerance and Exactly-Once

Structured Streaming achieves fault tolerance through checkpointing, write-ahead logs, and replayable sources. A **checkpoint** stores offsets, commit logs, and state metadata. On failure, Spark reads the checkpoint, re-reads uncommitted data from the source, and recomputes the micro-batch.

End-to-end exactly-once requires three conditions:

- The source must be replayable, such as Kafka or a file source.
- The sink must be idempotent or transactional, such as file sink or an idempotent `foreachBatch` upsert.
- The checkpoint location must be durable and unique per query.

Kafka sink can provide at-least-once by default. Exactly-once with Kafka requires idempotent production and careful offset management. File sink provides exactly-once for file-based outputs. `foreach` and `foreachBatch` place the responsibility on the user.

| Sink | Default Guarantee | Exactly-Once Support |
|---|---|---|
| File | Exactly-once | Yes |
| Kafka | At-least-once | With idempotent producer and correct semantics |
| `foreachBatch` | At-least-once | User must make batch writes idempotent |
| `foreach` | At-least-once | User must implement idempotence |
| Console | At-least-once | Not for production |
| Memory | At-least-once | Not for production |

#### Performance and Configuration

Streaming performance is dominated by micro-batch size, shuffle partitions, state store size, source rate, and sink latency. Tune the input rate with `maxFilesPerTrigger` or `maxOffsetsPerTrigger`. Tune shuffle with `spark.sql.shuffle.partitions`. Monitor the **Structured Streaming** tab in the Spark UI for input rate, processing rate, batch duration, and state size.

| Parameter | Default | Description |
|---|---|---|
| `spark.sql.shuffle.partitions` | `200` | Partitions used for shuffles in each micro-batch |
| `spark.sql.streaming.checkpointLocation` | none | Default checkpoint directory for queries |
| `spark.sql.streaming.stateStore.providerClass` | `HDFSBackedStateStoreProvider` | State store implementation; RocksDB is an alternative |
| `spark.sql.streaming.stateStore.maintenanceInterval` | `60s` | Interval for state store maintenance |
| `spark.sql.streaming.stateStore.minDeltasForSnapshot` | `10` | Deltas before writing a state snapshot |
| `spark.sql.streaming.noDataMicroBatches.enabled` | `true` | Skips empty micro-batches |
| `spark.sql.streaming.stopTimeout` | `0` | Timeout for stopping a streaming query |
| `spark.sql.streaming.schemaInference` | `false` | Enables schema inference for file sources |
| `spark.sql.streaming.multipleWatermarkPolicy` | `min` | Global watermark policy when multiple watermarks exist |
| `spark.sql.streaming.stateStore.rocksdb.changelogCheckpointing.enabled` | `false` | Enables changelog checkpointing for RocksDB state store |

Trade-offs are unavoidable in streaming design.

| Choice | Benefit | Cost |
|---|---|---|
| Micro-batch | High throughput and full SQL support | Higher latency than continuous mode |
| Continuous mode | Low latency | Limited operations; no aggregations or joins |
| Append mode | Clean incremental output | Requires watermark for stateful operations |
| Update mode | Emits changed rows quickly | Not supported by file sink |
| Complete mode | Full result table | Unbounded state; no watermark |
| HDFS-backed state store | Simple and durable | Slower for large state |
| RocksDB state store | Handles larger state and faster updates | More configuration and native dependency |
| Large watermark delay | Tolerates late data | Larger state and delayed results |
| Small watermark delay | Smaller state and faster finalization | Drops late data earlier |

#### Best Practices

- Use event-time processing and watermarks for any stateful streaming query.
- Store checkpoints on durable storage such as HDFS, S3, or ADLS, not local disk.
- Use `availableNow` for backfills and incremental batch-style processing.
- Use `foreachBatch` for idempotent upserts to databases or data lakes.
- Enable RocksDB state store when state grows beyond executor memory or HDFS-backed performance is insufficient.
- Set `spark.sql.shuffle.partitions` according to micro-batch size rather than leaving the batch default of `200`.
- Limit input per trigger with `maxFilesPerTrigger` or `maxOffsetsPerTrigger` to keep batch durations stable.
- Monitor `query.lastProgress` and `query.status` programmatically and in the Spark UI.
- Set a `stopTimeout` in production to avoid hanging shutdowns.
- Test failure recovery by killing a query and verifying that it resumes without duplicates or data loss.

#### Common Pitfalls and Limitations

- Forgetting `checkpointLocation` causes the query to fail or prevents recovery.
- Using complete mode with a watermark is not supported and can lead to unbounded state.
- Using append mode with an aggregation without a watermark can wait indefinitely for final results.
- `dropDuplicates` and stream-stream joins without watermarks grow state without bound.
- Multiple streaming aggregations in one query have limitations and may require separate queries.
- Continuous mode does not support aggregations, joins, or stateful operations.
- Late data older than the watermark is dropped; design the delay based on business tolerance.
- File sources require schema stability and are not ideal for high-frequency small files.
- Exactly-once is not automatic for `foreach` or `foreachBatch`; the sink must be idempotent.
- Long-running queries can accumulate state and checkpoint size; monitor and compact or redesign state.

#### Summary

Structured Streaming treats a stream as an unbounded table and executes incremental queries over it. Watermarks enable event-time processing and bounded state. Output modes control what is emitted, and stateful operations require careful state management. Fault tolerance depends on checkpoints, replayable sources, and idempotent sinks. Performance tuning focuses on micro-batch size, shuffle partitions, state store choice, and input rate control. In interviews, the strongest answers connect these concepts to concrete failure modes such as unbounded state, late data loss, and duplicate writes.

Notebook link: {{NOTEBOOK_URL}}
