# 3.2 Shuffling And Data Exchange

Shuffling is the process of redistributing data across partitions and executors so that records with the same key are co-located for operations such as joins, aggregations, and sorting. Data exchange is the physical plan operator that represents this redistribution. Shuffling is the most expensive operation in Spark because it involves disk I/O, network I/O, serialization, deserialization, sorting, and memory pressure.

### 3.2.1 What is shuffling in Spark and why is it expensive?

**Answer:**

Shuffling is the redistribution of data across partitions. It happens when Spark needs to bring together records that share a key but currently reside in different partitions. Operations that trigger a shuffle include `groupBy`, `join`, `distinct`, `reduceByKey`, `repartition`, `orderBy`, and `sortWithinPartitions` when followed by an aggregation. A shuffle creates a stage boundary. The upstream stage writes shuffle data, and the downstream stage reads it.

Shuffling is expensive for these reasons:

- Network I/O: Data is transferred between executors over the network.
- Disk I/O: Map tasks write shuffle files to local disk, and reduce tasks may spill to disk.
- Serialization and deserialization: Records must be serialized to bytes for transfer and deserialized on the other side.
- Sorting and aggregation: Many shuffle implementations sort records by partition and key, which consumes CPU and memory.
- Memory pressure and GC: Buffers and hash maps for shuffle data can cause frequent garbage collection or out-of-memory errors.
- Fetch failures: If a reducer cannot fetch a shuffle block, Spark may retry the stage, which is costly.
- Skew: Uneven key distribution can make a few reducers much slower than others.

Because of these costs, reducing unnecessary shuffles is a primary Spark tuning goal.

Example of operations that trigger a shuffle:

```
df.groupBy("customer_id").agg(sum("amount"))   # shuffle
df.join(other, "customer_id")                  # shuffle unless broadcast
df.distinct()                                  # shuffle
df.repartition(100, "customer_id")             # shuffle
```

Example of operations that avoid a shuffle:

```
df.filter(df.date >= "2024-01-01")             # no shuffle
df.select("customer_id", "amount")             # no shuffle
df.withColumn("tax", df.amount * 0.1)          # no shuffle
```

### 3.2.2 How does Spark perform a shuffle? Explain shuffle write and shuffle read.

**Answer:**

Spark performs a shuffle in two phases: shuffle write and shuffle read.

Shuffle write:

- Each map task processes its input partition.
- For each record, Spark computes the target reduce partition. For hash partitioning, it uses `hash(key) % numPartitions`. For range partitioning, it uses range boundaries.
- The map task writes records into a shuffle file, grouped by target partition. The default shuffle manager is `SortShuffleManager`. It writes records into memory, sorts them by partition ID and optionally by key, spills to disk if needed, and finally merges spill files into a single shuffle file with an index file.
- The shuffle file is stored in the local disk directory configured by `spark.local.dir`. The index file records the offset and length of each partition's block so reducers can fetch only what they need.
- Map tasks also send a map status to the driver with the location and size of their shuffle blocks.

Shuffle read:

- Each reduce task knows which map outputs it needs based on the shuffle dependency.
- The reduce task fetches its blocks from the map task executors over the network. It may use a shuffle service or the executor's Netty server.
- Fetched blocks are stored in memory. If memory is insufficient, they spill to disk.
- The reduce task then performs the required operation. For a sort-merge join, it sorts and merges records from different map outputs by key. For an aggregation, it aggregates records by key.
- If a fetch fails, Spark retries the fetch up to `spark.shuffle.io.maxRetries` times. If it still fails, the stage may be re-executed.

Shuffle write and read are separated by a stage boundary. The Spark UI shows shuffle write size in the map stage and shuffle read size in the reduce stage.

Relevant configurations:

```
spark.sql.shuffle.partitions=200          # number of reduce partitions for SQL/DataFrames
spark.default.parallelism=200             # default parallelism for RDD shuffles
spark.shuffle.file.buffer=32k             # buffer size for shuffle write
spark.shuffle.io.maxRetries=3             # fetch retries
spark.shuffle.io.retryWait=5s             # wait between retries
spark.reducer.maxSizeInFlight=48m         # max size of fetch requests
spark.shuffle.compress=true               # compress shuffle data
spark.shuffle.spill.compress=true         # compress spill files
```

In Spark SQL physical plans, a shuffle appears as an `Exchange` node. Examples include `Exchange hashpartitioning(customer_id, 200)`, `Exchange rangepartitioning(date, 200)`, and `Exchange SinglePartition` for operations like `coalesce(1)` or global aggregations.

### 3.2.3 What are the different types of joins in Spark and which ones avoid a shuffle?

**Answer:**

Spark has several join strategies. The choice depends on table sizes, join type, join condition, and configuration.

Broadcast Hash Join (BHJ):

- One side is small enough to be broadcast to every executor.
- The small side is collected to the driver and then sent to each executor as a broadcast variable.
- The large side is not shuffled. Each executor builds a hash map from the broadcast data and probes it with the large side's records.
- Avoids a shuffle of the large table. Very fast for star-schema joins.
- Used when the small side is below `spark.sql.autoBroadcastJoinThreshold`, default 10 MB.
- Can be forced with a hint: `df1.join(broadcast(df2), "key")`.
- Risk: if the broadcast side is too large, it can cause out-of-memory errors on executors and the driver.

Shuffle Hash Join (SHJ):

- Both sides are shuffled by the join key.
- Each partition builds a hash map from one side and probes it with the other side.
- Requires one side per partition to fit in memory.
- Used when one side is smaller than the other but still too large to broadcast.
- Can be enabled by setting `spark.sql.join.preferSortMergeJoin=false` and ensuring the small side is at least three times smaller than the large side.

Shuffle Sort Merge Join (SMJ):

- Both sides are shuffled by the join key and sorted.
- Each reducer merges the sorted streams from both sides.
- Default strategy for large-to-large equi-joins.
- Requires a shuffle and a sort on both sides.
- More scalable than SHJ because it does not need to hold an entire partition side in memory.

Broadcast Nested Loop Join (BNLJ):

- Used for non-equi joins such as `df1.join(df2, df1.a < df2.b)`.
- One side is broadcast. For each row on the other side, Spark loops over the broadcast side.
- Can be very expensive if the broadcast side is not small.
- Avoid if possible by rewriting the join as an equi-join.

Cartesian Product Join:

- Used for cross joins without a condition.
- Can explode in size. Requires `spark.sql.crossJoin.enabled=true` in some versions.
- Avoid unless necessary.

Which joins avoid a shuffle:

- Broadcast Hash Join avoids shuffling the large table. The small table is broadcast, which is a network transfer but not a shuffle of the large table.
- Broadcast Nested Loop Join also avoids shuffling the large table.
- Shuffle Hash Join and Sort Merge Join both require a shuffle of both sides.

Example of a broadcast join:

```
from pyspark.sql.functions import broadcast

large_df.join(broadcast(small_df), "customer_id")
```

Example of disabling broadcast to force a sort-merge join:

```
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
large_df.join(other_large_df, "customer_id")
```

### 3.2.4 What is a broadcast join and when does Spark use it?

**Answer:**

A broadcast join is a join strategy where one side of the join is small enough to be sent to every executor. Spark collects the small side to the driver, then broadcasts it to all executors. Each executor builds an in-memory hash map from the broadcast data and probes it with the records from the large side. The large side is not shuffled. This makes broadcast joins very efficient for joins between a large fact table and a small dimension table.

Spark uses a broadcast join when:

- The estimated size of one side is below `spark.sql.autoBroadcastJoinThreshold`. The default is 10 MB. Set to -1 to disable automatic broadcast.
- The join type supports broadcast. Inner joins, left outer joins where the right side is broadcast, right outer joins where the left side is broadcast, and full outer joins are not supported for broadcast in all cases.
- The join condition is an equi-join, or the join is a non-equi join that can use Broadcast Nested Loop Join.
- A broadcast hint is provided: `broadcast(df)`.

You can control broadcast behavior with these configurations:

```
spark.sql.autoBroadcastJoinThreshold=10485760    # 10 MB default
spark.sql.broadcastTimeout=300                   # seconds to wait for broadcast
spark.sql.adaptive.enabled=true                  # AQE can convert to broadcast at runtime
```

Example:

```
from pyspark.sql.functions import broadcast

result = large_df.join(broadcast(small_df), "customer_id")
```

Important caveats:

- Broadcasting a table that is too large can cause out-of-memory errors on the driver and executors.
- The broadcast table must fit in the memory of each executor.
- Broadcast joins are not a cure for skew on the large side. If the large side is skewed, some tasks may still be slow.
- In Spark 3.x, AQE can convert a sort-merge join to a broadcast join at runtime if one side turns out to be small enough after filtering.

### 3.2.5 What is Adaptive Query Execution (AQE) and how does it help with shuffling?

**Answer:**

Adaptive Query Execution (AQE) is a Spark 3.x feature that re-optimizes a query plan at runtime based on statistics gathered from completed stages. It is especially useful for shuffle-heavy workloads because it can change the number of shuffle partitions, switch join strategies, and handle skew after seeing actual data sizes.

AQE features related to shuffling:

Coalescing shuffle partitions:

- After a shuffle write, AQE reads the sizes of the shuffle partitions.
- It combines small adjacent partitions into larger ones to reduce the number of reduce tasks.
- This avoids the problem of having too many small partitions when `spark.sql.shuffle.partitions` is set too high.
- Controlled by:
  ```
  spark.sql.adaptive.enabled=true
  spark.sql.adaptive.coalescePartitions.enabled=true
  spark.sql.adaptive.advisoryPartitionSizeInBytes=134217728   # 128 MB
  spark.sql.adaptive.coalescePartitions.minPartitionSize=1MB
  ```

Switching join strategies:

- AQE can convert a sort-merge join to a broadcast hash join at runtime if one side is small enough after filtering.
- It can also convert a broadcast join to a sort-merge join if the broadcast side is too large.
- Controlled by `spark.sql.adaptive.enabled=true`.

Handling skew join:

- AQE detects skewed partitions where one partition is much larger than the median.
- It splits the skewed partition into smaller sub-partitions and replicates the matching side for those keys.
- This reduces the long tail caused by hot keys.
- Controlled by:
  ```
  spark.sql.adaptive.skewJoin.enabled=true
  spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
  spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB
  ```

Optimizing local shuffle reads:

- When a shuffle partition is small and can be read locally, AQE can avoid a remote fetch.
- Controlled by `spark.sql.adaptive.localShuffleReader.enabled=true`.

Example of enabling AQE:

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
```

AQE does not change the initial number of shuffle partitions. The initial number still comes from `spark.sql.shuffle.partitions`. AQE reduces or reorganizes them after the shuffle write completes. AQE is one of the most effective ways to improve shuffle performance without manual tuning.

### 3.2.6 What is data skew and how do you handle it?

**Answer:**

Data skew is the uneven distribution of data across partitions. It occurs when one or a few keys are much more frequent than others. During a shuffle, all records with the same key go to the same partition. If one key has millions of records and others have a few, one reducer will do most of the work while others finish quickly. This creates a long tail of slow tasks, high memory usage, spills, and sometimes out-of-memory errors.

Symptoms of skew:

- A few tasks take much longer than others in the Spark UI.
- Shuffle read sizes vary widely across tasks.
- Some tasks spill heavily to disk.
- Executors run out of memory during a shuffle or join.
- The job appears to hang near the end while a few tasks finish.

Common causes:

- Joining on a column with a hot key, such as a default value, null, or a popular customer ID.
- Grouping by a column with a few dominant values.
- Partitioning by a high-cardinality column that still has hot values.
- Using `repartition` on a skewed column.

How to handle skew:

Salting the key:

- Add a random suffix to the skewed key on the large table.
- Replicate the small table for each salt value.
- Join on the salted key.
- After the join, remove the salt.

Example:

```
from pyspark.sql.functions import rand, floor, lit, concat, explode, array

salt_range = 10

# Large table: add salt
large_salted = large_df.withColumn(
    "salt", floor(rand() * salt_range)
).withColumn(
    "salted_key", concat(large_df.customer_id, lit("_"), floor(rand() * salt_range))
)

# Small table: replicate for each salt
small_replicated = small_df.withColumn(
    "salt", explode(array([lit(i) for i in range(salt_range)]))
).withColumn(
    "salted_key", concat(small_df.customer_id, lit("_"), lit("salt"))
)
```

This is a simplified example. In practice, you generate the salted key consistently on both sides.

Broadcast the small side:

- If one side of the join is small, broadcast it to avoid shuffling the large side. This eliminates the shuffle skew for the large side.

Use AQE skew join:

- Enable AQE skew join handling as described in 3.2.5. Spark automatically splits skewed partitions and replicates the matching side.

Isolate skewed keys:

- Process the hot keys separately with a broadcast join or a dedicated job.
- Process the rest of the data with a normal join.
- Union the results.

Increase parallelism:

- Increase `spark.sql.shuffle.partitions` so that the hot key is spread across more partitions. This does not solve skew if the key is truly hot, but it can help if partitions are too large overall.

Use two-phase aggregation:

- For groupBy on a skewed key, first aggregate with a salted key, then aggregate again to remove the salt. This is similar to salting.

Repartition by a different column:

- If the join key is skewed, consider repartitioning by a more evenly distributed column if the join semantics allow it.

Example of two-phase aggregation:

```
# First phase: salt and partial aggregation
salted = df.withColumn("salt", floor(rand() * 10))
partial = salted.groupBy("key", "salt").agg(sum("value").alias("partial_sum"))

# Second phase: final aggregation
final = partial.groupBy("key").agg(sum("partial_sum").alias("total"))
```

Skew is one of the most common causes of slow Spark jobs. The right fix depends on the operation and the data distribution. Salting, broadcast joins, and AQE skew join are the most common solutions.

### 3.2.7 How do you reduce shuffle in Spark?

**Answer:**

Reducing shuffle is one of the most effective ways to improve Spark performance. Every shuffle writes data to disk, transfers it over the network, and reads it back. The following techniques reduce the number, size, or cost of shuffles.

Use broadcast joins for small tables:

- If one side of a join is small, broadcast it. This avoids shuffling the large side.
- Use the `broadcast()` hint or rely on `spark.sql.autoBroadcastJoinThreshold`.

Filter and select early:

- Apply filters before joins and aggregations so that less data is shuffled.
- Select only the columns needed for the shuffle.
- Push filters down to the data source when possible.

Use bucketing:

- Bucket tables by the join key with the same number of buckets. This enables shuffle-free joins when both sides are bucketed and the metadata is available.
- Use `bucketBy` with `saveAsTable`.

Use partitioning:

- Partition by low-cardinality filter columns to enable partition pruning and reduce the data read before a shuffle.
- Avoid over-partitioning, which creates small files.

Prefer `reduceByKey` over `groupByKey` on RDDs:

- `reduceByKey` performs map-side combining before the shuffle, which reduces the amount of data transferred.
- `groupByKey` sends all values for a key without combining, which is much more expensive.

Use `aggregateByKey` or `combineByKey` for custom aggregations:

- These also perform map-side combining.

Use `coalesce` instead of `repartition` when reducing partitions:

- `coalesce` avoids a shuffle when decreasing the number of partitions.
- Use `repartition` only when you need to increase partitions or need even distribution.

Avoid unnecessary `repartition` and `distinct`:

- `repartition` always shuffles. Use it only when needed.
- `distinct` shuffles. If you only need to drop duplicates on a subset of columns, use `dropDuplicates` with those columns, but note it still shuffles.
- Consider using `dropDuplicates` on a window or `groupBy` if it can be combined with other operations.

Tune shuffle partitions:

- Set `spark.sql.shuffle.partitions` based on data size. Too many partitions create small tasks and many small shuffle blocks. Too few create large partitions and spills.
- Enable AQE to coalesce shuffle partitions automatically.

Use AQE:

- AQE can coalesce partitions, switch join strategies, and handle skew, all of which reduce the effective cost of shuffles.

Use columnar formats and compression:

- Parquet and ORC reduce I/O before and after shuffles.
- Enable shuffle compression: `spark.shuffle.compress=true` and `spark.shuffle.spill.compress=true`.

Use `mapPartitions` for expensive setup:

- If you need to initialize a resource per partition, `mapPartitions` avoids repeated setup per row. This does not reduce shuffle but improves overall performance.

Example of reducing shuffle with broadcast join and early filter:

```
from pyspark.sql.functions import broadcast

filtered_large = large_df.filter(large_df.date >= "2024-01-01").select("customer_id", "amount")
small_dim = small_df.select("customer_id", "segment")

result = filtered_large.join(broadcast(small_dim), "customer_id")
```

Example of using `reduceByKey` instead of `groupByKey`:

```
# Good: map-side combine reduces shuffle data
rdd.reduceByKey(lambda a, b: a + b)

# Bad: sends all values for each key
rdd.groupByKey().mapValues(sum)
```

Example of using AQE to coalesce shuffle partitions:

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
```

In summary, reduce shuffle by broadcasting small tables, filtering early, using bucketing, preferring map-side combining, avoiding unnecessary repartitioning, tuning shuffle partitions, and enabling AQE.

### 3.2.8 What is the difference between map-side and reduce-side operations in shuffling?

**Answer:**

In a shuffle, the map side is the write phase and the reduce side is the read phase. Operations can be classified as map-side, reduce-side, or both.

Map-side operations:

- Happen before the shuffle write, within the map task.
- Process records in the current partition without moving data across the network.
- Can reduce the amount of data written to the shuffle by combining or filtering records early.
- Examples: `map`, `filter`, `flatMap`, `mapPartitions`, `reduceByKey` map-side combine, `aggregateByKey` map-side combine, partial aggregation in DataFrame `groupBy`.
- Map-side combining is a key optimization. It reduces the number of records that must be written to disk and transferred over the network.

Reduce-side operations:

- Happen after the shuffle read, within the reduce task.
- Require data to be brought together by key from multiple map outputs.
- Often involve sorting, merging, and final aggregation.
- Examples: `reduceByKey` reduce-side merge, `groupByKey` reduce-side grouping, `join` reduce-side merge, `sortByKey`, final aggregation in DataFrame `groupBy`.
- Reduce-side operations are more expensive because they involve network transfer and often disk I/O.

Operations that are both map-side and reduce-side:

- `reduceByKey`: map-side combine then reduce-side merge.
- `aggregateByKey`: map-side combine then reduce-side merge.
- `combineByKey`: map-side combine then reduce-side merge.
- DataFrame `groupBy().agg()`: partial aggregation on the map side, final aggregation on the reduce side.

Operations that are only reduce-side:

- `groupByKey`: no map-side combine. All values for a key are sent to the reducer.
- `sortByKey`: requires a shuffle and a reduce-side sort.
- `join` without map-side combine: both sides are shuffled and merged on the reduce side.

Why this matters:

- Map-side combining reduces shuffle size. For example, `reduceByKey` sums values locally before sending them, so if a key appears 1000 times in a partition, it sends one partial sum instead of 1000 records.
- `groupByKey` does not combine, so it sends all 1000 records. This can cause out-of-memory errors and network congestion.
- In DataFrames, Spark's optimizer automatically inserts partial aggregations when possible. This is why `df.groupBy("key").agg(sum("value"))` is more efficient than collecting all values and summing them manually.

Example comparing `reduceByKey` and `groupByKey`:

```
# Good: map-side combine reduces shuffle data
rdd.reduceByKey(lambda a, b: a + b)

# Bad: no map-side combine, all values are shuffled
rdd.groupByKey().mapValues(sum)
```

Example of DataFrame partial aggregation:

```
df.groupBy("customer_id").agg(sum("amount").alias("total"))
```

Spark performs partial aggregation on the map side and final aggregation on the reduce side. You can see this in the physical plan as multiple `HashAggregate` nodes separated by an `Exchange`.

In summary, map-side operations happen before the shuffle and can reduce data size. Reduce-side operations happen after the shuffle and are more expensive. Prefer operations that perform map-side combining, such as `reduceByKey`, `aggregateByKey`, and DataFrame aggregations, over operations that only work on the reduce side, such as `groupByKey`.

**Notebook link:**  
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.2%20Shuffling%20And%20Data%20Exchange
