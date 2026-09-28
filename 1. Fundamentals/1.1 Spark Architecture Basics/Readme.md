# 1.1 Spark Architecture Basics

# 1. Fundamentals/1.1 Spark Architecture Basics

Apache Spark is a distributed computing engine designed for fast, general-purpose data processing. Its architecture is built around a driver program, a cluster manager, and a set of executors running on worker nodes. Understanding these components and how they interact is essential for writing efficient Spark applications, debugging failures, and tuning performance.

This section covers the core architecture concepts, the roles of the driver and executors, the cluster managers, the execution model, and common interview questions.

### 1.1.1 What is Apache Spark and what are its main components?

Apache Spark is an open-source distributed processing system used for big data workloads. It provides in-memory computation, fault tolerance, and a unified API for batch, streaming, SQL, machine learning, and graph processing.

The main components of a Spark application are:

- Driver: The process that runs the main() method of the application. It creates the SparkSession, converts user code into a DAG, schedules tasks, and coordinates execution.
- Executors: JVM processes running on worker nodes. They execute tasks, store cached data, and report status to the driver.
- Cluster Manager: Allocates resources (CPU, memory) to the application. Examples include Standalone, YARN, Kubernetes, and Mesos (deprecated).
- Worker Nodes: Machines in the cluster that run executors.
- SparkContext / SparkSession: The entry point to Spark functionality. SparkContext is the older entry point; SparkSession is the unified entry point since Spark 2.0.
- RDD / DataFrame / Dataset: The distributed data abstractions.
- DAG Scheduler: Splits the logical DAG into stages.
- Task Scheduler: Launches tasks on executors.
- Shuffle Manager: Handles data redistribution between stages.

A Spark application consists of one driver and many executors. The driver runs the user's main function and coordinates the work. Executors run tasks and hold data.

### 1.1.2 What is the role of the Driver in Spark?

The driver is the central coordinator of a Spark application. It runs the main() method and performs the following responsibilities:

- Creates the SparkSession and SparkContext.
- Converts user code (transformations and actions) into a logical DAG.
- Optimizes the logical plan using Catalyst (for DataFrames/SQL).
- Divides the DAG into stages using the DAG Scheduler.
- Submits tasks to executors via the Task Scheduler.
- Tracks the status of tasks, stages, and jobs.
- Collects results from executors.
- Manages metadata such as broadcast variables, accumulators, and cached data locations.
- Handles failures and retries tasks or stages as needed.

The driver runs on the submitting machine in client mode, or on a worker node in cluster mode. It requires sufficient memory to hold the query plan, task metadata, and results. A driver out-of-memory error can crash the entire application.

### 1.1.3 What is an Executor and what does it do?

An executor is a JVM process launched on a worker node. Each executor is allocated a certain number of CPU cores and memory. Executors perform the following:

- Execute tasks assigned by the driver.
- Store cached data for RDDs, DataFrames, and Datasets.
- Report task status and metrics to the driver.
- Serve shuffle data to other executors.
- Run multiple tasks concurrently, up to the number of cores allocated.

Executors are launched at the start of the application and typically remain running for the duration of the application, unless dynamic allocation is enabled. If an executor fails, its tasks are rescheduled on other executors, and its cached data is recomputed if needed.

Key configuration:
- `spark.executor.memory`: Memory per executor.
- `spark.executor.cores`: Cores per executor.
- `spark.executor.instances`: Number of executors.

### 1.1.4 What is a Cluster Manager and what options does Spark support?

A cluster manager is responsible for allocating resources to Spark applications. Spark supports several cluster managers:

- Standalone: A simple cluster manager included with Spark. Easy to set up but limited in enterprise features.
- YARN: The Hadoop resource manager. Commonly used in Hadoop ecosystems. Supports dynamic allocation, queues, and multi-tenancy.
- Kubernetes: Runs Spark on Kubernetes clusters. Popular for cloud-native deployments.
- Mesos: Deprecated in Spark 3.0 and removed in later versions.

The cluster manager starts executors on worker nodes and provides the driver with the resources it needs. The driver communicates with the cluster manager to request executors and release them when done.

### 1.1.5 What are SparkContext and SparkSession?

SparkContext is the original entry point to Spark functionality. It represents a connection to a Spark cluster and is used to create RDDs, broadcast variables, and accumulators. There can be only one SparkContext per JVM.

SparkSession is the unified entry point introduced in Spark 2.0. It wraps SparkContext and provides access to DataFrame, Dataset, and SQL APIs. You can create a SparkSession using the builder pattern.

Example:

```python
from pyspark.sql import SparkSession

spark = (SparkSession.builder
         .appName("MyApp")
         .config("spark.executor.memory", "4g")
         .getOrCreate())

sc = spark.sparkContext
```

In Spark 2.0 and later, use SparkSession instead of SparkContext for most tasks. SparkContext is still accessible via `spark.sparkContext` when needed.

### 1.1.6 What is a DAG, Job, Stage, and Task?

These terms describe the execution hierarchy in Spark:

- DAG (Directed Acyclic Graph): A graph of transformations applied to the data. Each node is an RDD or DataFrame, and edges represent dependencies. The DAG is built lazily as transformations are called.
- Job: A job is triggered by an action such as `count()`, `collect()`, `show()`, or `write()`. Each action creates one or more jobs.
- Stage: A job is divided into stages based on shuffle boundaries. A stage is a set of tasks that can be executed together without a shuffle. Narrow transformations are pipelined within a stage. Wide transformations create a new stage.
- Task: The smallest unit of work. A task processes one partition of data. The number of tasks in a stage equals the number of partitions in that stage.

Example: A job with a `groupBy` followed by `count` creates two stages: one for the partial aggregation before the shuffle, and one for the final aggregation after the shuffle.

### 1.1.7 How does Spark execute a job from start to finish?

The execution flow of a Spark job is as follows:

1. User code creates a SparkSession and defines transformations on RDDs, DataFrames, or Datasets.
2. Transformations are lazy. They build a logical DAG but do not execute.
3. An action is called. This triggers job execution.
4. The driver converts the logical plan into an optimized physical plan using Catalyst.
5. The DAG Scheduler divides the plan into stages based on shuffle dependencies.
6. Each stage is divided into tasks, one per partition.
7. The Task Scheduler launches tasks on executors.
8. Executors run tasks, process data, and return results or write output.
9. The driver tracks progress and handles failures by retrying tasks or stages.
10. The action completes and returns the result to the user.

During execution, shuffle data is written by map tasks and read by reduce tasks. Cached data is stored in executor memory or disk.

### 1.1.8 What is lazy evaluation and why does Spark use it?

Lazy evaluation means that transformations are not executed immediately. Instead, Spark records them in a DAG and waits until an action is called. This allows Spark to:

- Optimize the entire chain of transformations before executing.
- Combine narrow transformations into a single stage.
- Avoid unnecessary computation.
- Prune unused columns and push down filters.
- Choose the best join strategy and partitioning.

Example:

```python
df = spark.range(1000000)
filtered = df.filter("id > 100")      # lazy
selected = filtered.select("id")      # lazy
count = selected.count()              # action, triggers execution
```

Without lazy evaluation, Spark would execute each transformation immediately, which would be inefficient and prevent global optimization.

### 1.1.9 What is the difference between client and cluster deploy modes?

Spark supports two deploy modes:

- Client mode: The driver runs on the machine that submitted the application. This is common for interactive use, notebooks, and development. The driver is outside the cluster, so network latency between driver and executors may be higher.
- Cluster mode: The driver runs on a worker node inside the cluster. This is common for production jobs submitted via spark-submit. The driver is managed by the cluster manager, and the submitting machine can disconnect after submission.

In client mode, if the submitting machine fails, the application fails. In cluster mode, the driver is supervised by the cluster manager and can be restarted if it fails (depending on the cluster manager).

### 1.1.10 What is fault tolerance and lineage in Spark?

Spark achieves fault tolerance through lineage. Each RDD or DataFrame remembers the sequence of transformations that created it. If a partition is lost due to an executor failure, Spark can recompute it from the original data using the lineage graph.

- Narrow dependencies: A lost partition can be recomputed from a single parent partition.
- Wide dependencies: A lost partition may require recomputing multiple parent partitions, which is more expensive.

For DataFrames, Catalyst and Tungsten provide additional optimizations and fault tolerance is handled similarly through the logical plan.

Checkpointing can be used to truncate the lineage and store data reliably, which speeds up recovery for long lineages.

### 1.1.11 How does Spark manage memory?

Spark uses a unified memory management model. Executor memory is divided into several regions:

- Reserved memory: Fixed overhead for the JVM.
- User memory: Used for user data structures and internal metadata.
- Spark memory: Divided into execution memory and storage memory.
  - Execution memory: Used for shuffles, joins, sorts, and aggregations.
  - Storage memory: Used for caching RDDs, DataFrames, and broadcast variables.

The boundary between execution and storage is dynamic. If execution needs more memory, it can evict cached data. If storage needs more, it can borrow from execution if execution is not using it.

Key configurations:
- `spark.memory.fraction`: Fraction of heap used for Spark memory (default 0.6).
- `spark.memory.storageFraction`: Fraction of Spark memory reserved for storage (default 0.5).

Off-heap memory can be enabled with `spark.memory.offHeap.enabled` and `spark.memory.offHeap.size`.

### 1.1.12 What is speculative execution and dynamic allocation?

Speculative execution: If a task is running slower than other tasks in the same stage, Spark may launch a duplicate copy of the task on another executor. Whichever copy finishes first is used, and the other is killed. This helps mitigate stragglers caused by slow nodes or disk issues.

Configuration:
- `spark.speculation`: Enable or disable (default false).
- `spark.speculation.interval`: How often to check for speculative tasks.
- `spark.speculation.multiplier`: How much slower a task must be to be considered speculative.

Dynamic allocation: Spark can dynamically add or remove executors based on workload. When tasks are pending, it requests more executors. When executors are idle, it releases them. This is useful in shared clusters.

Configuration:
- `spark.dynamicAllocation.enabled`: Enable dynamic allocation.
- `spark.dynamicAllocation.minExecutors`: Minimum number of executors.
- `spark.dynamicAllocation.maxExecutors`: Maximum number of executors.
- `spark.dynamicAllocation.initialExecutors`: Initial number of executors.
- `spark.dynamicAllocation.executorIdleTimeout`: How long an idle executor is kept before being released.

Dynamic allocation requires an external shuffle service to preserve shuffle data when executors are removed.

### Summary

Spark architecture is centered on the driver, executors, and cluster manager. The driver coordinates execution, builds the DAG, and schedules tasks. Executors run tasks and store data. The cluster manager allocates resources. Jobs are divided into stages and tasks based on shuffle boundaries. Lazy evaluation allows Spark to optimize the entire plan before execution. Fault tolerance is achieved through lineage and recomputation. Memory is managed dynamically between execution and storage. Speculative execution and dynamic allocation help handle stragglers and scale resources efficiently.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.1%20Spark%20Architecture%20Basics
