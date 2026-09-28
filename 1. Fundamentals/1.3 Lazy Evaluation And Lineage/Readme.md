# 1.3 Lazy Evaluation And Lineage

Lazy evaluation and lineage are two fundamental concepts in Spark that enable efficient execution and fault tolerance. Lazy evaluation means transformations are not executed immediately; instead, Spark builds a directed acyclic graph (DAG) of operations and waits until an action is called. Lineage is the record of transformations that created each RDD or DataFrame, which allows Spark to recompute lost partitions after a failure. Together, they form the backbone of Spark's resilience and performance.

### 1.3.1 What is lazy evaluation in Spark?

Lazy evaluation means that when you apply a transformation to an RDD or DataFrame, Spark does not execute it right away. Instead, it records the transformation in a logical plan or DAG. The actual computation happens only when an action is triggered, such as `count()`, `collect()`, `show()`, or `write()`.

Transformations are lazy. Examples include `map`, `filter`, `flatMap`, `select`, `withColumn`, `join`, `groupBy`, and `repartition`. Actions are eager and trigger execution. Examples include `count`, `collect`, `take`, `show`, `foreach`, `reduce`, and `saveAsTextFile`.

Why Spark uses lazy evaluation:
- It allows Spark to optimize the entire chain of transformations before executing.
- Narrow transformations can be pipelined into a single stage, avoiding intermediate materialization.
- Spark can apply optimizations like predicate pushdown, column pruning, constant folding, and join reordering.
- Unnecessary computations can be skipped if the final result does not require them.
- It reduces the number of passes over the data.

Example:

```python
df = spark.range(1000000)
filtered = df.filter("id > 100")      # lazy
selected = filtered.select("id")      # lazy
count = selected.count()              # action, triggers execution
```

In this example, no computation occurs until `count()` is called. At that point, Spark optimizes the plan and executes it.

### 1.3.2 What is lineage in Spark and why is it important?

Lineage is the sequence of transformations that were used to create an RDD or DataFrame. Each RDD or DataFrame remembers its parent and the transformation applied. This forms a graph of dependencies, called the lineage graph or DAG.

Lineage is important because it enables fault tolerance. If a partition of an RDD is lost due to an executor failure, Spark can use the lineage to recompute that partition from the original data source. This avoids the need to replicate data across nodes, which would be expensive.

Lineage also helps Spark understand dependencies between partitions. Narrow dependencies allow a lost partition to be recomputed from a single parent partition. Wide dependencies require data from multiple parent partitions, which is more expensive to recompute.

Example: Consider an RDD created by `sc.textFile("data.txt").map(...).filter(...)`. The lineage is `textFile -> map -> filter`. If a partition is lost, Spark re-reads the corresponding part of `data.txt` and reapplies the `map` and `filter` transformations.

### 1.3.3 How does Spark use lineage for fault tolerance?

Spark uses lineage for fault tolerance through recomputation. When a partition is lost, Spark looks at the lineage graph to determine how to rebuild it. The process works as follows:

1. An executor fails, and its partitions are lost.
2. The driver detects the failure and marks the affected tasks as failed.
3. The DAG Scheduler identifies the lost partitions and their lineage.
4. Spark reschedules the tasks to recompute the lost partitions on other executors.
5. The recomputation starts from the nearest available checkpoint or from the original data source.
6. The recomputed partitions are used to continue the job.

For narrow dependencies, recomputation only requires the corresponding parent partition. For wide dependencies, recomputation may require multiple parent partitions, which can be expensive. This is why Spark sometimes recommends checkpointing for long lineages with wide dependencies.

Checkpointing truncates the lineage by saving the RDD or DataFrame to reliable storage (e.g., HDFS). After checkpointing, if a partition is lost, Spark can read it from the checkpoint instead of recomputing the entire lineage.

### 1.3.4 What are narrow and wide dependencies and how do they affect lineage?

Dependencies between partitions determine how expensive recomputation is.

Narrow dependency:
- Each partition of the child RDD depends on at most one partition of the parent RDD.
- Examples: `map`, `filter`, `flatMap`, `union`, `coalesce` (without shuffle).
- Recomputation is cheap: only the corresponding parent partition is needed.
- Narrow dependencies allow pipelining within a single stage.

Wide dependency:
- Each partition of the child RDD depends on multiple partitions of the parent RDD.
- Examples: `groupByKey`, `reduceByKey`, `join` (without broadcast), `distinct`, `repartition`, `sortByKey`.
- Recomputation is expensive: multiple parent partitions may be needed.
- Wide dependencies create a shuffle and a stage boundary.

Lineage with narrow dependencies is efficient to recompute. Lineage with wide dependencies requires more work and may involve re-reading shuffle data or recomputing multiple parent partitions.

### 1.3.5 What is the difference between transformations and actions in the context of lazy evaluation?

Transformations are lazy operations that define a new RDD or DataFrame from an existing one. They do not trigger execution. Examples: `map`, `filter`, `select`, `join`, `groupBy`.

Actions are eager operations that trigger execution and return a result to the driver or write data to storage. Examples: `count`, `collect`, `show`, `take`, `reduce`, `foreach`, `saveAsTextFile`, `write`.

The distinction is crucial because lazy evaluation means you can chain many transformations without executing them. Only when an action is called does Spark build the physical plan and execute it. This allows Spark to optimize the entire chain.

Example:

```python
rdd = sc.parallelize([1, 2, 3, 4, 5])
rdd2 = rdd.map(lambda x: x * 2)      # transformation, lazy
rdd3 = rdd2.filter(lambda x: x > 5)  # transformation, lazy
result = rdd3.collect()              # action, triggers execution
```

### 1.3.6 How does lazy evaluation enable optimizations like predicate pushdown and column pruning?

Because transformations are not executed immediately, Spark can analyze the entire chain of operations before running anything. This allows the Catalyst optimizer to apply rules that would be impossible if each transformation executed immediately.

Predicate pushdown: Filters are moved as close to the data source as possible. For example, if you read a Parquet file and then filter on a column, the filter can be pushed down to the file scan so that only matching row groups are read. This reduces I/O.

Column pruning: Only the columns needed for the final result are read from the source. If you select a subset of columns, Spark can skip reading the others.

Constant folding: Constant expressions are evaluated at compile time.

Join reordering: Joins can be reordered to minimize intermediate result sizes.

Without lazy evaluation, Spark would have to execute each transformation in order, and these optimizations would not be possible because the data would already be materialized.

Example:

```python
df = spark.read.parquet("/data/events")
filtered = df.filter("date >= '2024-01-01'").select("user_id", "amount")
result = filtered.groupBy("user_id").sum("amount")
result.explain(True)
```

The optimized logical plan will show the filter pushed down to the `FileScan` node and only `user_id` and `amount` columns being read.

### 1.3.7 What is checkpointing and how does it relate to lineage?

Checkpointing is the process of saving an RDD or DataFrame to reliable storage (such as HDFS or S3) and truncating its lineage. After checkpointing, the RDD or DataFrame no longer depends on its parent transformations. If a partition is lost, Spark reads it from the checkpoint instead of recomputing the entire lineage.

Checkpointing is useful when:
- The lineage is very long, and recomputation would be expensive.
- The RDD or DataFrame has wide dependencies, making recomputation costly.
- The application is iterative, such as machine learning algorithms, where the same data is used many times.

There are two types of checkpointing:
- Reliable checkpointing: Data is saved to a reliable file system. The lineage is truncated.
- Local checkpointing: Data is saved to executor local storage. The lineage is not fully truncated, but it can be used for narrow dependencies.

Example:

```python
sc.setCheckpointDir("/checkpoint/dir")
rdd = sc.parallelize([1, 2, 3, 4, 5]).map(lambda x: x * 2)
rdd.checkpoint()
rdd.count()  # triggers checkpointing
```

After checkpointing, the lineage of `rdd` is truncated. If a partition is lost, it is read from the checkpoint directory.

Checkpointing is different from caching. Caching stores data in memory or disk but keeps the lineage. Checkpointing saves data to reliable storage and truncates the lineage.

### 1.3.8 Summary

Lazy evaluation means transformations are not executed until an action is called. This allows Spark to optimize the entire chain of operations using Catalyst and Tungsten. Lineage is the record of transformations that created each RDD or DataFrame. It enables fault tolerance by allowing Spark to recompute lost partitions. Narrow dependencies are cheap to recompute, while wide dependencies are expensive. Checkpointing truncates the lineage by saving data to reliable storage. Together, lazy evaluation and lineage make Spark efficient, resilient, and easy to optimize.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.3%20Lazy%20Evaluation%20And%20Lineage
