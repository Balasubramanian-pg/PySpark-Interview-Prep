# 3.1 Partitioning And Bucketing

Partitioning and bucketing are physical data organization techniques in Spark. Partitioning splits data into directories based on column values, enabling partition pruning for filters. Bucketing distributes data into a fixed number of files based on a hash of one or more columns, enabling shuffle-free joins and aggregations. Both are used to reduce I/O and shuffle cost, but they serve different purposes and have different trade-offs.

---

### 3.1.1 What is the difference between `repartition()` and `coalesce()`?

**Answer:**

`repartition()` and `coalesce()` both change the number of partitions in an RDD or DataFrame, but they differ in shuffle behavior, direction, data distribution, and cost.

`repartition()`:
- Always performs a full shuffle of data across the cluster.
- Can increase or decrease the number of partitions.
- Distributes data evenly across partitions. For RDDs and DataFrame repartition without columns, Spark uses round-robin partitioning. For DataFrame repartition with columns, Spark uses hash partitioning by those columns.
- For DataFrames, can partition by column(s): `df.repartition(10, "col")`.
- Expensive due to network I/O and serialization.
- Used to increase parallelism, fix skew, or prepare data for joins and aggregations by key.

`coalesce()`:
- By default does not shuffle (`shuffle=False`).
- Can only decrease the number of partitions without shuffle. It merges existing partitions into fewer partitions.
- If you request more partitions with `shuffle=False`, it typically has no effect.
- If you set `shuffle=True`, it can increase partitions and behaves like repartition, but for DataFrames it cannot specify columns.
- Cheaper than repartition when reducing partitions because it avoids network shuffle.
- May produce uneven partition sizes because it just combines adjacent partitions, which can lead to skew.
- Used to reduce partitions after filtering, before writing a single file, or to lower overhead.

Code snippets in PySpark for RDDs:

```
rdd = sc.parallelize(range(100), 10)
rdd_rep = rdd.repartition(5)      # full shuffle, 5 partitions
rdd_coal = rdd.coalesce(2)        # no shuffle, 2 partitions
rdd_coal_shuffle = rdd.coalesce(20, shuffle=True)  # shuffle, can increase
```

Code snippets in PySpark for DataFrames:

```
df = spark.range(100).repartition(10)
df_rep = df.repartition(5)               # full shuffle, 5 partitions
df_rep_col = df.repartition("id")        # hash partition by id
df_rep_cols = df.repartition(4, "id")    # 4 partitions by hash of id
df_coal = df.coalesce(2)                 # no shuffle, 2 partitions
```

Explanation: `repartition` is a heavy operation that guarantees a new partition layout. `coalesce` is a lightweight operation that tries to avoid shuffle but may leave data uneven. Use `coalesce` when reducing partitions and shuffle is not needed. Use `repartition` when you need to increase partitions, balance data, or partition by specific columns.

---

### 3.1.2 When would you use `repartition()` over `coalesce()`, and vice versa?

**Answer:**

Use `repartition()` when you need a shuffle to change the partition layout. Use `coalesce()` when you only need to reduce the number of partitions and can avoid a shuffle.

When to use `repartition()` over `coalesce()`:

- You need to increase the number of partitions. `coalesce()` without shuffle cannot increase partitions.
- You need even data distribution across partitions. `repartition()` shuffles data and spreads it more evenly.
- You need to partition by specific columns before a join, aggregation, or write. For DataFrames, `repartition()` accepts column names, `coalesce()` does not.
- You need to fix skew or poor parallelism. `repartition()` can rebalance data, while `coalesce()` may preserve skew.
- You are already going to trigger a shuffle downstream, so the extra shuffle cost may be acceptable.
- You want to control the output file layout by key or column.

Example: increase partitions and partition by key for a join.

```
df = df.repartition(200)
left = left.repartition("customer_id")
right = right.repartition("customer_id")
joined = left.join(right, "customer_id")
```

Example: rebalance a skewed DataFrame.

```
df = df.repartition(200)
```

When to use `coalesce()` over `repartition()`:

- You only need to reduce the number of partitions.
- You want to avoid the cost of a full shuffle.
- You are reducing partitions after a filter that already reduced the data size.
- You want to merge many small partitions into fewer partitions to reduce task overhead.
- You are writing a small result to a single file or a few files.
- You can tolerate uneven partition sizes and do not need key-based partitioning.

Example: reduce partitions after filtering.

```
filtered = df.filter(df.date >= "2024-01-01")
filtered = filtered.coalesce(10)
```

Example: write a small DataFrame as one file.

```
small_df.coalesce(1).write.mode("overwrite").parquet("/path/output")
```

Important caveats:

- `coalesce(1)` on a large dataset can overload one executor and cause out-of-memory errors. Use it only for small results.
- `coalesce()` without shuffle may produce skewed partitions because it only combines existing adjacent partitions.
- `coalesce(n, shuffle=True)` can increase partitions, but then it behaves like a shuffle-based repartition. In most cases, use `repartition()` for clarity.
- `repartition()` is expensive because it always shuffles data across the network.
- For RDDs, the same rules apply. For DataFrames, `repartition()` is usually preferred when you need column-based partitioning.

Decision rule:

- Need more partitions, even distribution, or partitioning by column: use `repartition()`.
- Need fewer partitions and want to avoid a shuffle: use `coalesce()`.
- Need fewer partitions but also need even distribution: use `repartition(n)`, accepting the shuffle cost.
- Need to increase partitions and are willing to shuffle: use `repartition(n)` or `coalesce(n, shuffle=True)`, but `repartition(n)` is clearer.

---

### 3.1.3 What is bucketing in Spark and how does it improve join performance?

**Answer:**

Bucketing is a data organization technique in Spark that groups data into a fixed number of buckets based on the hash of one or more bucketing columns. It is typically used with file-based tables such as Parquet or ORC, and the bucketing metadata is stored in the metastore. Unlike partitioning, which creates a directory per partition value, bucketing creates a fixed number of files per partition or per table using `hash(column) modulo numBuckets`. Rows with the same value in the bucketing column always land in the same bucket.

Bucketing is different from partitioning in these ways:

- Partitioning divides data by column values into directories. It is good for low-cardinality columns such as date or region. It enables partition pruning for filters.
- Bucketing divides data by hash into a fixed number of files. It is good for high-cardinality columns such as `customer_id`. It enables shuffle-free joins and aggregations.
- Partitioning can create many small directories if cardinality is high. Bucketing avoids that by using a fixed number of buckets.

Creating bucketed tables with SQL:

```
CREATE TABLE orders (
  order_id INT,
  customer_id INT,
  amount DOUBLE
)
USING PARQUET
CLUSTERED BY (customer_id) INTO 100 BUCKETS;

CREATE TABLE customers (
  customer_id INT,
  name STRING
)
USING PARQUET
CLUSTERED BY (customer_id) INTO 100 BUCKETS;
```

Creating bucketed tables with the DataFrame API:

```
orders.write
  .bucketBy(100, "customer_id")
  .sortBy("customer_id")
  .saveAsTable("orders_bucketed")

customers.write
  .bucketBy(100, "customer_id")
  .sortBy("customer_id")
  .saveAsTable("customers_bucketed")
```

The optional `sortBy` clause sorts data within each bucket by the bucketing key. This can further improve join performance because Spark can use a sort-merge join without an extra sort step.

How bucketing improves join performance:

- Shuffle elimination: Without bucketing, joining two large tables requires shuffling both sides so that rows with the same join key are co-located. With bucketing, rows with the same key are already in the same bucket on both sides. Spark can read corresponding buckets from both tables and join them without a network shuffle. This reduces network I/O, serialization, and disk I/O.
- Sort avoidance: If both tables are bucketed and sorted by the join key, Spark can perform a sort-merge join directly on each pair of buckets without an additional sort. This saves CPU and memory.
- Partial shuffle avoidance: If only one side is bucketed, Spark can avoid shuffling that side and shuffle only the other side to match the bucketing. This still saves some cost.
- Bucket pruning: When filtering on the bucketing column, Spark can compute the hash and read only the relevant buckets. This is similar to partition pruning but at the bucket level.
- Aggregation optimization: For `groupBy` operations on the bucketing column, Spark can avoid a shuffle because rows with the same key are already in the same bucket.

Example of a join that benefits from bucketing:

```
SELECT c.name, o.amount
FROM orders_bucketed o
JOIN customers_bucketed c
ON o.customer_id = c.customer_id;
```

Because both tables are bucketed by `customer_id` into 100 buckets, Spark can join them without shuffling either side.

Conditions for the join optimization to apply:

- Both tables must be bucketed by the join key.
- Both tables must use the same number of buckets.
- The join key must match the bucketing column or columns.
- The bucketing metadata must be available. This usually means using `saveAsTable` or a metastore-managed table. Reading files directly without the metastore loses the bucketing information.
- The file format must support bucketing, such as Parquet or ORC.

Caveats and limitations:

- Bucketing does not help if the join key differs from the bucketing column.
- Bucketing does not solve data skew. If one key is very frequent, its bucket will still be large.
- Too many buckets create many small files and increase task overhead. Too few buckets create large buckets and reduce parallelism.
- Bucketing is less flexible than partitioning for ad-hoc queries on different columns.
- The bucket count should be chosen based on data size, number of cores, and expected query patterns. A common starting point is a few hundred buckets for large tables, but this depends on the workload.
- Bucketing is not supported for all file formats and is mainly used with Parquet and ORC.
- In Spark, `bucketBy` only works with `saveAsTable`, not with `save`.
- If bucket counts differ between two tables, Spark may not be able to use the bucketed join optimization and may fall back to a shuffle join.

In summary, bucketing pre-organizes data by hash into a fixed number of buckets. For joins, it allows Spark to co-locate matching keys without a shuffle, and with `sortBy` it can also avoid an extra sort. This makes joins faster and less resource-intensive when the join keys and bucket configurations align.

---

### 3.1.4 Explain the difference between `partitionBy` and `bucketBy`.

**Answer:**

`partitionBy` and `bucketBy` are both ways to organize data physically in Spark, but they solve different problems and have different mechanics.

`partitionBy`

- Divides data into directories based on the distinct values of one or more columns.
- Each unique combination of partition column values creates a separate directory, such as `date=2024-01-01/country=IN/`.
- The number of partitions is determined by the data cardinality, not by the user.
- Enables partition pruning. A filter like `WHERE date = '2024-01-01'` reads only the relevant directory.
- Works well for low-cardinality columns such as date, region, or country.
- Can create too many small directories and files if used on high-cardinality columns such as `customer_id` or `order_id`.
- Can be used with `save()` or `saveAsTable()`.
- The directory structure itself carries the partitioning information, though the metastore tracks partitions for tables.

Example:

```
df.write.partitionBy("date", "country").parquet("/path/orders")
```

`bucketBy`

- Divides data into a fixed number of buckets based on the hash of one or more columns.
- The number of buckets is specified by the user, for example 100 buckets.
- Rows are assigned to buckets using `hash(column) modulo numBuckets`.
- Each bucket becomes one or more files within a partition or table.
- Requires `saveAsTable()` so that bucketing metadata is stored in the metastore. If you use `save()`, the bucketing information is lost.
- Enables shuffle-free joins and aggregations when both sides of a join have the same bucketing key and bucket count.
- Works well for high-cardinality columns used in join keys, such as `customer_id`.
- Can optionally sort data within each bucket using `sortBy`, which helps sort-merge joins avoid an extra sort.
- Mainly supports file formats like Parquet and ORC.

Example:

```
df.write
  .bucketBy(100, "customer_id")
  .sortBy("customer_id")
  .saveAsTable("orders_bucketed")
```

Key differences

Purpose: `partitionBy` is mainly for filter pruning and organizing data by value. `bucketBy` is mainly for join and aggregation optimization by hash.

Cardinality: `partitionBy` is for low-cardinality columns. `bucketBy` is for high-cardinality columns.

Number of partitions: `partitionBy` creates one partition per distinct value combination. `bucketBy` creates a fixed number of buckets chosen by the user.

Physical layout: `partitionBy` creates directories. `bucketBy` creates files inside those directories or inside the table.

Metadata: `partitionBy` is self-describing through the directory structure. `bucketBy` requires metastore metadata to be useful for joins and aggregations.

Write API: `partitionBy` works with both `save()` and `saveAsTable()`. `bucketBy` only works with `saveAsTable()`.

Join optimization: `partitionBy` may help if the join key is the partition column and both sides are partitioned identically, but bucketing is the standard mechanism for shuffle-free joins. `bucketBy` eliminates the shuffle when both tables are bucketed by the join key with the same number of buckets.

Filter pruning: `partitionBy` enables partition pruning on partition columns. `bucketBy` enables bucket pruning on the bucketed column.

Skew: `partitionBy` can create skew if one value is very frequent. `bucketBy` distributes data more evenly by hash, but hot keys can still create skewed buckets.

Combining both

You can use `partitionBy` and `bucketBy` together. Partition by a low-cardinality filter column, then bucket by a high-cardinality join key.

Example:

```
df.write
  .partitionBy("date")
  .bucketBy(100, "customer_id")
  .sortBy("customer_id")
  .saveAsTable("orders")
```

This creates one directory per date, and within each date, 100 buckets hashed by `customer_id`. This gives partition pruning on date and shuffle-free joins on `customer_id`.

When to use which

- Use `partitionBy` for columns often used in `WHERE` clauses with low cardinality.
- Use `bucketBy` for columns often used in `JOIN` or `GROUP BY` with high cardinality.
- Use both when you need pruning on a filter column and shuffle-free joins on a join key.
- Avoid `partitionBy` on high-cardinality columns because it creates too many small files.
- Avoid `bucketBy` on columns that are not used in joins or aggregations, because it adds write overhead and metadata complexity.

---

### 3.1.5 What happens if you have too many small partitions (the 'small file problem')?

**Answer:**

Too many small partitions means the number of partitions is far larger than needed for the data volume and cluster size. In Spark, each partition becomes a task, so many small partitions create many tiny tasks. The result is overhead-dominated execution, poor resource utilization, and often the small files problem.

Consequences of too many small partitions:

Task scheduling overhead: The driver must create and schedule a large number of tasks. Each task has fixed overhead for serialization, scheduling, and JVM setup. If tasks are very small, this overhead can exceed the actual processing time. In extreme cases, the driver can run out of memory or take a long time just building the task graph.

CPU and memory overhead: Executors spend more time launching, finishing, and context-switching between tasks than doing useful work. This reduces throughput and wastes CPU cycles.

Shuffle overhead: During a shuffle, each map task produces shuffle blocks for each reduce partition. If both map tasks and reduce partitions are too numerous, you get a huge number of small shuffle blocks. This increases network connections, random I/O, memory pressure, and shuffle fetch failures. Shuffle performance degrades sharply.

Small files problem: When writing data, each partition typically writes at least one file. Too many partitions produce too many small files. On HDFS, this increases NameNode memory usage. On object stores like S3, it increases listing and request costs and slows down reads. Small files also reduce compression efficiency and increase per-file overhead.

Poor scan performance: Reading many small files creates many read tasks. Opening and closing files dominates, and full read throughput cannot be achieved. This is common when a table is over-partitioned with `partitionBy` on a high-cardinality column.

Skew and uneven work: Small partitions can still be uneven. Some tasks finish in milliseconds while others take much longer. This leads to poor cluster utilization and long tail tasks.

Driver memory pressure: A very large number of partitions means a large amount of task and shuffle metadata. The driver may struggle to manage the DAG, stage info, and shuffle metadata, potentially causing out-of-memory errors.

Reduced parallelism efficiency: If partitions are much smaller than the work per core, the cluster spends time on overhead rather than processing. If partitions are fewer than cores, cores sit idle. The goal is a few partitions per core, each with a reasonable amount of data.

How to detect too many small partitions:

Check the number of partitions with `df.rdd.getNumPartitions()`.
Look at the Spark UI. If you see thousands of tasks that each take only a few milliseconds, and shuffle read/write sizes are tiny, you likely have too many small partitions.
Check the number of output files. If writing produces many small files, partitions are too small.

How to fix too many small partitions:

Reduce partitions without shuffle using `coalesce` when you only need fewer partitions and can tolerate uneven sizes.
Use `repartition` when you need even distribution or need to increase partitions.
Enable Adaptive Query Execution (AQE) in Spark 3.x to automatically coalesce shuffle partitions.
Tune `spark.sql.shuffle.partitions` based on data size and cluster size.
Use `spark.sql.files.maxPartitionBytes` and `spark.sql.files.openCostInBytes` to combine small files when reading.
Coalesce before writing to reduce the number of output files.
For Delta Lake, run `OPTIMIZE` to compact small files.
Avoid over-partitioning. Use `partitionBy` only on low-cardinality columns. Use `bucketBy` with a reasonable bucket count.

Code snippets:

```
# Check number of partitions
num_partitions = df.rdd.getNumPartitions()
print(num_partitions)

# Reduce partitions without shuffle
df_fewer = df.coalesce(20)

# Reduce partitions with even distribution
df_even = df.repartition(20)

# Write fewer files
df_fewer.write.mode("overwrite").parquet("/path/output")

# Enable AQE to coalesce shuffle partitions automatically
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")  # 128 MB

# Tune shuffle partitions
spark.conf.set("spark.sql.shuffle.partitions", "200")

# For Delta Lake, compact small files
spark.sql("OPTIMIZE delta.`/path/to/table`")
```

Important caveat: `coalesce(1)` on a large dataset can overload a single executor and cause out-of-memory errors. Use it only for small results.

In summary, too many small partitions cause excessive task overhead, shuffle overhead, small files, poor read performance, and driver memory pressure. The fix is to coalesce, repartition, enable AQE, tune shuffle partitions, and avoid over-partitioning. Target partition sizes around 100 to 200 MB and output file sizes around 128 MB to 1 GB depending on storage.

---

### 3.1.6 How do you determine the optimal number of partitions for a dataset?

**Answer:**

There is no single optimal number of partitions. The right number depends on data size, cluster cores, memory, shuffle behavior, and output requirements. The goal is to keep partitions large enough to amortize task overhead but small enough to use all cores and avoid memory spills.

Key factors:

- Total data size after filtering and aggregation.
- Number of CPU cores in the cluster.
- Target partition size, usually 100 MB to 200 MB.
- Task overhead. Very small tasks waste time on scheduling and JVM setup.
- Shuffle cost. Too many partitions create many small shuffle blocks. Too few create large blocks and spills.
- Output file size. Aim for 128 MB to 1 GB per file depending on storage.
- Data skew. A few large keys can create a few huge partitions even if the total partition count looks reasonable.

Basic formula:

```
numPartitionsBySize = ceil(totalDataSize / targetPartitionSize)
numPartitionsByCores = totalCores * 2 to 4
optimalPartitions = max(numPartitionsBySize, numPartitionsByCores)
```

Example calculation in Python:

```
from math import ceil

total_size_bytes = 100 * 1024**3          # 100 GB
target_partition_size = 128 * 1024**2     # 128 MB
num_partitions_size = ceil(total_size_bytes / target_partition_size)

total_cores = 20 * 4                      # 20 executors * 4 cores
num_partitions_cores = total_cores * 3

optimal_partitions = max(num_partitions_size, num_partitions_cores)
df = df.repartition(optimal_partitions)
```

Practical steps to determine the number:

1. Measure the data size. In Spark UI, check the input size, shuffle read, or shuffle write. You can also estimate from the physical plan or by sampling.
2. Count total cores. `totalCores = number of executors * cores per executor`.
3. Choose a target partition size. Start with 128 MB or 200 MB for general processing.
4. Compute the size-based partition count and the core-based partition count. Take the larger value.
5. Use Adaptive Query Execution (AQE) in Spark 3.x. It can coalesce shuffle partitions and handle skew automatically. Set:
   ```
   spark.conf.set("spark.sql.adaptive.enabled", "true")
   spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
   spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
   ```
6. For input partitions, Spark usually creates one partition per HDFS block or file split. Tune with:
   ```
   spark.conf.set("spark.sql.files.maxPartitionBytes", "134217728")
   spark.conf.set("spark.sql.files.openCostInBytes", "4194304")
   ```
7. For output, control file count with `repartition` or `coalesce`. Aim for 128 MB to 1 GB per file. For small results, use `coalesce`. For large results, use `repartition` to distribute evenly.
8. Monitor and adjust. In Spark UI, look at task durations, shuffle read and write sizes, GC time, and spill. If tasks run in a few milliseconds, you have too many partitions. If tasks run very long or spill heavily, you have too few.

Rules of thumb:

- For general processing, target 100 MB to 200 MB per partition.
- Keep at least 2 to 4 tasks per CPU core to hide latency.
- For shuffle partitions, default 200 is often too high for small data and too low for very large data. Tune based on shuffle size.
- For writing, aim for 128 MB to 1 GB per output file.
- Avoid `coalesce(1)` on large data. It can cause out-of-memory errors.
- If data is skewed, use salting, repartition by a salted key, or AQE skew join.

Code example for writing with controlled partitions:

```
# For a small result, write fewer files
small_df.coalesce(4).write.mode("overwrite").parquet("/path/output")

# For a large result, distribute evenly
large_df.repartition(200).write.mode("overwrite").parquet("/path/output")
```

In summary, determine the optimal number by balancing data size, cluster cores, and target partition size. Use the formula as a starting point, enable AQE, and tune based on Spark UI metrics. There is no fixed number. The best value is workload-specific and should be validated by monitoring performance.

---

### 3.1.7 What is the default number of shuffle partitions in Spark, and how do you change it?

**Answer:**

The default number of shuffle partitions in Spark SQL and the DataFrame API is 200. This is controlled by the configuration property `spark.sql.shuffle.partitions`. It applies to shuffles caused by operations such as `groupBy`, `join`, `distinct`, `reduceByKey` on DataFrames, and `repartition` when using SQL/DataFrame execution.

For RDDs, the default is different. Shuffle operations on RDDs use `spark.default.parallelism`. If it is not set, Spark derives it from the cluster: in local mode it is the number of cores, and in cluster mode it is typically the total number of cores across executors, or 2 if that cannot be determined.

How to change the SQL/DataFrame shuffle partition count:

At SparkSession creation:

```
spark = (SparkSession.builder
         .appName("MyApp")
         .config("spark.sql.shuffle.partitions", "400")
         .getOrCreate())
```

At runtime in PySpark:

```
spark.conf.set("spark.sql.shuffle.partitions", "400")
```

At runtime in Scala:

```
spark.conf.set("spark.sql.shuffle.partitions", "400")
```

Using SQL:

```
SET spark.sql.shuffle.partitions=400;
```

Using spark-submit:

```
spark-submit --conf spark.sql.shuffle.partitions=400 my_app.py
```

How to change the RDD default parallelism:

At SparkSession or SparkConf creation:

```
spark = (SparkSession.builder
         .appName("MyApp")
         .config("spark.default.parallelism", "400")
         .getOrCreate())
```

At runtime for RDDs, you usually set it before the SparkContext is created. Changing it later may not affect all operations. You can also control partitions explicitly with `repartition` or `coalesce`.

Important notes:

The value 200 is only an initial default. In Spark 3.x, Adaptive Query Execution (AQE) can coalesce shuffle partitions at runtime. Enable it with:

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
```

AQE does not change the initial number of shuffle partitions. It reduces them after the shuffle based on actual data size. The initial number still comes from `spark.sql.shuffle.partitions`.

Choose the number based on data size and cluster cores. A common starting point is 2 to 4 tasks per CPU core, or target 100 MB to 200 MB per partition. For very small data, 200 may be too many and cause overhead. For very large data, 200 may be too few and cause spills or long tasks.

---

**Notebook link:**  
The notebooks (markdown files) for this section are available in the repository at:  
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.1%20Partitioning%20And%20Bucketing
