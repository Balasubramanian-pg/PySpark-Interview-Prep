# 3.7 Adaptive Query Execution (AQE)

Adaptive Query Execution (AQE) is an additional optimization layer introduced in Spark 3.0 that re-optimizes query plans at runtime based on statistics collected during query execution. It is enabled by default in Spark 3.2.0 and later. AQE addresses a fundamental limitation of static optimization: the cost-based optimizer (CBO) relies on pre-collected table statistics that may be stale, missing, or inaccurate, especially in dynamic data environments. AQE uses actual runtime metrics to pick the most efficient execution plan, making query optimization less dependent on static statistics.

### 3.7.1 How AQE Works

AQE operates by breaking the query plan into **query stages** separated by shuffle boundaries. After each shuffle stage completes, AQE materializes the intermediate results and collects runtime statistics such as partition sizes, row counts, and data distribution. It then re-optimizes the remaining plan based on these actual measurements before executing the next stage. This process repeats for each shuffle boundary in the query.

The key idea is to collect statistics during query execution from task metrics of completed query plan fragments, and subsequently re-optimize unfinished execution plan fragments into better ones based on these runtime statistics. AQE re-engages the Catalyst optimizer during shuffle phases to adjust join strategies and partition layouts.

### 3.7.2 Core Features of AQE

AQE provides three primary features: coalescing post-shuffle partitions, converting sort-merge joins to broadcast joins, and optimizing skew joins.

**Coalescing Post-Shuffle Partitions**

After a shuffle, Spark may produce many small partitions, especially when `spark.sql.shuffle.partitions` is set too high. AQE inspects the actual size of each shuffle partition and merges adjacent small partitions into larger ones, targeting a configurable partition size. This reduces the number of reduce tasks, lowers scheduling overhead, and avoids the small-file problem.

Key configurations:
```
spark.sql.adaptive.coalescePartitions.enabled=true
spark.sql.adaptive.advisoryPartitionSizeInBytes=64m
spark.sql.adaptive.coalescePartitions.minPartitionNum=16
```

The `advisoryPartitionSizeInBytes` parameter (default 64 MiB) is the target partition size for merging. Increase it when writing many small files; decrease it when parallelism is insufficient. The `minPartitionNum` parameter sets a lower bound to prevent over-merging in large jobs. This feature only applies to shuffle output stages; small files during the write stage must be addressed separately through write-side merging or dynamic partition pruning.

**Converting Sort-Merge Join to Broadcast Hash Join**

The static optimizer decides join strategies based on estimated table sizes. When statistics are missing or inaccurate, it may choose a Sort-Merge Join (SMJ) for a table that is actually small enough to broadcast, resulting in an unnecessary full shuffle. AQE uses runtime statistics to detect when one side of a join is small enough and dynamically converts the SMJ to a Broadcast Hash Join (BHJ).

Key configurations:
```
spark.sql.adaptive.localShuffleReader.enabled=true
spark.sql.adaptive.autoBroadcastJoinThreshold=10m
spark.sql.adaptive.nonEmptyPartitionRatioForBroadcastJoin=0.2
```

The `autoBroadcastJoinThreshold` (default 10 MiB) is the AQE-side threshold for determining whether a table is small enough to broadcast. The `localShuffleReader.enabled` parameter allows AQE to read only the necessary partitions before the join, reducing shuffle reads. This capability eliminates the need for manual `/*+ BROADCAST(t) */` hints.

**Optimizing Skew Joins**

Data skew occurs when one or a few join keys are much more frequent than others, causing a few reduce tasks to process far more data than the rest. AQE detects skewed partitions at runtime and splits them into smaller sub-partitions, replicating the matching side as needed. This distributes the hot key across multiple tasks and eliminates the long tail.

Key configurations:
```
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB
```

A partition is considered skewed when it exceeds both of the following:
- `skewedPartitionFactor` multiplied by the median partition size (default factor is 5)
- `skewedPartitionThresholdInBytes` (default 256 MB)

Both conditions must be met for AQE to split the partition. This prevents AQE from splitting partitions that are relatively large but not absolutely large enough to cause performance problems.

### 3.7.3 Configuration Parameters

| Parameter | Default | Description |
|---|---|---|
| `spark.sql.adaptive.enabled` | true (3.2+) | Master switch for AQE |
| `spark.sql.adaptive.coalescePartitions.enabled` | true | Enable partition coalescing |
| `spark.sql.adaptive.advisoryPartitionSizeInBytes` | 64m | Target size for coalesced partitions |
| `spark.sql.adaptive.coalescePartitions.minPartitionNum` | (none) | Minimum number of partitions after coalescing |
| `spark.sql.adaptive.autoBroadcastJoinThreshold` | same as `spark.sql.autoBroadcastJoinThreshold` (10m) | AQE-side broadcast threshold |
| `spark.sql.adaptive.localShuffleReader.enabled` | true | Enable local shuffle reader |
| `spark.sql.adaptive.skewJoin.enabled` | true | Enable skew join handling |
| `spark.sql.adaptive.skewJoin.skewedPartitionFactor` | 5 | Multiplier for median partition size |
| `spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes` | 256MB | Absolute size threshold for skew |
| `spark.sql.adaptive.nonEmptyPartitionRatioForBroadcastJoin` | 0.2 | Ratio threshold for broadcast join conversion |
| `spark.sql.adaptive.maxShuffledHashJoinLocalMapThreshold` | 0 | Threshold for SMJ to local Shuffled Hash Join |

### 3.7.4 Interaction with Dynamic Partition Pruning (DPP)

A critical operational detail: when AQE and Dynamic Partition Pruning (DPP) are enabled simultaneously, DPP takes precedence over AQE during SparkSQL task execution, and AQE does not take effect. Since DPP is enabled by default in many clusters, enabling AQE requires disabling DPP to allow AQE to function.

To use AQE effectively:
```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.optimizer.dynamicPartitionPruning.enabled", "false")
```

### 3.7.5 Best Practices

**Enable AQE first, then tune.** For most workloads, enabling AQE alone provides the largest benefit. Parameter micro-tuning should come after establishing a performance baseline. AQE depends on runtime statistics from shuffle stages, so pure map-only jobs (such as simple reads with filters) are not affected.

**Record baseline metrics before and after.** Track shuffle read/write volumes, task counts, runtime, and GC time to measure the impact of AQE and subsequent tuning.

**Tune partition coalescing for file output.** When the job writes many small files, increase `advisoryPartitionSizeInBytes` to produce fewer, larger files. When parallelism is insufficient, decrease it.

**Adjust broadcast thresholds carefully.** The `autoBroadcastJoinThreshold` parameter controls which joins AQE converts to broadcast. Increasing it enables more broadcast joins but risks driver OOM if the broadcast side is too large. The `nonEmptyPartitionRatioForBroadcastJoin` parameter (default 0.2) can be adjusted when the large side has many empty partitions.

**Let AQE handle skew before manual salting.** AQE skew join handling is automatic and requires no code changes. Enable it and verify in the Spark UI whether AQE successfully splits skewed partitions. Only resort to manual salting or hot-key isolation when AQE is insufficient.

**Monitor AQE decisions in the Spark UI.** After execution, check the SQL tab for the physical plan. Look for `AQEShuffleRead` nodes indicating partition coalescing, `BroadcastHashJoin` conversions, and skew partition splitting. The driver logs will show messages like `OptimizeSkewedJoin: number of skewed partitions: left X, right Y` if skew detection is active.

### 3.7.6 Limitations and Caveats

**Full outer joins are not supported for skew handling.** AQE skew join handling only applies to inner joins, left outer joins (with skew on the left side), and right outer joins (with skew on the right side). Full outer joins and outer joins where the skew is on the non-preserved side cannot trigger AQE skew optimization.

**Only two-table joins are supported for skew handling.** AQE skew optimization supports only two-table join scenarios. Multi-way joins with skew may not be fully optimized.

**Large plans can cause OOM on the driver.** When AQE is enabled, Spark triggers plan update events to the internal listener bus whenever the plan changes. These events include plain-text plan descriptions that are computationally expensive to generate for large plans. Events are stored as `SQLExecutionUIData` objects and retained until a threshold is reached, which can cause memory exhaustion and OOM errors with large, complex plans. Workarounds include limiting plan string length with `spark.sql.maxPlanStringLength` or disabling AQE for specific jobs.

**AQE does not fix all skew.** AQE has visibility only into partition-level byte sizes, not key-level frequency. It cannot route hot-key rows to a broadcast join where they could be processed more efficiently. It detects skewed partitions and splits them, but if the hot key dominates an entire partition, the split sub-partitions may still be large.

**AQE may not work with more than 2000 partitions.** There is a known issue where AQE does not act during joins when DataFrames have more than 2000 partitions, due to `CompressedMapStatus` losing per-partition size information.

**ExpandExec can limit partition coalescing.** When a stage contains `ExpandExec` (used for rollup, cube, or grouping sets), the `CoalesceShufflePartitions` rule is not adjusted during the AQE phase, reducing parallelism.

**AQE adds compilation overhead.** Collecting statistics and re-optimizing the plan adds some overhead. For very small jobs, this overhead may not be noticeable, but for extremely short queries, the compilation cost of whole-stage code generation may outweigh the benefits.

### 3.7.7 AQE vs. Manual Tuning

AQE replaces many manual tuning techniques that were necessary in Spark 2.x:

| Manual Technique | AQE Equivalent |
|---|---|
| Manually setting `spark.sql.shuffle.partitions` | AQE coalesces partitions automatically based on actual sizes |
| Writing `/*+ BROADCAST(t) */` hints | AQE converts SMJ to BHJ at runtime |
| Manual salting for skew joins | AQE skew join splits skewed partitions automatically |
| Manually increasing partitions for skew | AQE splits skewed partitions at runtime |
| Manually setting broadcast thresholds | AQE uses runtime statistics to choose broadcast joins |

However, manual tuning remains necessary when AQE is disabled, when the workload is map-only (no shuffles), or when AQE limitations apply (full outer joins, very large plans, >2000 partitions).

### 3.7.8 Code Example

```python
from pyspark.sql import SparkSession

spark = (SparkSession.builder
         .appName("AQEExample")
         .config("spark.sql.adaptive.enabled", "true")
         .config("spark.sql.adaptive.coalescePartitions.enabled", "true")
         .config("spark.sql.adaptive.advisoryPartitionSizeInBytes", "64m")
         .config("spark.sql.adaptive.skewJoin.enabled", "true")
         .config("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
         .config("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
         .config("spark.sql.adaptive.autoBroadcastJoinThreshold", "10m")
         .config("spark.sql.optimizer.dynamicPartitionPruning.enabled", "false")
         .getOrCreate())

# A query that benefits from AQE
df1 = spark.range(10000000).selectExpr("id as key", "id as value")
df2 = spark.range(100).selectExpr("id as key", "id as dim_value")

# AQE may convert this join to a broadcast join at runtime
joined = df1.join(df2, "key")
joined.explain(True)

# Look for AQEShuffleRead and BroadcastHashJoin in the physical plan
```

In the physical plan, you will see `AdaptiveSparkPlan` as the root node. After execution, the plan will show `AQEShuffleRead` for coalesced partitions and `BroadcastHashJoin` if AQE converted the join.

### 3.7.9 Summary

AQE is a runtime optimization layer introduced in Spark 3.0 that re-optimizes query plans based on actual data statistics collected during execution. It provides three core capabilities: coalescing post-shuffle partitions, converting sort-merge joins to broadcast joins, and optimizing skew joins. AQE is enabled by default in Spark 3.2+ and is the first line of defense for performance tuning. It eliminates the need for many manual tuning techniques such as setting shuffle partitions, writing broadcast hints, and salting skewed keys. However, AQE has limitations, including no support for full outer join skew handling, potential driver OOM with large plans, and ineffectiveness when DPP is enabled. For most workloads, enabling AQE and verifying its decisions in the Spark UI is the highest-value tuning action available.

Notebook link:
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.7%20Adaptive%20Query%20Execution%20AQE
