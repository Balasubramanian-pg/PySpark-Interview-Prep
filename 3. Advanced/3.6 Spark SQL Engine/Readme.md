# 3.6 Spark SQL Engine

The Spark SQL engine is the component that powers DataFrame, Dataset, and SQL execution. It includes the Catalyst optimizer, the Tungsten execution engine, and the whole-stage code generation framework. Understanding how it works helps you write efficient queries, interpret physical plans, and tune performance.

### 3.6.1 What is the Catalyst Optimizer and how does it work?

The Catalyst Optimizer is the query optimization framework in Spark SQL. It transforms a user's query into an optimized physical plan through a series of rule-based and cost-based transformations. It is extensible, meaning you can add custom optimization rules.

Catalyst operates in four main phases:

1. Analysis: The query is parsed into an unresolved logical plan. The Analyzer resolves column names, data types, and table references using the catalog. It produces a resolved logical plan.

2. Logical optimization: A set of rule-based optimizations are applied to the resolved logical plan. These include predicate pushdown, constant folding, column pruning, boolean expression simplification, and join reordering. The result is an optimized logical plan.

3. Physical planning: The optimized logical plan is converted into one or more physical plans. The planner uses strategies to choose physical operators. For example, a join might become a BroadcastHashJoin or a SortMergeJoin. Cost-based optimization may compare plans and choose the cheapest one.

4. Code generation: The selected physical plan is compiled into Java bytecode using whole-stage code generation. This eliminates virtual function calls and intermediate data structures, improving CPU efficiency.

You can see the output of each phase using `explain(True)`.

```python
df = spark.range(1000000).selectExpr("id as key", "id as value")
filtered = df.filter("key > 100")
filtered.explain(True)
```

The output shows the parsed, analyzed, optimized logical plans, and the physical plan.

Catalyst is extensible. You can add custom optimization rules by extending `Rule[LogicalPlan]` and registering them with `spark.experimental.extraOptimizations`. This is advanced and rarely needed.

### 3.6.2 What is the difference between logical and physical plans?

A logical plan describes what to compute, while a physical plan describes how to compute it.

Logical plan:
- Represents the query as a tree of logical operators such as `Project`, `Filter`, `Join`, `Aggregate`.
- Does not specify execution details like join strategy or partitioning.
- Undergoes analysis and optimization.
- There are three forms: parsed logical plan, analyzed logical plan, and optimized logical plan.

Physical plan:
- Represents the actual execution strategy.
- Specifies physical operators such as `BroadcastHashJoin`, `SortMergeJoin`, `HashAggregate`, `Exchange`, `FileScan`.
- Includes partitioning and ordering information.
- Is the result of physical planning and cost-based optimization.
- Is what actually runs on the cluster.

Example: A logical plan might show `Join` with a condition. The physical plan might show `BroadcastHashJoin` with the small table broadcast, or `SortMergeJoin` with `Exchange` and `Sort` nodes.

You can view both with `explain(True)`.

```python
df1 = spark.range(100).selectExpr("id as key", "id as a")
df2 = spark.range(1000).selectExpr("id as key", "id as b")
joined = df1.join(df2, "key")
joined.explain(True)
```

The physical plan shows the join strategy and any shuffles.

### 3.6.3 What is Tungsten and how does it improve performance?

Tungsten is a set of improvements to Spark's execution engine that focus on CPU and memory efficiency. It was introduced in Spark 1.5 and is a core part of Spark SQL. Tungsten includes three main components:

1. Memory management and binary processing: Instead of using Java objects, Tungsten represents data in a compact binary format using `UnsafeRow`. This reduces memory footprint and garbage collection overhead. It also allows Spark to operate directly on serialized data.

2. Cache-aware computation: Tungsten uses algorithms and data structures that are friendly to CPU caches. It avoids pointer chasing and uses contiguous memory layouts.

3. Whole-stage code generation: Tungsten compiles a whole stage of operators into a single Java function, eliminating virtual function calls and intermediate data materialization.

Benefits:
- Lower memory usage: Binary representation is more compact than Java objects.
- Less GC pressure: Fewer objects are created, so garbage collection pauses are shorter.
- Faster CPU execution: Code generation and cache-friendly algorithms improve instruction throughput.
- Better spill performance: Binary data can be spilled and read back more efficiently.

Tungsten is enabled by default. You can see it in the physical plan with operators like `WholeStageCodegen` and `*(1)`. The asterisk prefix indicates whole-stage code generation.

### 3.6.4 What is whole-stage code generation?

Whole-stage code generation is a Tungsten feature that fuses multiple physical operators into a single Java function. Instead of executing each operator separately with virtual function calls and passing rows through iterators, Spark generates specialized code for the entire pipeline.

How it works:
- The physical plan is divided into stages. A stage is a sequence of operators that can be fused together without a shuffle or exchange.
- For each stage, Spark generates Java source code that processes rows in a tight loop.
- The generated code is compiled at runtime using Janino, a Java compiler.
- The compiled function is executed on each partition.

Benefits:
- Eliminates virtual function calls between operators.
- Avoids materializing intermediate rows.
- Improves CPU cache locality.
- Reduces overhead per row.

You can see whole-stage code generation in the physical plan. Operators with `*(n)` prefix are part of a code-generated stage.

```python
df = spark.range(1000000).filter("id > 100").selectExpr("id * 2 as doubled")
df.explain(True)
```

The plan shows `*(1) Filter` and `*(1) Project` inside the same code-generated stage.

Whole-stage code generation can be disabled with `spark.sql.codegen.wholeStage=false`, but this is not recommended unless debugging.

### 3.6.5 How does cost-based optimization work in Spark SQL?

Cost-based optimization (CBO) uses statistics about tables and columns to choose the cheapest physical plan. It is part of the Catalyst optimizer and is especially important for join ordering and join strategy selection.

Statistics used by CBO:
- Table-level: row count, size in bytes.
- Column-level: number of distinct values (NDV), null count, min/max, average length.
- These are stored in the metastore and can be collected with `ANALYZE TABLE`.

CBO compares alternative physical plans and estimates their cost based on:
- I/O cost: reading data from sources.
- CPU cost: processing rows.
- Network cost: shuffling data.
- Memory cost: building hash maps or sorting.

Join reordering:
- For multi-way joins, CBO can reorder joins to minimize intermediate result sizes. It uses dynamic programming to find the best join order.
- Controlled by `spark.sql.cbo.enabled=true` and `spark.sql.cbo.joinReorder.enabled=true`.

Join strategy selection:
- CBO can choose between broadcast hash join, shuffle hash join, and sort-merge join based on estimated sizes.
- If statistics show one side is small, it may choose broadcast. If both are large, it may choose sort-merge.

To use CBO effectively, you must collect statistics.

```sql
ANALYZE TABLE my_table COMPUTE STATISTICS;
ANALYZE TABLE my_table COMPUTE STATISTICS FOR COLUMNS col1, col2;
```

In PySpark:

```python
spark.sql("ANALYZE TABLE my_table COMPUTE STATISTICS FOR COLUMNS col1, col2")
```

CBO is enabled by default in Spark 3.x for some decisions, but full join reordering requires `spark.sql.cbo.enabled=true`.

### 3.6.6 What are the common optimization rules in Catalyst?

Catalyst applies many rule-based optimizations. Some of the most common are:

- Predicate pushdown: Moves filter conditions closer to the data source. For example, a filter on a Parquet file can be pushed down to the file scan, so only matching rows are read. This is one of the most impactful optimizations.

- Column pruning: Removes columns that are not needed by the query. This reduces I/O and memory usage.

- Constant folding: Evaluates constant expressions at compile time. For example, `1 + 2` becomes `3`.

- Boolean expression simplification: Simplifies boolean expressions. For example, `a AND true` becomes `a`.

- Join reordering: Reorders joins to minimize intermediate result sizes. This is part of CBO.

- Join strategy selection: Chooses broadcast, shuffle hash, or sort-merge join based on statistics.

- Limit pushdown: Pushes a `LIMIT` closer to the source to reduce the amount of data read.

- Aggregate pushdown: Pushes partial aggregations closer to the source.

- Null propagation: Simplifies expressions involving nulls.

- Remove redundant aliases and projections.

You can see the effect of these rules in the optimized logical plan from `explain(True)`. For example, a filter on a Parquet file will appear in the `FileScan` node as a `PushedFilters` attribute.

### 3.6.7 How does Spark SQL handle predicate pushdown?

Predicate pushdown is the optimization that moves filter conditions as close to the data source as possible. This reduces the amount of data read, transferred, and processed.

For file-based sources like Parquet and ORC:
- Spark reads the file metadata and statistics (min/max values per row group or stripe).
- Filters on columns with statistics can skip entire row groups that do not match.
- Filters are also applied at the row level after reading, but skipping row groups saves I/O.
- Partition pruning: If the table is partitioned, filters on partition columns can skip entire directories.

For JDBC sources:
- Spark can push down filters to the database using the `WHERE` clause. This is controlled by `spark.sql.jdbc.pushdownPredicate` (default true).
- Only supported predicates are pushed down. Complex expressions may not be pushed.

For DataFrames:
- You can see pushed filters in the physical plan. For Parquet, look for `PushedFilters: [IsNotNull(col), GreaterThan(col, 100)]` in the `FileScan` node.

Example:

```python
df = spark.read.parquet("/data/events")
filtered = df.filter("date >= '2024-01-01' AND country = 'US'")
filtered.explain(True)
```

In the plan, the `FileScan` node shows `PushedFilters` and `PartitionFilters` if applicable.

Predicate pushdown is most effective when:
- The data source supports statistics.
- The filter is on a column with statistics.
- The filter is a simple comparison or `IS NOT NULL`.

### 3.6.8 What is the role of the Analyzer in Spark SQL?

The Analyzer is the component that resolves and validates a logical plan. It takes an unresolved logical plan (parsed from SQL or constructed from DataFrame operations) and produces a resolved logical plan.

Responsibilities of the Analyzer:
- Resolve table names and column names using the catalog.
- Resolve data types and cast expressions where needed.
- Resolve functions and operators.
- Validate that the query is semantically correct. For example, it checks that a column exists, that a function has the correct number of arguments, and that data types are compatible.
- Apply rules to handle special cases like `NULL` handling, implicit casts, and view expansion.

The Analyzer uses a `Catalog` to look up tables, databases, functions, and columns. It also uses a set of resolution rules. If a name cannot be resolved, it throws an `AnalysisException` with a message like `cannot resolve 'col' given input columns`.

You can see the analyzed plan with `explain(True)`. The analyzed plan is the second plan shown, after the parsed plan.

```python
df = spark.sql("SELECT name, age FROM people WHERE age > 30")
df.explain(True)
```

The analyzed plan shows resolved column references and data types.

The Analyzer is followed by the Optimizer, which applies logical optimizations. The Analyzer ensures the plan is valid before optimization begins.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.6%20Spark%20SQL%20Engine
