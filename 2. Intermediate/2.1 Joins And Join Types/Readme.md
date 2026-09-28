# 2.1 Joins And Join Types

Joins are the fundamental operation for combining rows from two or more DataFrames based on a related column or expression. In distributed computing, the choice of join type and execution strategy has an outsized impact on performance, often determining whether a job completes in minutes or hours. PySpark supports the full spectrum of SQL join semantics, and Spark 3.x adds adaptive query execution (AQE) and fine-grained join hints to give engineers more control over how joins are physically executed.

### Join Types

The `DataFrame.join()` method accepts a `how` parameter that determines the join semantics. The following table summarizes the available join types.

| Join Type | Aliases | Description |
|-----------|---------|-------------|
| `inner` | (default) | Returns rows with matching keys in both DataFrames. |
| `left` | `leftouter`, `left_outer` | Returns all rows from the left DataFrame; unmatched right-side columns are `NULL`. |
| `right` | `rightouter`, `right_outer` | Returns all rows from the right DataFrame; unmatched left-side columns are `NULL`. |
| `outer` | `full`, `fullouter`, `full_outer` | Returns all rows from both DataFrames; unmatched columns are `NULL`. |
| `left_semi` | `semi`, `leftsemi` | Returns only left-side rows that have a match on the right; right columns are not included. |
| `left_anti` | `anti`, `leftanti` | Returns only left-side rows that have no match on the right. |
| `cross` | | Cartesian product of both DataFrames. |

#### Inner Join

The default join type. Only rows with matching keys in both relations are returned.

```python
# Inner join on a shared column name
inner_df = df1.join(df2, on="id", how="inner")
```

```sql
-- SQL equivalent
SELECT * FROM df1 INNER JOIN df2 ON df1.id = df2.id;
```

#### Left, Right, and Full Outer Joins

These preserve rows from one or both sides, filling missing values with `NULL`.

```python
# Left outer join
left_df = df1.join(df2, on="id", how="left")

# Full outer join
full_df = df1.join(df2, on="id", how="outer")
```

```sql
-- SQL equivalents
SELECT * FROM df1 LEFT OUTER JOIN df2 ON df1.id = df2.id;
SELECT * FROM df1 FULL OUTER JOIN df2 ON df1.id = df2.id;
```

#### Left Semi and Left Anti Joins

Semi and anti joins are filtering operations rather than true column-merging joins. A left semi join returns only the left-side columns for rows that have a match on the right. A left anti join returns only the left-side columns for rows with **no** match on the right. Neither includes right-side columns in the output.

```python
# Left semi join: left rows that have a match
semi_df = df1.join(df2, on="id", how="left_semi")

# Left anti join: left rows that have no match
anti_df = df1.join(df2, on="id", how="left_anti")
```

```sql
-- SQL equivalents
SELECT * FROM df1 LEFT SEMI JOIN df2 ON df1.id = df2.id;
SELECT * FROM df1 LEFT ANTI JOIN df2 ON df1.id = df2.id;
```

Left anti joins are the idiomatic way to implement "NOT IN" or "NOT EXISTS" semantics in a distributed setting, and they are generally more efficient than a left outer join followed by a `NULL` filter.

#### Cross Join

A cross join produces the Cartesian product of both DataFrames. It does not require a join key and should be used with extreme caution on large datasets.

```python
cross_df = df1.join(df2, how="cross")
```

```sql
SELECT * FROM df1 CROSS JOIN df2;
```

### Join Strategies and Performance

Spark's Catalyst optimizer selects a physical join strategy based on table sizes, data distribution, and configuration. The three primary strategies are broadcast hash join, shuffle sort-merge join, and shuffle hash join.

#### Broadcast Hash Join

The smaller DataFrame is broadcast to every executor, and the join is performed locally without a shuffle. This is the cheapest strategy and is automatically applied when one side is below `spark.sql.autoBroadcastJoinThreshold` (default 10 MB).

```python
from pyspark.sql.functions import broadcast

# Explicit broadcast hint
result = large_df.join(broadcast(small_df), on="id", how="inner")
```

```sql
-- SQL broadcast hint
SELECT /*+ BROADCAST(small_table) */ *
FROM large_table
INNER JOIN small_table ON large_table.id = small_table.id;
```

The `BROADCAST` hint overrides the auto-broadcast threshold, allowing you to broadcast tables up to a few hundred megabytes when executor memory permits.

#### Shuffle Sort-Merge Join

The default strategy when both sides are large. Both DataFrames are shuffled by the join key and sorted; then matching rows are merged. This is correct and scalable but expensive due to network I/O and sorting.

```sql
-- Force sort-merge join via hint
SELECT /*+ MERGE(t1) */ *
FROM t1 INNER JOIN t2 ON t1.key = t2.key;
```

#### Shuffle Hash Join

Both sides are shuffled by the join key, but instead of sorting, a hash table is built on the smaller side. This can be faster than sort-merge when the smaller side fits in executor memory.

```sql
-- Force shuffle hash join
SELECT /*+ SHUFFLE_HASH(t1) */ *
FROM t1 INNER JOIN t2 ON t1.key = t2.key;
```

When different join hints are specified on both sides, Spark prioritizes them in this order: `BROADCAST` > `MERGE` > `SHUFFLE_HASH` > `SHUFFLE_REPLICATE_NL`.

#### Join Strategy Summary

| Strategy | When Used | Shuffle | Sort | Best For |
|----------|-----------|---------|------|----------|
| Broadcast Hash | One side < threshold | No | No | Small-to-large joins |
| Sort-Merge | Both sides large | Yes | Yes | Large-to-large equi-joins |
| Shuffle Hash | Both sides medium | Yes | No | Medium joins where one side fits in memory |

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.autoBroadcastJoinThreshold` | `10MB` | Max size of a DataFrame that can be auto-broadcast. Set to `-1` to disable. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Enables adaptive query execution, including runtime conversion of sort-merge joins to broadcast joins. |
| `spark.sql.adaptive.autoBroadcastJoinThreshold` | Same as above | AQE-specific broadcast threshold, applied after runtime statistics are collected. |
| `spark.sql.adaptive.skewJoin.enabled` | `true` | Splits skewed partitions during sort-merge joins. |
| `spark.sql.join.preferSortMergeJoin` | `true` | When `false`, Spark prefers shuffle hash join when applicable. |

### Best Practices

1. **Filter and project before joining.** Reducing row count and column count shrinks the shuffle payload dramatically. Apply `filter()` and `select()` on each DataFrame before the join.
2. **Broadcast the smaller side explicitly** when you know it is small but Spark's statistics are stale. Use `broadcast(df)` or the `/*+ BROADCAST(t) */` hint.
3. **Repartition both DataFrames on the join key** before a large sort-merge join to co-locate matching keys on the same executor and reduce network traffic.
4. **Use left semi and left anti joins** instead of outer-join-plus-filter patterns. They avoid materializing unnecessary right-side columns.
5. **Enable AQE** (`spark.sql.adaptive.enabled=true`) to let Spark dynamically coalesce partitions and convert sort-merge joins to broadcast joins based on runtime statistics.
6. **Use bucketing** for repeated joins on the same key across multiple queries. Bucketing pre-shuffles and pre-sorts the data, eliminating the shuffle at join time.

### Common Pitfalls

- **Duplicate column names.** When both DataFrames have columns with the same name, a join on an expression (rather than a column name string) produces duplicate columns in the output, leading to ambiguous reference errors. Use `alias()` to disambiguate.
- **Non-equi joins.** Broadcast hash and sort-merge joins require equi-join conditions. Non-equi joins (e.g., `df1.a > df2.b`) fall back to a shuffle-and-replicate nested loop join, which is far slower.
- **Data skew.** A single join key with a disproportionate number of rows can cause one task to process orders of magnitude more data than others. Enable `spark.sql.adaptive.skewJoin.enabled` or salt the key.
- **Broadcasting a large table.** Broadcasting a DataFrame that exceeds executor memory causes `OutOfMemoryError`. Monitor the driver and executor memory when overriding the broadcast threshold.
- **Cross joins without a filter.** A cross join on two large DataFrames produces a result set that grows as the product of both row counts. Always apply a filter immediately after a cross join when one side is not truly intended to be a Cartesian product.

### Summary

PySpark joins cover the full range of SQL semantics, from inner and outer joins to semi and anti filtering joins and cross joins. The physical execution strategy — broadcast hash, sort-merge, or shuffle hash — is chosen by Spark's optimizer but can be influenced through hints and configuration. Performance hinges on minimizing shuffle, broadcasting small tables, filtering and projecting early, and handling data skew. Mastering these choices is essential for writing efficient, production-grade PySpark pipelines.

Notebook link: {{NOTEBOOK_URL}}
