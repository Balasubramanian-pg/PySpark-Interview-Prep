# 3.3 Join Strategies

# 3.3 Join Strategies

Joins are one of the most common and most expensive operations in Spark. Spark chooses a join strategy based on table sizes, join type, join condition, and configuration. Understanding these strategies helps you write faster jobs, avoid unnecessary shuffles, and fix performance problems like skew and out-of-memory errors.

### 3.3.1 What are the different join strategies in Spark?

**Answer:**

Spark has several join strategies. The main ones are:

- Broadcast Hash Join (BHJ)
- Shuffle Hash Join (SHJ)
- Shuffle Sort Merge Join (SMJ)
- Broadcast Nested Loop Join (BNLJ)
- Cartesian Product Join

Broadcast Hash Join:
- One side is small enough to be broadcast to every executor.
- The small side is collected to the driver and sent to each executor as a broadcast variable.
- Each executor builds an in-memory hash map and probes it with the large side.
- The large side is not shuffled.
- Fastest for star-schema joins where one table is small.
- Controlled by `spark.sql.autoBroadcastJoinThreshold` (default 10 MB).
- Can be forced with `broadcast(df)` hint.

Shuffle Hash Join:
- Both sides are shuffled by the join key.
- Each partition builds a hash map from one side and probes it with the other.
- Requires one side per partition to fit in memory.
- Used when one side is smaller than the other but too large to broadcast.
- Enabled when `spark.sql.join.preferSortMergeJoin=false` and the small side is at least three times smaller than the large side.

Shuffle Sort Merge Join:
- Both sides are shuffled by the join key and sorted.
- Each reducer merges the sorted streams from both sides.
- Default strategy for large-to-large equi-joins.
- Requires a shuffle and a sort on both sides.
- More scalable than SHJ because it does not need to hold an entire partition side in memory.

Broadcast Nested Loop Join:
- Used for non-equi joins such as `df1.join(df2, df1.a < df2.b)`.
- One side is broadcast. For each row on the other side, Spark loops over the broadcast side.
- Can be very expensive if the broadcast side is not small.
- Avoid by rewriting as an equi-join when possible.

Cartesian Product Join:
- Used for cross joins without a condition.
- Can explode in size. Requires `spark.sql.crossJoin.enabled=true` in some versions.
- Avoid unless necessary.

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

### 3.3.2 When does Spark use a Broadcast Hash Join?

**Answer:**

Spark uses a Broadcast Hash Join when one side of the join is small enough to fit in memory and be broadcast to all executors. The small side is collected to the driver, then broadcast to each executor. Each executor builds a hash map from the broadcast data and probes it with records from the large side. The large side is not shuffled, which makes this the fastest join strategy for suitable cases.

Conditions for Broadcast Hash Join:

- The estimated size of one side is below `spark.sql.autoBroadcastJoinThreshold`. The default is 10 MB. Set to -1 to disable automatic broadcast.
- The join type supports broadcast. Inner joins, left outer joins where the right side is broadcast, and right outer joins where the left side is broadcast are supported. Full outer joins are not always supported.
- The join condition is an equi-join, or the join is a non-equi join that can use Broadcast Nested Loop Join.
- A broadcast hint is provided: `broadcast(df)`.
- In Spark 3.x, Adaptive Query Execution (AQE) can convert a sort-merge join to a broadcast join at runtime if one side turns out to be small enough after filtering.

Configuration:

```
spark.sql.autoBroadcastJoinThreshold=10485760    # 10 MB default
spark.sql.broadcastTimeout=300                   # seconds to wait for broadcast
spark.sql.adaptive.enabled=true                  # AQE can convert at runtime
```

Example:

```
from pyspark.sql.functions import broadcast

result = large_df.join(broadcast(small_df), "customer_id")
```

Caveats:

- Broadcasting a table that is too large can cause out-of-memory errors on the driver and executors.
- The broadcast table must fit in the memory of each executor.
- Broadcast joins are not a cure for skew on the large side. If the large side is skewed, some tasks may still be slow.
- In Spark 3.x, AQE can also convert a broadcast join back to a sort-merge join if the broadcast side is too large.

### 3.3.3 What is a Sort Merge Join and when is it used?

**Answer:**

A Sort Merge Join (SMJ) is the default join strategy for large-to-large equi-joins in Spark. Both sides of the join are shuffled by the join key and sorted. Each reducer then merges the sorted streams from both sides, similar to the merge step of merge sort.

How it works:

- Shuffle phase: Both tables are repartitioned by the join key using hash partitioning. This ensures that rows with the same key end up in the same partition.
- Sort phase: Each partition is sorted by the join key.
- Merge phase: The reducer iterates through both sorted streams in parallel. When it finds matching keys, it outputs the joined rows. For multiple rows with the same key, it buffers the rows from one side and matches them with rows from the other side.

When it is used:

- Default for large equi-joins when broadcast is not applicable.
- Used when both sides are too large to broadcast and one side is not significantly smaller than the other.
- Controlled by `spark.sql.join.preferSortMergeJoin`, which defaults to true.
- Can be forced by disabling broadcast (`spark.sql.autoBroadcastJoinThreshold=-1`) and setting `spark.sql.join.preferSortMergeJoin=true`.

Example:

```
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
spark.conf.set("spark.sql.join.preferSortMergeJoin", "true")

result = large_df1.join(large_df2, "customer_id")
```

Advantages:

- Scales to very large datasets because it does not need to hold an entire partition side in memory.
- Works well when data is already sorted or bucketed by the join key.
- Handles skew better than Shuffle Hash Join because it does not build a hash map for the entire partition.

Disadvantages:

- Requires a full shuffle of both sides.
- Requires a sort of both sides, which is CPU and memory intensive.
- Can spill to disk if partitions are large.

If both tables are bucketed by the join key with the same number of buckets and sorted by the key, Spark can skip the shuffle and the sort, performing the merge directly on the bucketed files. This is a major optimization.

### 3.3.4 What is a Shuffle Hash Join?

**Answer:**

A Shuffle Hash Join (SHJ) is a join strategy where both sides are shuffled by the join key, and then each partition builds an in-memory hash map from one side and probes it with the other side. It is used when one side is smaller than the other but still too large to broadcast.

How it works:

- Shuffle phase: Both tables are repartitioned by the join key.
- Build phase: For each partition, Spark chooses the smaller side to build a hash map. The hash map is stored in memory.
- Probe phase: Spark iterates through the larger side and probes the hash map for matching keys.

When it is used:

- When one side is smaller than the other but still too large to broadcast.
- When `spark.sql.join.preferSortMergeJoin` is set to false.
- When the smaller side is at least three times smaller than the larger side (this is a heuristic; the actual condition involves size estimation).
- When the join is an equi-join.

Configuration:

```
spark.conf.set("spark.sql.join.preferSortMergeJoin", "false")
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
```

Example:

```
spark.conf.set("spark.sql.join.preferSortMergeJoin", "false")
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)

result = medium_df.join(large_df, "customer_id")
```

Advantages:

- Can be faster than Sort Merge Join when one side is much smaller, because it avoids sorting the large side.
- Does not require a global sort.

Disadvantages:

- Requires the smaller side per partition to fit in memory. If it does not, it can cause out-of-memory errors.
- Sensitive to skew. If one key is very frequent, its partition may be too large to fit in memory.
- Less scalable than Sort Merge Join for very large datasets.

Because of these limitations, Sort Merge Join is the default for large joins. Shuffle Hash Join is used when the size difference is significant and the smaller side is known to fit in memory.

### 3.3.5 What is a Broadcast Nested Loop Join and when is it used?

**Answer:**

A Broadcast Nested Loop Join (BNLJ) is used for non-equi joins, such as `df1.join(df2, df1.a < df2.b)`, where a hash-based join cannot be used. One side is broadcast to all executors, and then for each row on the other side, Spark loops over the broadcast side to find matches.

How it works:

- The smaller side is collected to the driver and broadcast to all executors.
- Each executor iterates over the rows of the larger side. For each row, it loops over the broadcast side and evaluates the join condition.
- This is essentially a nested loop: for each row in the large side, check every row in the small side.

When it is used:

- For non-equi joins (e.g., `<`, `>`, `<=`, `>=`, `!=`).
- For joins without a condition (cross joins), though these are handled by Cartesian Product Join.
- When one side is small enough to broadcast.
- When no other join strategy is applicable.

Configuration:

- Controlled by `spark.sql.autoBroadcastJoinThreshold` for the broadcast side.
- Can be forced with a broadcast hint: `broadcast(df)`.

Example:

```
from pyspark.sql.functions import broadcast

result = large_df.join(broadcast(small_df), large_df.a < small_df.b)
```

Advantages:

- Works for non-equi joins where hash joins cannot be used.
- Avoids shuffling the large side.

Disadvantages:

- Very expensive if the broadcast side is not small. The complexity is O(N * M) where N is the large side and M is the small side.
- Can cause out-of-memory errors if the broadcast side is too large.
- Should be avoided if the join can be rewritten as an equi-join.

If you have a non-equi join, try to rewrite it as an equi-join if possible. For example, instead of joining on `a < b`, you might be able to add a derived column or use a range join with bucketing.

### 3.3.6 How do join hints work in Spark?

**Answer:**

Join hints let you override Spark's automatic join strategy selection. They are useful when Spark's cost-based optimizer makes a poor choice, or when you know something about the data that Spark does not.

Types of join hints:

- `BROADCAST` or `broadcast(df)`: Forces a broadcast hash join. The hinted table is broadcast.
- `MERGE` or `merge(df)`: Forces a sort-merge join.
- `SHUFFLE_HASH` or `shuffle_hash(df)`: Forces a shuffle hash join.
- `SHUFFLE_REPLICATE_NL` or `shuffle_replicate_nl(df)`: Forces a shuffle-and-replicate nested loop join.
- `BROADCASTJOIN`: Same as BROADCAST.
- `SHUFFLE_MERGE`: Same as MERGE.

Using hints in the DataFrame API:

```
from pyspark.sql.functions import broadcast

# Broadcast hint
result = large_df.join(broadcast(small_df), "customer_id")

# Merge hint (sort-merge join)
result = df1.hint("merge").join(df2, "customer_id")

# Shuffle hash hint
result = df1.hint("shuffle_hash").join(df2, "customer_id")
```

Using hints in SQL:

```
SELECT /*+ BROADCAST(small) */ *
FROM large
JOIN small ON large.id = small.id;

SELECT /*+ MERGE(df1, df2) */ *
FROM df1
JOIN df2 ON df1.id = df2.id;

SELECT /*+ SHUFFLE_HASH(df1) */ *
FROM df1
JOIN df2 ON df1.id = df2.id;
```

Caveats:

- Hints are not guaranteed to be honored. Spark may ignore a hint if it is not applicable or if it would cause an error.
- Broadcast hints can cause out-of-memory errors if the broadcast side is too large. Use with caution.
- Hints are a manual override. Prefer letting Spark's optimizer and AQE make decisions unless you have a specific reason.
- In Spark 3.x, AQE can override hints at runtime if it finds a better plan.

Example of forcing a broadcast join when Spark would otherwise choose sort-merge:

```
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
result = large_df.join(broadcast(small_df), "customer_id")
```

### 3.3.7 How does Adaptive Query Execution (AQE) affect join strategies?

**Answer:**

Adaptive Query Execution (AQE) is a Spark 3.x feature that re-optimizes the query plan at runtime based on statistics gathered from completed stages. It can change join strategies after seeing actual data sizes, which is especially useful when statistics are outdated or missing.

AQE features related to joins:

- Converting sort-merge join to broadcast hash join: If one side of a sort-merge join turns out to be small enough after filtering, AQE can convert it to a broadcast join at runtime. This avoids shuffling the large side.
- Converting broadcast hash join to sort-merge join: If the broadcast side is too large, AQE can fall back to a sort-merge join to avoid out-of-memory errors.
- Handling skew join: AQE detects skewed partitions where one partition is much larger than the median. It splits the skewed partition into smaller sub-partitions and replicates the matching side for those keys. This reduces the long tail caused by hot keys.
- Coalescing shuffle partitions: AQE combines small shuffle partitions into larger ones, reducing the number of reduce tasks and the overhead of many small tasks.

Configuration:

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
```

How AQE changes join strategy:

- During query execution, AQE materializes the shuffle stages and collects statistics on the actual size of each partition.
- Based on these statistics, it can re-optimize the remaining plan. For example, if a sort-merge join has one side that is now small, AQE can replace it with a broadcast hash join.
- AQE also handles skew by splitting large partitions and replicating the other side for the skewed keys.

Benefits:

- Reduces the need for manual tuning and hints.
- Adapts to data changes and filtering that reduce table sizes.
- Improves performance for joins with skew or outdated statistics.

Caveats:

- AQE is enabled by default in Spark 3.2 and later, but some features may need explicit configuration.
- AQE does not change the initial number of shuffle partitions. It reduces them after the shuffle.
- AQE adds some overhead for collecting statistics and re-optimizing, but this is usually outweighed by the benefits.

Example of enabling AQE:

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
```

### 3.3.8 How do you handle data skew in joins?

**Answer:**

Data skew is the uneven distribution of data across partitions. It occurs when one or a few keys are much more frequent than others. During a join, all records with the same key go to the same partition. If one key has millions of records and others have a few, one reducer will do most of the work while others finish quickly. This creates a long tail of slow tasks, high memory usage, spills, and sometimes out-of-memory errors.

Symptoms of skew:

- A few tasks take much longer than others in the Spark UI.
- Shuffle read sizes vary widely across tasks.
- Some tasks spill heavily to disk.
- Executors run out of memory during a join.
- The job appears to hang near the end while a few tasks finish.

Common causes:

- Joining on a column with a hot key, such as a default value, null, or a popular customer ID.
- Grouping by a column with a few dominant values.
- Partitioning by a high-cardinality column that still has hot values.
- Using `repartition` on a skewed column.

How to handle skew:

1. Salting the key:
   - Add a random suffix to the skewed key on the large table.
   - Replicate the small table for each salt value.
   - Join on the salted key.
   - After the join, remove the salt.

Example:

```
from pyspark.sql.functions import rand, floor, concat, lit, explode, array

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

2. Broadcast the small side:
   - If one side of the join is small, broadcast it to avoid shuffling the large side. This eliminates the shuffle skew for the large side.

3. Use AQE skew join:
   - Enable AQE skew join handling. Spark automatically splits skewed partitions and replicates the matching side.

```
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
```

4. Isolate skewed keys:
   - Process the hot keys separately with a broadcast join or a dedicated job.
   - Process the rest of the data with a normal join.
   - Union the results.

5. Increase parallelism:
   - Increase `spark.sql.shuffle.partitions` so that the hot key is spread across more partitions. This does not solve skew if the key is truly hot, but it can help if partitions are too large overall.

6. Use two-phase aggregation:
   - For groupBy on a skewed key, first aggregate with a salted key, then aggregate again to remove the salt. This is similar to salting.

Example of two-phase aggregation:

```
# First phase: salt and partial aggregation
salted = df.withColumn("salt", floor(rand() * 10))
partial = salted.groupBy("key", "salt").agg(sum("value").alias("partial_sum"))

# Second phase: final aggregation
final = partial.groupBy("key").agg(sum("partial_sum").alias("total"))
```

7. Repartition by a different column:
   - If the join key is skewed, consider repartitioning by a more evenly distributed column if the join semantics allow it.

Skew is one of the most common causes of slow Spark jobs. The right fix depends on the operation and the data distribution. Salting, broadcast joins, and AQE skew join are the most common solutions.

**Notebook link:**  
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.3%20Join%20Strategies
