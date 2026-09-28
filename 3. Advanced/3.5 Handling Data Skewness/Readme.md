# 3.5 Handling Data Skewness

Data skewness is the uneven distribution of data across partitions. It occurs when one or a few keys are much more frequent than others. During a shuffle, all records with the same key go to the same partition. If one key has millions of records and others have a few, one reducer will do most of the work while others finish quickly. This creates a long tail of slow tasks, high memory usage, spills, and sometimes out-of-memory errors.

### 3.5.1 What is data skewness in Spark and why is it a problem?

Data skewness is a condition where data is not evenly distributed across partitions. In a distributed system like Spark, this means some tasks process much more data than others. The result is that a few tasks become stragglers while most tasks finish quickly. The job cannot complete until the slowest task finishes, so the overall runtime is determined by the slowest task.

Why it is a problem:

- Long tail: A few tasks take much longer than the rest, delaying the entire stage.
- Memory pressure: A single partition may be too large to fit in memory, causing spills to disk or out-of-memory errors.
- Resource waste: Most executors sit idle while a few work on the skewed partitions.
- Shuffle overhead: Skewed keys produce large shuffle blocks, increasing network and disk I/O.
- Job failures: Severe skew can cause executor OOM, fetch failures, or stage retries.

Symptoms of skew:

- In the Spark UI, a few tasks have much longer durations than others.
- Shuffle read sizes vary widely across tasks.
- Some tasks spill heavily to disk while others do not.
- Executors run out of memory during a shuffle or join.
- The job appears to hang near the end while a few tasks finish.

Example: Suppose you have a DataFrame with a `country` column. If 90% of rows have `country = "US"`, then a `groupBy("country")` will send almost all data to one partition. That partition will be huge, while other partitions are tiny.

### 3.5.2 What are the common causes of data skewness?

Data skewness typically arises from the nature of the data or the operations applied to it.

Common causes:

- Hot keys in joins: Joining on a column where one key is very frequent. For example, joining a large fact table with a dimension table on `customer_id` where one customer has millions of orders.
- Null values: Many rows with null in the join or group key. All nulls go to the same partition.
- Default or placeholder values: Values like `-1`, `0`, `"unknown"`, or `"N/A"` used to represent missing data can become hot keys.
- Grouping by a low-cardinality column: Grouping by a column with only a few distinct values, such as `status` or `country`, creates a few large partitions.
- Partitioning by a high-cardinality column that still has hot values: Even if a column has many distinct values, a few may be much more frequent.
- Repartitioning on a skewed column: Calling `repartition("customer_id")` will shuffle data by that key, and if the key is skewed, the resulting partitions will be skewed.
- Data sources with inherent skew: Some datasets naturally have skewed distributions, such as power-law distributions in web logs or sales data.

### 3.5.3 How do you detect data skewness?

Detection is the first step to fixing skew. You can detect skew using the Spark UI, logs, and by analyzing key distributions.

Using the Spark UI:

- Stages tab: Look at the task duration distribution. If a few tasks take much longer than the median, you have skew.
- Shuffle read size: In the task table, sort by "Shuffle Read Size". If a few tasks read much more data than others, that indicates skew.
- Spill metrics: Check "Spill (Memory)" and "Spill (Disk)". Skewed tasks often spill heavily.
- Executor memory: Look for executors that are running out of memory or GC heavily.

Analyzing key distribution:

You can run a query to count the frequency of each key. If one or a few keys dominate, you have skew.

```python
from pyspark.sql.functions import col, count

# Count frequency of each key
key_counts = df.groupBy("join_key").agg(count("*").alias("cnt"))
key_counts.orderBy(col("cnt").desc()).show(10)
```

You can also compute the percentage of total rows for the top keys.

```python
total = df.count()
top_keys = key_counts.orderBy(col("cnt").desc()).limit(5).collect()
for row in top_keys:
    print(f"Key {row['join_key']}: {row['cnt']} rows ({row['cnt']/total*100:.2f}%)")
```

Checking partition sizes:

You can inspect the number of rows per partition using `spark_partition_id()`.

```python
from pyspark.sql.functions import spark_partition_id, count

df.withColumn("partition_id", spark_partition_id()) \
  .groupBy("partition_id") \
  .agg(count("*").alias("row_count")) \
  .orderBy("row_count", ascending=False) \
  .show()
```

If a few partitions have much larger row counts, the data is skewed.

### 3.5.4 What is salting and how does it work?

Salting is a technique to distribute a hot key across multiple partitions by adding a random suffix (salt) to the key. This breaks the hot key into many smaller keys, each going to a different partition. When joining, the other side must be replicated for each salt value so that matching rows can still be found.

How salting works for a join:

1. Choose a salt range, e.g., 0 to 9 (10 salts).
2. On the large table, add a new column `salt` with a random integer in the salt range. Then create a `salted_key` by concatenating the original key with the salt.
3. On the small table, replicate each row for every salt value. Create the same `salted_key` by concatenating the original key with each salt value.
4. Join the two tables on `salted_key`.
5. After the join, drop the salt column and any duplicates.

Example in PySpark:

```python
from pyspark.sql.functions import rand, floor, concat, lit, explode, array, col

salt_range = 10

# Large table: add salt
large_salted = large_df.withColumn(
    "salt", floor(rand() * salt_range)
).withColumn(
    "salted_key", concat(col("join_key"), lit("_"), col("salt"))
)

# Small table: replicate for each salt
small_replicated = small_df.withColumn(
    "salt", explode(array([lit(i) for i in range(salt_range)]))
).withColumn(
    "salted_key", concat(col("join_key"), lit("_"), col("salt"))
)

# Join on salted key
joined = large_salted.join(small_replicated, "salted_key")

# Clean up: drop salt and salted_key, and handle duplicates if necessary
result = joined.drop("salt", "salted_key")
```

For aggregations, salting works differently. You salt the key, perform a partial aggregation, then remove the salt and perform a final aggregation.

```python
from pyspark.sql.functions import rand, floor, sum

# Add salt
salted = df.withColumn("salt", floor(rand() * 10))

# Partial aggregation
partial = salted.groupBy("key", "salt").agg(sum("value").alias("partial_sum"))

# Final aggregation
final = partial.groupBy("key").agg(sum("partial_sum").alias("total"))
```

Salting increases the number of shuffle partitions and adds some overhead, but it can dramatically reduce the long tail caused by hot keys. The salt range should be chosen based on the severity of the skew and the available cluster resources.

### 3.5.5 How does Adaptive Query Execution (AQE) handle data skew?

Adaptive Query Execution (AQE) is a Spark 3.x feature that re-optimizes the query plan at runtime based on statistics gathered from completed stages. It can automatically handle data skew in joins and aggregations.

AQE skew join:

- AQE detects skewed partitions where one partition is much larger than the median.
- It splits the skewed partition into smaller sub-partitions.
- It replicates the matching side for the skewed keys so that each sub-partition can be joined independently.
- This reduces the long tail caused by hot keys.

Configuration:

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
```

- `skewedPartitionFactor`: A partition is considered skewed if its size is larger than this factor times the median partition size. Default is 5.
- `skewedPartitionThresholdInBytes`: A partition must also be larger than this threshold to be considered skewed. Default is 256 MB.

How it works:

- AQE collects statistics after the shuffle write phase.
- It identifies partitions that are both large in absolute size and much larger than the median.
- It splits those partitions into smaller chunks.
- It replicates the other side of the join for the keys in the skewed partition.
- The join is then performed on the smaller chunks, distributing the work more evenly.

AQE also coalesces shuffle partitions and can convert join strategies at runtime, which helps with skew indirectly by reducing the number of small partitions and adapting to actual data sizes.

### 3.5.6 What other techniques can you use to handle data skew?

Besides salting and AQE, several other techniques can mitigate data skew.

1. Broadcast the small side of a join:
   If one side of the join is small, broadcast it to avoid shuffling the large side. This eliminates the shuffle skew for the large side.

   ```python
   from pyspark.sql.functions import broadcast
   result = large_df.join(broadcast(small_df), "join_key")
   ```

2. Isolate skewed keys:
   Process the hot keys separately with a broadcast join or a dedicated job. Process the rest of the data with a normal join. Union the results.

   ```python
   hot_keys = ["US", "NULL"]
   skewed = large_df.filter(col("key").isin(hot_keys))
   normal = large_df.filter(~col("key").isin(hot_keys))
   # Process skewed with broadcast, normal with regular join, then union
   ```

3. Increase shuffle partitions:
   Increasing `spark.sql.shuffle.partitions` can spread the hot key across more partitions if the key is not extremely hot. However, this does not solve skew if the key is truly dominant.

   ```python
   spark.conf.set("spark.sql.shuffle.partitions", "1000")
   ```

4. Use bucketing:
   Bucketing by the join key with a sufficient number of buckets can distribute data more evenly. If both sides are bucketed, the join can be shuffle-free.

   ```python
   df.write.bucketBy(100, "join_key").sortBy("join_key").saveAsTable("bucketed_table")
   ```

5. Two-phase aggregation:
   For aggregations, perform a partial aggregation with a salted key, then a final aggregation without the salt. This is similar to salting for joins.

   ```python
   partial = df.withColumn("salt", floor(rand() * 10)) \
               .groupBy("key", "salt").agg(sum("value").alias("partial_sum"))
   final = partial.groupBy("key").agg(sum("partial_sum").alias("total"))
   ```

6. Repartition by a different column:
   If the join key is skewed, consider repartitioning by a more evenly distributed column if the join semantics allow it. This is rarely possible but can help in some cases.

7. Use custom partitioners:
   For RDDs, you can implement a custom partitioner that distributes keys more evenly. This is advanced and rarely needed.

8. Filter nulls and default values:
   If nulls or default values are causing skew, filter them out before the join or aggregation, or handle them separately.

   ```python
   df_filtered = df.filter(col("key").isNotNull())
   ```

9. Use `repartition` with a range partitioner:
   Range partitioning can sometimes distribute skewed keys better than hash partitioning, but it requires sorted data and is not always applicable.

10. Monitor and tune memory:
    Increase executor memory, tune `spark.memory.fraction` and `spark.memory.storageFraction`, and enable off-heap memory to handle large partitions without spilling or OOM.

The best technique depends on the specific operation and the nature of the skew. Often, a combination of AQE, salting, and broadcast joins is most effective.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.5%20Handling%20Data%20Skewness
