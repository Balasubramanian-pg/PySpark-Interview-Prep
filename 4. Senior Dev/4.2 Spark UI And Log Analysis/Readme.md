# 4.2 Spark UI And Log Analysis

Spark UI and log analysis are the primary observability skills for diagnosing PySpark job performance, correctness, and failures. The Spark UI exposes jobs, stages, tasks, SQL plans, executor memory, shuffle behavior, and configuration details. Logs explain why tasks fail, why executors are lost, and why the driver or executor ran out of memory. In interviews, this topic tests whether you can move from a symptom such as a slow stage to a concrete cause such as data skew, shuffle spill, excessive GC, or a serialization error.

#### Spark UI Access Points and Tabs

The live Spark UI is served by the driver. By default it binds to port `4040`; if that port is occupied, Spark tries `4041`, `4042`, and so on. Completed applications are available through the **Spark History Server**, typically on port `18080`, provided event logging was enabled. Spark 3.x also exposes a REST API under `/api/v1/applications`, which is useful for automated monitoring.

| UI Tab | Primary Use | Key Signals |
|---|---|---|
| Jobs | Top-level actions such as `count()`, `write()`, `show()` | Duration, active stages, failed stages |
| Stages | DAG and task-level execution | Shuffle read/write, spill, skew, failed tasks |
| Tasks | Per-task metrics within a stage | Duration, GC time, scheduler delay, input size |
| Storage | Cached RDDs and DataFrames | Memory used, disk used, fraction cached |
| Environment | Runtime and Spark configuration | Defaults, overrides, classpath, JVM options |
| Executors | Executor-level resource usage | Memory, disk, GC time, shuffle totals, dead executors |
| SQL / DataFrame | Query plans and operator metrics | Physical plan, AQE changes, rows/bytes per node |
| Structured Streaming | Streaming query progress | Input rate, processing rate, batch duration, watermark |
| Thread Dump | Driver thread state | Blocked threads, deadlocks, long-running calls |

The **Jobs** tab groups work by action. The **Stages** tab is usually the most valuable for performance analysis because stages are separated by shuffle boundaries. The **SQL** tab is critical for DataFrame and Spark SQL workloads because it shows the physical plan and per-operator metrics.

#### Reading Stages and Tasks

A stage contains many tasks. Each task processes one partition. When one task takes much longer than the median, you likely have **data skew**. When tasks show large **shuffle read** or **shuffle write**, the stage is paying for a wide transformation such as `groupBy`, `join`, or `distinct`. When tasks show **spill (memory)** or **spill (disk)**, the executor cannot hold intermediate data in memory and is writing to disk.

| Metric | Meaning | Performance Concern |
|---|---|---|
| Duration | Total task time | Long tails indicate skew or slow nodes |
| Scheduler Delay | Time waiting to be scheduled | Cluster contention or insufficient resources |
| Task Deserialization Time | Time to deserialize task binary | Large closures or excessive broadcast variables |
| Shuffle Read | Bytes/records read from shuffle | Large shuffles, skew, missing partition pruning |
| Shuffle Write | Bytes/records written to shuffle | Expensive wide transformations |
| Memory Spill | Bytes spilled to memory | High memory pressure |
| Disk Spill | Bytes spilled to disk | Severe memory pressure and slow I/O |
| GC Time | JVM garbage collection time | Excessive object churn or oversized executor memory |
| Peak Execution Memory | Maximum memory used by internal operations | Joins, aggregations, sorts |
| Input Size / Records | Data read from source | Poor filtering or partition pruning |

For skew, compare the maximum task duration with the 75th percentile or median. A stage where the max is several times the median usually needs salting, AQE skew join handling, or repartitioning.

#### SQL and DataFrame Tab

In Spark 3.x, the SQL tab shows the physical plan, the executed plan after adaptive query execution, and metrics per node. This is where you verify whether a filter was pushed down, whether a broadcast join occurred, and whether AQE converted a sort-merge join into a broadcast join or split skewed partitions.

SQL equivalents are useful when you want the plan outside the UI:

```sql
EXPLAIN FORMATTED
SELECT key, count(*) AS cnt
FROM skew_table
GROUP BY key;

EXPLAIN COST
SELECT key, count(*) AS cnt
FROM skew_table
GROUP BY key;
```

`EXPLAIN FORMATTED` shows the parsed, analyzed, optimized, and physical plans. `EXPLAIN COST` includes statistics-based cost estimates when table statistics are available.

#### Executors and Environment Tabs

The **Executors** tab shows memory used, disk used, GC time, shuffle read/write, and active/dead status. A dead executor with a nonzero failed task count often indicates an OOM kill, a lost node, or a shuffle fetch failure. The **Environment** tab is useful for confirming which configuration values were actually applied, including defaults and runtime overrides.

#### Log Analysis

Driver logs, executor logs, and container logs are complementary to the UI. The driver log contains scheduler decisions, job failures, and exceptions. Executor logs contain task-level stack traces, shuffle fetch failures, and JVM memory errors. In YARN or Kubernetes, executor logs may be aggregated by the platform and accessed with `yarn logs -applicationId` or `kubectl logs`.

Spark 3.x uses Log4j2. You can set the log level programmatically:

```python
spark.sparkContext.setLogLevel("WARN")
```

In production, use a `log4j2.properties` file to control root and package-specific loggers. Common patterns to recognize:

| Log Pattern | Likely Cause |
|---|---|
| `java.lang.OutOfMemoryError: Java heap space` | Executor or driver heap too small, large broadcast, or skewed partition |
| `Container killed by YARN for exceeding memory limits` | Executor memory overhead exceeded |
| `FetchFailedException` | Shuffle data lost, executor failure, or network issue |
| `Task not serializable` | Closure captures a non-serializable object |
| `GC overhead limit exceeded` | Excessive garbage collection and memory pressure |
| `Lost executor` | Node failure, preemption, or OOM kill |
| `Job aborted due to stage failure` | Repeated task failures in a stage |
| `FileNotFoundException` | Input path changed or missing during job execution |

Relevant configuration parameters:

| Parameter | Default | Description |
|---|---|---|
| `spark.ui.port` | `4040` | Live UI port on the driver |
| `spark.ui.enabled` | `true` | Enables the live UI |
| `spark.ui.retainedJobs` | `1000` | Number of jobs kept in UI memory |
| `spark.ui.retainedStages` | `1000` | Number of stages kept in UI memory |
| `spark.ui.retainedTasks` | `100000` | Number of tasks kept in UI memory |
| `spark.sql.ui.retainedExecutions` | `1000` | Number of SQL executions kept in UI |
| `spark.eventLog.enabled` | `false` | Enables event logging for History Server |
| `spark.eventLog.dir` | `file:///tmp/spark-events` | Directory for event logs |
| `spark.eventLog.compress` | `false` | Compresses event logs |
| `spark.history.fs.logDirectory` | `file:///tmp/spark-events` | History Server log directory |
| `spark.history.ui.port` | `18080` | History Server UI port |
| `spark.history.fs.update.interval` | `10s` | How often History Server refreshes |
| `spark.history.retainedApplications` | `50` | Number of applications retained in History Server UI |
| `spark.executor.logs.rolling.strategy` | disabled | Enables executor log rolling |
| `spark.executor.logs.rolling.maxSize` | `1024*1024` | Maximum size per rolled log file |
| `spark.sql.ui.explainMode` | `simple` | SQL UI explain mode |

#### Programmatic Monitoring with Python

The Spark status tracker and REST API allow programmatic inspection. This is useful when you want to automate checks for failed stages, long-running tasks, or executor loss.

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("StatusTrackerDemo").master("local[*]").getOrCreate()
sc = spark.sparkContext
sc.setLogLevel("WARN")

rdd = sc.parallelize(range(2_000_000), 50).map(lambda x: (x % 20, x))
result = rdd.reduceByKey(lambda a, b: a + b).count()
print("result count:", result)

tracker = sc.statusTracker()
for job_id in tracker.getJobIdsForGroup(None):
    job = tracker.getJobInfo(job_id)
    if job is None:
        continue
    print(f"Job {job_id}: status={job.status}, activeStages={job.numActiveStages}, completedStages={job.numCompletedStages}")
    for stage_id in job.stageIds:
        stage = tracker.getStageInfo(stage_id)
        if stage is None:
            continue
        print(f"  Stage {stage_id}: status={stage.status}, activeTasks={stage.numActiveTasks}, completedTasks={stage.numCompletedTasks}, failedTasks={stage.numFailedTasks}")

for ex in tracker.getExecutorInfos():
    print(f"Executor {ex.executorId} host={ex.host} cores={ex.totalCores} maxMemory={ex.maxMemory} active={ex.isActive}")

spark.stop()
```

A complete self-contained example that enables event logging for later History Server analysis:

```python
import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, spark_partition_id

event_log_dir = "/tmp/spark-events"
os.makedirs(event_log_dir, exist_ok=True)

spark = (
    SparkSession.builder
    .appName("SparkUIAndLogAnalysisDemo")
    .master("local[*]")
    .config("spark.ui.port", "4040")
    .config("spark.eventLog.enabled", "true")
    .config("spark.eventLog.dir", f"file://{event_log_dir}")
    .config("spark.sql.adaptive.enabled", "true")
    .config("spark.sql.adaptive.skewJoin.enabled", "true")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

df = spark.range(0, 5_000_000).withColumn("partition_id", spark_partition_id())
skewed = df.withColumn("key", col("partition_id").cast("int") % 10)

skewed.groupBy("key").count().orderBy(col("count").desc()).show(5, truncate=False)

# Inspect the live UI at http://localhost:4040 while the application is running.
# Event logs are written under file:///tmp/spark-events for the History Server.
spark.stop()
```

#### Performance Implications and Trade-offs

| Choice | Benefit | Cost |
|---|---|---|
| Live UI vs History Server | Live metrics and thread dumps | Unavailable after driver exits unless event logs are enabled |
| Event logging enabled | Post-mortem analysis, History Server, REST API | Storage growth and slight runtime overhead |
| `WARN` vs `DEBUG` logging | Lower I/O and less noise | Less detail for deep debugging |
| High retained UI objects | More history in the UI | More driver memory consumption |
| Executor log rolling | Prevents unbounded log files | Requires configuration and disk management |
| AQE enabled | Runtime skew handling and join reordering | Plan variability and less predictable behavior |

#### Best Practices

- Enable `spark.eventLog.enabled=true` and configure a History Server in every non-trivial environment.
- Use the Spark UI REST API to automate checks for failed stages, long-running jobs, and dead executors.
- Set the production log level to `WARN` and use targeted loggers for specific packages when debugging.
- Configure executor log rolling and platform log aggregation, especially in YARN and Kubernetes.
- Always inspect shuffle read/write, spill, and GC time before changing executor memory or partition counts.
- Compare maximum task duration with median task duration to detect skew quickly.
- Use the SQL tab and `EXPLAIN FORMATTED` to confirm join strategies, filter pushdown, and AQE behavior.
- Correlate stage IDs and job IDs in the UI with the corresponding code paths in the application.

#### Common Pitfalls and Limitations

- The live UI disappears when the driver exits unless event logging and History Server are configured.
- Port `4040` may already be in use; Spark increments the port, so the expected URL may be wrong.
- Event log directories can grow without retention policies and cause storage issues.
- History Server updates are not instantaneous; the default update interval is `10s`.
- `DEBUG` logging in production can generate excessive I/O and obscure real errors.
- Scheduler delay is not execution time; a long scheduler delay points to resource contention rather than slow code.
- Executor logs in ephemeral containers may be lost if log aggregation is not enabled.
- UI retained object limits can hide older jobs or stages; increasing them consumes driver memory.

#### Summary

Spark UI and log analysis connect runtime symptoms to root causes. The UI reveals stage-level shuffle, spill, skew, and GC behavior, while driver and executor logs explain failures such as OOM kills, serialization errors, and fetch failures. In Spark 3.x, enable event logging and History Server for post-mortem analysis, use the SQL tab and `EXPLAIN` for query plans, and rely on REST APIs or the status tracker for automation. Effective diagnosis depends on reading task distributions, not just averages, and on correlating UI metrics with concrete configuration and code changes.

Notebook link: {{NOTEBOOK_URL}}
