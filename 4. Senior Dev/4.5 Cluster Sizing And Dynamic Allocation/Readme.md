### 4.5 Cluster Sizing And Dynamic Allocation

Cluster sizing and dynamic allocation determine how Spark distributes compute resources across a job. **Cluster sizing** is the deliberate choice of executor count, cores per executor, and memory per executor based on data volume, workload type, and SLA. **Dynamic allocation** is the runtime mechanism that adjusts the number of executors up or down as the workload changes, releasing idle executors and requesting new ones when tasks are backlogged. Together, they control cost, throughput, latency, and stability. Misconfigured sizing leads to out-of-memory errors, excessive garbage collection, idle resources, or long-running stages. In interviews, this topic tests whether you can reason from data characteristics to concrete configuration values and explain the operational trade-offs.

#### Executor Sizing Fundamentals

A Spark cluster consists of a **driver** that orchestrates the job and **executors** that perform the actual data processing. The driver typically needs 1–2 cores and 2–4 GB of memory. Executors do the heavy lifting, and their configuration is the primary sizing decision.

The optimal executor size balances three competing forces:

- **Too few executors or too few cores**: Low parallelism, underutilized cluster, long stage durations.
- **Too many cores per executor**: Excessive GC pressure, context switching, and HDFS I/O bottleneck. The widely cited sweet spot is **5 cores per executor**; beyond that, per-core throughput often degrades.
- **Too much memory per executor**: GC overhead grows. Keeping the heap below **32 GB** helps maintain GC overhead below 10%. Very large heaps also increase the cost of full GC pauses.

A practical starting point is **30 GB per executor**, distributing the available machine cores. For example, a node with 16 cores and 64 GB RAM might run three executors with 5 cores and approximately 20 GB each, leaving 1 core and memory for the OS and NodeManager. For larger clusters (more than 100 executors), increasing cores per executor reduces the number of open connections and communication overhead.

| Cluster Size | Executor Memory | Executor Cores | Instances |
|---|---|---|---|
| Small (dev) | 4–8 GB | 2–4 | 2–5 |
| Medium | 8–16 GB | 4–5 | 10–50 |
| Large | 16–32 GB | 5–8 | 50–200 |
| Very Large | 32–64 GB | 8–16 | 200+ |

#### Memory Overhead and Calculation

Spark executor memory is split into **JVM heap memory** (`spark.executor.memory`) and **off-heap memory overhead** (`spark.executor.memoryOverhead`). The overhead covers JVM overheads, interned strings, direct byte buffers, native libraries, and, for PySpark, the Python worker process.

The overhead is calculated as:

```
overhead_memory = Max(384 MB, spark.executor.memory * spark.executor.memoryOverheadFactor)
```

`spark.executor.memoryOverheadFactor` defaults to **0.1**, except for Kubernetes non-JVM jobs, where it defaults to **0.4**. Spark 3.x also allows overriding the 384 MB minimum via `spark.executor.minMemoryOverhead`. If the total memory requested from the cluster manager (heap + overhead) exceeds the container limit, the executor is killed by YARN or Kubernetes, often with a "Container killed by YARN for exceeding memory limits" message.

```python
from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("ExecutorSizingDemo")
    .config("spark.executor.memory", "16g")
    .config("spark.executor.memoryOverhead", "4g")   # Explicit overhead; overrides the 0.1 factor
    .config("spark.executor.cores", "5")
    .config("spark.executor.instances", "10")
    .getOrCreate()
)
```

The SQL equivalent is not applicable; these are Spark runtime configuration parameters, not SQL statements. They are set at session creation or via `spark-submit`.

#### Dynamic Allocation: How It Works

**Dynamic allocation** allows Spark to scale the number of executors based on the workload. When enabled and tasks are pending, the driver requests executors. When executors are idle beyond a timeout, they are released back to the cluster manager.

The request policy works in batches. When pending tasks exceed `spark.dynamicAllocation.schedulerBacklogTimeout` (default **1 second**), the driver requests executors. If the backlog persists, it requests additional batches every `spark.dynamicAllocation.sustainedSchedulerBacklogTimeout` (default **1 second**). Each batch grows exponentially: 1, 2, 4, 8, and so on. The removal policy releases an executor when it has been idle longer than `spark.dynamicAllocation.executorIdleTimeout` (default **60 seconds**).

| Behavior | Trigger | Default |
|---|---|---|
| Request initial batch | Backlog > schedulerBacklogTimeout | 1s |
| Request subsequent batches | Backlog persists > sustainedSchedulerBacklogTimeout | 1s |
| Release idle executor | Idle > executorIdleTimeout | 60s |
| Lower bound | minExecutors | 0 |
| Upper bound | maxExecutors | Integer.MAX_VALUE (infinity) |

#### Configuration Parameters

| Parameter | Default | Description |
|---|---|---|
| `spark.dynamicAllocation.enabled` | `false` (open source); `true` on some platforms | Enables dynamic executor scaling. |
| `spark.dynamicAllocation.minExecutors` | `0` | Lower bound for executor count. |
| `spark.dynamicAllocation.maxExecutors` | `Integer.MAX_VALUE` | Upper bound for executor count. Set a finite value to prevent unbounded scaling. |
| `spark.dynamicAllocation.initialExecutors` | `1` (or `spark.executor.instances` if higher) | Initial executor count at startup. |
| `spark.dynamicAllocation.executorIdleTimeout` | `60s` | Idle time before an executor is released. |
| `spark.dynamicAllocation.cachedExecutorIdleTimeout` | `infinity` | Idle timeout for executors holding cached data. |
| `spark.dynamicAllocation.schedulerBacklogTimeout` | `1s` | Backlog duration before requesting new executors. |
| `spark.dynamicAllocation.sustainedSchedulerBacklogTimeout` | `1s` | Backlog duration for subsequent executor requests. |
| `spark.dynamicAllocation.executorAllocationRatio` | `1.0` | Fraction of maximum parallelism to target. Lower values reduce resource usage. |
| `spark.shuffle.service.enabled` | `false` | Enables External Shuffle Service (ESS) for shuffle data preservation. |
| `spark.dynamicAllocation.shuffleTracking.enabled` | `true` (Spark 3.4+) | Tracks shuffle data without ESS, keeping executors with active shuffle data alive. |
| `spark.executor.memoryOverheadFactor` | `0.1` (JVM); `0.4` (K8s non-JVM) | Fraction of executor memory allocated as overhead. |
| `spark.executor.minMemoryOverhead` | `384m` | Minimum overhead when the factor yields less. |
| `spark.memory.fraction` | `0.6` | Fraction of heap used for execution and storage. |
| `spark.memory.storageFraction` | `0.5` | Fraction of unified memory reserved for storage (cache). |

#### Shuffle Data Preservation

Dynamic allocation releases executors, but shuffle data written by those executors must remain accessible for downstream stages. Without preservation, releasing an executor loses its shuffle files and causes `FetchFailedException`. Three mechanisms address this.

- **External Shuffle Service (ESS)**: A long-running service on each worker node that serves shuffle files independently of executors. Enabled with `spark.shuffle.service.enabled=true`. This is the classic approach for YARN and standalone mode.
- **Shuffle tracking**: Spark tracks which executors hold shuffle data for active jobs and keeps them alive even if they are otherwise idle. Enabled with `spark.dynamicAllocation.shuffleTracking.enabled=true`. This is the preferred approach for Kubernetes, where ESS is harder to deploy. Since Spark 3.4, shuffle tracking is enabled by default when dynamic allocation is enabled without a shuffle service.
- **Node decommissioning**: On Kubernetes, `spark.decommission.enabled` and `spark.storage.decommission.shuffleBlocks.enabled` allow shuffle blocks to be migrated before a node is removed.

#### Performance Implications and Trade-offs

Dynamic allocation improves cluster utilization by releasing resources when jobs are idle, but it introduces latency. Requesting executors takes time, and releasing them can cause shuffle data migration or recomputation. The trade-off is between resource efficiency and job latency.

| Choice | Benefit | Cost |
|---|---|---|
| Fixed executors | Predictable latency, no allocation delay | Idle resources when workload drops |
| Dynamic allocation | Better cluster utilization, cost savings | Executor request latency, shuffle preservation complexity |
| Large executors (many cores) | Fewer connections, less communication overhead | Higher GC pressure, slower per-core throughput |
| Small executors | Lower GC pressure, better per-core throughput | More connections, more scheduling overhead |
| High `executorAllocationRatio` | Maximum parallelism | More executors than necessary for small workloads |
| Low `executorAllocationRatio` | Lower resource usage | Potential under-parallelization |
| ESS | Proven shuffle preservation | Requires cluster-level service deployment |
| Shuffle tracking | No extra service needed | Executors with shuffle data may not be released promptly |

#### Best Practices and When to Use

- Start with **5 cores and 16 GB per executor** for medium workloads. Adjust based on trial runs and GC metrics from the Spark UI.
- Keep executor heap below **32 GB** to maintain GC overhead under 10%.
- Leave **1 core per node** for the OS and cluster manager, and **1 GB per node** for overhead.
- Enable dynamic allocation for workloads with variable demand, such as interactive analytics or multi-tenant clusters.
- Set a finite `spark.dynamicAllocation.maxExecutors` to prevent a single job from consuming the entire cluster.
- Set `spark.dynamicAllocation.minExecutors` to a value that avoids cold-start latency for critical jobs.
- Use shuffle tracking on Kubernetes; use ESS on YARN and standalone clusters.
- Monitor executor utilization, GC time, shuffle spill, and task duration in the Spark UI before and after sizing changes.
- For streaming workloads, dynamic allocation can cause latency spikes when executors are released. Consider fixed executors or a higher `minExecutors` for strict SLAs.

#### Common Pitfalls and Limitations

- Enabling dynamic allocation without a shuffle preservation mechanism causes `FetchFailedException` when idle executors with shuffle data are released.
- Setting `maxExecutors` to infinity allows a single job to monopolize the cluster in shared environments.
- Very large executors (more than 5–6 cores) often perform worse due to GC and context switching, even though they look more efficient on paper.
- Executor memory overhead is often underestimated. A PySpark job needs more overhead than a Scala job because of the Python worker process.
- `spark.executor.memoryOverhead` is not part of the JVM heap. Setting only `spark.executor.memory` without accounting for overhead causes container kills.
- Dynamic allocation can interfere with streaming workloads if executors holding state are released. Use `spark.dynamicAllocation.cachedExecutorIdleTimeout` or disable dynamic allocation for stateful streams.
- `spark.dynamicAllocation.executorAllocationRatio` below 1.0 reduces resource usage but can increase job latency.
- Changing executor configuration mid-job is not possible. Stop and restart the application.

#### Complete Self-Contained Example

The following example configures a Spark session with explicit executor sizing and dynamic allocation.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count

spark = (
    SparkSession.builder
    .appName("ClusterSizingAndDynamicAllocationDemo")
    .config("spark.executor.memory", "16g")
    .config("spark.executor.memoryOverhead", "4g")
    .config("spark.executor.cores", "5")
    .config("spark.dynamicAllocation.enabled", "true")
    .config("spark.dynamicAllocation.minExecutors", "2")
    .config("spark.dynamicAllocation.maxExecutors", "20")
    .config("spark.dynamicAllocation.initialExecutors", "4")
    .config("spark.dynamicAllocation.executorIdleTimeout", "60s")
    .config("spark.dynamicAllocation.schedulerBacklogTimeout", "1s")
    .config("spark.dynamicAllocation.shuffleTracking.enabled", "true")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

# A simple aggregation to exercise the cluster
df = spark.range(0, 10_000_000).withColumn("group", col("id") % 100)
result = df.groupBy("group").agg(count("*").alias("cnt"))
result.orderBy(col("cnt").desc()).show(5, truncate=False)

spark.stop()
```

#### Summary

Cluster sizing and dynamic allocation are complementary controls over Spark resource usage. Sizing determines the shape of each executor: cores, heap, and overhead. Dynamic allocation determines how many executors run at any moment. The optimal configuration balances parallelism against GC overhead, keeps heap below 32 GB, and accounts for memory overhead beyond the JVM heap. Dynamic allocation requires a shuffle preservation mechanism, either External Shuffle Service or shuffle tracking. In interviews, the strongest answers start from data volume and workload type, propose a concrete starting configuration such as 5 cores and 16 GB per executor, and explain how dynamic allocation and shuffle preservation affect cost and reliability.

Notebook link: {{NOTEBOOK_URL}}
