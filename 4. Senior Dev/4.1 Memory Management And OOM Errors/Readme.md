# 4.1 Memory Management And OOM Errors

Memory management is the single most common source of production failures in PySpark. An `OutOfMemoryError` (OOM) can terminate an executor task, crash the entire driver, or silently degrade performance through excessive garbage collection and disk spilling. Understanding how Spark allocates and reclaims memory — and knowing exactly where to look when an OOM occurs — is a defining skill for senior PySpark engineers. This topic covers Spark's memory architecture, the root causes of driver and executor OOMs, configuration tuning, and code-level strategies to prevent them.

### Spark Memory Architecture

Each Spark executor is a JVM process. Its memory is divided into several regions, and understanding this layout is essential for diagnosing OOMs.

```
Total Executor Memory
├── spark.executor.memory (JVM Heap)
│   ├── Reserved Memory (300 MB, fixed)
│   ├── User Memory (40% of usable heap by default)
│   │   └── User-defined data structures, UDF overhead, RDD metadata
│   └── Spark Memory (60% of usable heap by default, controlled by spark.memory.fraction)
│       ├── Execution Memory (shuffles, joins, sorts, aggregations)
│       └── Storage Memory (cached DataFrames, broadcast variables)
└── spark.executor.memoryOverhead (Off-heap, native memory)
    └── JVM overhead, interned strings, off-heap allocations, Python worker memory
```

The **Unified Memory Manager** (introduced in Spark 1.6) allows Execution Memory and Storage Memory to share a single region with a soft boundary. When execution needs memory, it can evict cached storage blocks down to the protected storage region. Conversely, when storage needs memory and execution is idle, it can borrow from the execution region.

The default split is controlled by two parameters:
- `spark.memory.fraction` (default 0.6): The fraction of the JVM heap dedicated to Spark Memory (execution + storage).
- `spark.memory.storageFraction` (default 0.5): The fraction of Spark Memory that is protected from eviction by execution. The remaining portion is available for execution to borrow.

Off-heap memory is controlled by `spark.executor.memoryOverhead`, which defaults to 10% of `spark.executor.memory` (minimum 384 MB). This region holds JVM overhead, interned strings, and native memory allocations. In PySpark, Python worker processes also consume off-heap memory, making this region particularly important to size correctly.

### Driver vs Executor OOM

OOMs occur on two distinct components with different causes and solutions.

| Aspect | Driver OOM | Executor OOM |
|--------|------------|--------------|
| **Impact** | Entire application crashes; all progress lost. | Individual task fails; Spark may retry the task. |
| **Common causes** | `collect()`, `toPandas()`, large broadcast variables, long lineage graphs, accumulating results in streaming. | Data skew, large partitions, excessive caching, UDF memory overhead, insufficient heap. |
| **Memory regions** | Driver heap + `spark.driver.memoryOverhead`. | Executor heap + `spark.executor.memoryOverhead`. |
| **First tuning step** | Increase `spark.driver.memory` and `spark.driver.memoryOverhead`. | Increase `spark.executor.memory`, reduce `spark.executor.cores`. |

#### Driver OOM

The driver coordinates the entire Spark application. It maintains the `SparkContext`, schedules jobs, collects results, and manages broadcast variables. Operations that pull data from executors to the driver are the primary cause of driver OOM.

**Common driver OOM triggers:**

- `df.collect()` on a large DataFrame: transfers all rows to driver memory.
- `df.toPandas()`: converts the entire DataFrame to a pandas DataFrame on the driver.
- Broadcasting a large DataFrame: the driver must collect and serialize the broadcast data before distributing it to executors.
- Long transformation chains: building a DataFrame through hundreds of transformations in a loop (e.g., repeated joins) creates a deep logical plan that consumes driver memory during query planning.
- `take(n)` with a large `n`.
- Accumulating results over time in streaming applications.

**Driver OOM mitigation:**

```python
# Instead of collecting to the driver, write to distributed storage
# BAD: df.collect()
# GOOD:
df.write.mode("overwrite").parquet("s3://bucket/output")

# Instead of toPandas() on a large DataFrame, sample or aggregate first
# BAD: df.toPandas()
# GOOD:
df.limit(10000).toPandas()

# For broadcast joins, keep the broadcast side small
from pyspark.sql.functions import broadcast
# Only broadcast tables under 200 MB
result = large_df.join(broadcast(small_df), on="id")
```

```python
# Configure driver memory and overhead
spark = SparkSession.builder \
    .config("spark.driver.memory", "8g") \
    .config("spark.driver.memoryOverhead", "2g") \
    .getOrCreate()
```

#### Executor OOM

Executor OOMs are more common and often stem from data distribution issues rather than raw memory insufficiency.

**Common executor OOM triggers:**

- **Data skew:** A single join or group key has a disproportionate number of rows, causing one task to process far more data than others. The executor running that task runs out of memory.
- **Large partitions:** Partitions that are too large for the available execution memory. This happens when `spark.sql.shuffle.partitions` is too low relative to the data volume.
- **Excessive caching:** Caching large DataFrames that do not fit in storage memory, forcing eviction and spilling that can still cause OOM if execution memory is also exhausted.
- **UDF overhead:** Python UDFs or Pandas UDFs that create large intermediate objects in Python worker memory, which counts against off-heap overhead.
- **Broadcast hash join with an oversized broadcast table:** Although the broadcast data is stored on the executor, the process of building the hash table can exceed executor memory.
- **Insufficient heap:** Simply too little `spark.executor.memory` for the workload.

**Executor OOM mitigation:**

```python
# Increase executor memory and reduce parallelism per executor
spark = SparkSession.builder \
    .config("spark.executor.memory", "16g") \
    .config("spark.executor.cores", "4") \
    .config("spark.executor.memoryOverhead", "4g") \
    .getOrCreate()
```

```python
# Increase shuffle partitions to reduce partition size
spark.conf.set("spark.sql.shuffle.partitions", "1000")

# Enable AQE for dynamic skew handling and partition coalescing
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
```

### Configuration Parameters for Memory Tuning

The following table summarizes the most important memory-related configuration parameters.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.executor.memory` | 1g | JVM heap size per executor. |
| `spark.executor.memoryOverhead` | max(384 MB, 10% of executor memory) | Off-heap memory per executor. |
| `spark.driver.memory` | 1g | JVM heap size for the driver. |
| `spark.driver.memoryOverhead` | max(384 MB, 10% of driver memory) | Off-heap memory for the driver. |
| `spark.executor.cores` | 1 (YARN: 1; standalone: all available) | Cores per executor. Fewer cores means more memory per task. |
| `spark.memory.fraction` | 0.6 | Fraction of heap for execution + storage. |
| `spark.memory.storageFraction` | 0.5 | Protected fraction of Spark Memory for storage. |
| `spark.sql.shuffle.partitions` | 200 | Partitions after shuffle. Higher values reduce per-partition size. |
| `spark.sql.adaptive.enabled` | true (Spark 3.2+) | Enables adaptive query execution. |
| `spark.sql.adaptive.skewJoin.enabled` | true | Enables skew join handling in AQE. |
| `spark.sql.adaptive.coalescePartitions.enabled` | true | Merges small shuffle partitions. |
| `spark.sql.autoBroadcastJoinThreshold` | 10 MB | Max size for automatic broadcast joins. |
| `spark.sql.inMemoryColumnarStorage.batchSize` | 10000 | Batch size for columnar caching. Larger batches risk OOM. |
| `spark.memory.offHeap.enabled` | false | Enables off-heap memory for execution and storage. |
| `spark.memory.offHeap.size` | 0 | Size of off-heap memory. Must be set if off-heap is enabled. |

### Tuning Strategies

#### Sizing Executors Correctly

The optimal executor configuration depends on the node's resources. A common heuristic is to leave one core per node for OS and YARN overhead, then choose between fat executors (one per node, many cores) and moderate executors (2–3 per node, 3–5 cores each).

For a node with 8 vCPUs and 32 GB RAM:

| Configuration | Executors per Node | Cores per Executor | Memory per Executor | Overhead |
|---------------|-------------------|-------------------|---------------------|----------|
| Fat | 1 | 7 | 27g | 4g |
| Moderate | 2 | 3 | 13g | 2g |
| Thin | 7 | 1 | 3g | 1g |

Moderate executors are generally recommended. Fat executors can cause long GC pauses because a single JVM manages too much heap. Thin executors waste memory on per-executor overhead and miss within-executor parallelism.

#### Handling Data Skew

Data skew is the leading cause of executor OOMs. A single key with millions of rows causes one task to process orders of magnitude more data than its peers.

**Detection:** Check the Spark UI Stages tab for tasks with unusually high `PeakExecutionMemory` or duration. If only a few tasks fail with OOM while others complete quickly, skew is the likely cause.

**Solutions:**

1. **Enable AQE skew join handling:** Spark 3.x can automatically split skewed partitions during sort-merge joins.
   ```python
   spark.conf.set("spark.sql.adaptive.enabled", "true")
   spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
   spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
   spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256m")
   ```

2. **Salting:** Artificially split hot keys into multiple sub-keys. Append a random suffix to the skewed key on the large side, replicate the small side across all suffixes, join, then strip the salt.
   ```python
   from pyspark.sql.functions import rand, floor, lit, concat, col

   # Add salt to the large DataFrame
   salt_factor = 20  # Based on skew factor
   large_salted = large_df.withColumn("salt", floor(rand() * salt_factor).cast("int"))
   large_salted = large_salted.withColumn("salted_key", concat(col("key"), lit("_"), col("salt")))

   # Replicate the small DataFrame across all salt values
   salts = [lit(i) for i in range(salt_factor)]
   small_exploded = small_df.withColumn("salt", explode(array(salts)))
   small_exploded = small_exploded.withColumn("salted_key", concat(col("key"), lit("_"), col("salt")))

   # Join on salted key, then drop salt columns
   result = large_salted.join(small_exploded, on="salted_key").drop("salt", "salted_key")
   ```
   Salting is a heavier technique and should be used when AQE cannot resolve the skew or when AQE is unavailable.

3. **Increase shuffle partitions:** More partitions means smaller per-partition data, which reduces the memory pressure on the skewed task.
   ```python
   spark.conf.set("spark.sql.shuffle.partitions", "2000")
   ```

#### Garbage Collection Tuning

Frequent full GC or "GC overhead limit exceeded" errors indicate that the JVM is spending too much time reclaiming memory. Spark executors should use the G1GC collector, which is designed for large heaps and low-latency pauses.

```python
# Enable G1GC with tuning options
spark = SparkSession.builder \
    .config("spark.executor.extraJavaOptions",
            "-XX:+UseG1GC -XX:InitiatingHeapOccupancyPercent=35 -XX:ConcGCThreads=4") \
    .config("spark.driver.extraJavaOptions",
            "-XX:+UseG1GC -XX:InitiatingHeapOccupancyPercent=35") \
    .getOrCreate()
```

Key G1GC parameters:
- `-XX:+UseG1GC`: Enables the G1 garbage collector.
- `-XX:InitiatingHeapOccupancyPercent`: The heap occupancy threshold that triggers concurrent marking. Lower values trigger earlier collection, reducing the risk of full GC.
- `-XX:ConcGCThreads`: Number of concurrent GC threads. Set to roughly one quarter of the available cores.

If GC is a persistent problem, reducing the executor heap size and increasing the number of executors can help, because smaller heaps are easier to collect.

#### Caching and Persistence

Caching is a double-edged sword. It can dramatically speed up iterative algorithms, but caching DataFrames that do not fit in memory causes eviction and spilling that can lead to OOM.

```python
# Cache only DataFrames that are reused multiple times
df.cache()

# Use MEMORY_AND_DISK to spill to disk instead of failing
from pyspark import StorageLevel
df.persist(StorageLevel.MEMORY_AND_DISK)

# Unpersist when no longer needed
df.unpersist()
```

The columnar cache (enabled by default) stores cached DataFrames in a compressed columnar format, which reduces memory usage and GC pressure. Adjust `spark.sql.inMemoryColumnarStorage.batchSize` if caching large DataFrames causes OOM.

### Code-Level Best Practices

Many OOMs are caused by suboptimal code patterns rather than insufficient resources.

| Anti-Pattern | Better Alternative |
|--------------|-------------------|
| `df.collect()` on large data | Write to storage or aggregate first |
| `df.toPandas()` on large data | `df.limit(N).toPandas()` or write to table |
| `df.repartition(1)` on large data | `df.coalesce(N)` with reasonable N |
| `df.cache()` on everything | Cache only DataFrames reused more than once |
| Python UDFs for row-wise logic | Built-in Spark SQL functions |
| `for row in df.collect()` | Spark transformations (`map`, `filter`) |
| Chaining many `union` calls | `functools.reduce` or a single SQL statement |
| Joining in a loop | Single join with a unioned dimension table |

For loops that build DataFrames through repeated joins, the deep logical plan can exhaust driver memory during query planning. Rewrite such patterns to use a single join or reduce the number of transformations.

### Monitoring and Diagnosis

**Spark UI:** The Stages tab shows `PeakExecutionMemory` per task. Tasks with unusually high values indicate skew or oversized partitions. The Executors tab shows memory usage, GC time, and shuffle spill metrics.

**Logs:** Look for `java.lang.OutOfMemoryError: Java heap space` (on-heap OOM) or `Cannot allocate memory` (off-heap OOM). Exit code 137 indicates the container was killed by the OS or YARN memory monitor, which is a form of OOM.

**Diagnostic checklist:**
1. Is the OOM on the driver or an executor?
2. Is it on-heap or off-heap?
3. Is it isolated to a few tasks (skew) or widespread (insufficient memory)?
4. What is the `PeakExecutionMemory` of the failing tasks?
5. Is the job doing a `collect()`, `toPandas()`, or large broadcast?

### Common Pitfalls and Limitations

- **Increasing memory without fixing skew.** Adding more memory to an executor does not help if a single task is processing 100x more data than its peers. Fix the skew first.
- **Setting `spark.executor.cores` too high.** Each core runs a task, and all tasks share the executor's memory. With 14 cores per executor, each task gets 1/14th of the memory. The recommended range is 3–5 cores per executor.
- **Forgetting `memoryOverhead`.** Off-heap OOMs (`Cannot allocate memory`) are not solved by increasing `spark.executor.memory`. Increase `spark.executor.memoryOverhead` or `spark.driver.memoryOverhead`.
- **Broadcasting large tables.** The driver collects the broadcast data into memory before distributing it. Broadcasting a 5 GB table can OOM the driver even if executors have sufficient memory. Keep broadcasts under 200 MB.
- **Ignoring GC time.** High GC time (visible in the Spark UI Executors tab) is a precursor to OOM. Tune G1GC or reduce heap size before the OOM occurs.
- **Using `spark.memory.offHeap.enabled` without sizing.** If off-heap is enabled but `spark.memory.offHeap.size` is too small, execution spills frequently. If it is too large, the container may exceed its memory limit and be killed.
- **Not unpersisting cached DataFrames.** Cached data occupies storage memory for the lifetime of the application unless explicitly unpersisted. This is a common cause of memory pressure in long-running jobs.
- **Deep transformation loops.** Building a DataFrame through hundreds of `withColumn` or `join` operations in a loop creates a massive logical plan that the driver must hold in memory. Rewrite loops as single transformations where possible.

### Summary

Memory management in PySpark requires understanding the executor heap layout, the unified memory manager, and the distinction between driver and executor OOMs. Driver OOMs are typically caused by collecting large datasets or broadcasting oversized tables; executor OOMs are most often caused by data skew, oversized partitions, or insufficient heap. Effective tuning involves sizing executors appropriately (3–5 cores, moderate memory), enabling AQE for skew handling and partition coalescing, using G1GC for large heaps, and eliminating code anti-patterns such as `collect()` and unnecessary caching. Monitoring through the Spark UI and understanding the difference between on-heap and off-heap OOMs are essential diagnostic skills. By applying these strategies systematically, senior engineers can prevent the majority of memory-related failures in production Spark 3.x workloads.

Notebook link: {{NOTEBOOK_URL}}
