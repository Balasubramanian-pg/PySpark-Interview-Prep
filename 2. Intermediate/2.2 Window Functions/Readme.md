# 2.2 Window Functions

Window functions perform calculations across a set of rows that are related to the current row, without collapsing the result set like `groupBy` does. They are essential for ranking, running totals, moving averages, and comparing a row to its neighbors. In distributed systems like Spark, window functions require shuffling and sorting data by the window specification, so understanding how they execute is critical for performance tuning.

### Window Specification

A window specification defines three components:

- **Partitioning**: Groups rows into logical partitions. Rows in different partitions are independent.
- **Ordering**: Defines the order of rows within each partition.
- **Frame**: Specifies which rows within the partition are included for the current row's calculation.

In PySpark, these are built using `pyspark.sql.Window`.

```python
from pyspark.sql import Window
from pyspark.sql.functions import row_number, sum, avg, lag, col

# Define a window specification
window_spec = Window.partitionBy("department").orderBy("salary")

# With a specific frame: rows from unbounded preceding to current row
window_frame = Window.partitionBy("department").orderBy("salary").rowsBetween(Window.unboundedPreceding, Window.currentRow)
```

The default frame depends on the presence of `orderBy`:
- If `orderBy` is specified and no frame is given, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.
- If `orderBy` is not specified, the default is `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

This default behavior is a common source of confusion. For example, `sum("salary").over(window_spec)` with an ordered window computes a cumulative sum up to the current row, not a total sum over the entire partition.

### Types of Window Functions

Spark supports three categories of window functions.

| Category | Functions | Description |
|----------|-----------|-------------|
| Ranking | `row_number`, `rank`, `dense_rank`, `percent_rank`, `ntile` | Assign ranks or buckets to rows within a partition. |
| Analytic | `lead`, `lag`, `first_value`, `last_value`, `nth_value` | Access values from other rows in the partition. |
| Aggregate | `sum`, `avg`, `min`, `max`, `count`, `stddev`, etc. | Compute aggregates over the window frame. |

### PySpark Examples

```python
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql.functions import row_number, rank, dense_rank, sum, avg, lag, lead, col

spark = SparkSession.builder.appName("WindowFunctions").getOrCreate()

data = [
    ("Engineering", "Alice", 90000),
    ("Engineering", "Bob", 80000),
    ("Engineering", "Charlie", 85000),
    ("Sales", "Diana", 70000),
    ("Sales", "Eve", 75000),
    ("Sales", "Frank", 72000),
]
df = spark.createDataFrame(data, ["department", "name", "salary"])

# Ranking functions
window_dept_order = Window.partitionBy("department").orderBy(col("salary").desc())

df.withColumn("row_number", row_number().over(window_dept_order)) \
  .withColumn("rank", rank().over(window_dept_order)) \
  .withColumn("dense_rank", dense_rank().over(window_dept_order)) \
  .show()

# Analytic functions: lag and lead
window_dept_order_asc = Window.partitionBy("department").orderBy("salary")

df.withColumn("prev_salary", lag("salary", 1).over(window_dept_order_asc)) \
  .withColumn("next_salary", lead("salary", 1).over(window_dept_order_asc)) \
  .show()

# Aggregate window: running total
df.withColumn("running_total", sum("salary").over(window_dept_order_asc)) \
  .show()

# Aggregate window: total per department (no ordering, full frame)
window_dept = Window.partitionBy("department")
df.withColumn("dept_total", sum("salary").over(window_dept)) \
  .show()
```

### SQL Equivalents

Window functions are fully supported in Spark SQL using the `OVER` clause.

```sql
-- Ranking
SELECT department, name, salary,
       ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS row_number,
       RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank,
       DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dense_rank
FROM employees;

-- Running total
SELECT department, name, salary,
       SUM(salary) OVER (PARTITION BY department ORDER BY salary
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM employees;

-- Lag and lead
SELECT department, name, salary,
       LAG(salary, 1) OVER (PARTITION BY department ORDER BY salary) AS prev_salary,
       LEAD(salary, 1) OVER (PARTITION BY department ORDER BY salary) AS next_salary
FROM employees;
```

### Performance Implications and Configuration

Window functions are wide transformations. They require:
1. A **shuffle** to co-locate rows with the same partition key.
2. A **sort** within each partition if `orderBy` is specified.

This makes them significantly more expensive than narrow transformations. The cost grows with the number of partitions and the size of each partition.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.shuffle.partitions` | 200 | Number of partitions for shuffles. Tune based on data size and cluster resources. |
| `spark.sql.windowExec.buffer.spill.threshold` | 4096 | Number of rows buffered before spilling to disk during window execution. Increase for memory-rich environments. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Enables adaptive query execution, which can optimize shuffle partitions and skew. |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` | Allows AQE to merge small partitions after shuffle. |

Frame size also matters. An unbounded frame (e.g., `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`) forces Spark to buffer the entire partition in memory or spill to disk. A bounded frame (e.g., `ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING`) limits memory usage and can be much faster.

### Best Practices and When to Use

- **Prefer window functions over self-joins** for ranking, running totals, and accessing neighboring rows. They are more readable and often more efficient.
- **Filter and project before the window.** Reduce the number of rows and columns entering the window operation to minimize shuffle and sort costs.
- **Choose partition keys with balanced cardinality.** Very low cardinality (e.g., one partition for the entire dataset) causes a single task bottleneck. Very high cardinality creates many small partitions and scheduling overhead.
- **Use explicit frames** when you need precise control. Relying on default frames can lead to incorrect results if you forget that an ordered window defaults to a cumulative frame.
- **Avoid unnecessary ordering.** If the function does not require order (e.g., `sum` over the whole partition), omit `orderBy` to avoid an unnecessary sort.
- **Use `rowsBetween` over `rangeBetween`** when possible. `rangeBetween` with values requires additional comparisons and can be slower, especially with non-numeric order columns.
- **Leverage AQE** to handle skew and partition coalescing automatically.

### Common Pitfalls and Limitations

- **Default frame confusion.** As noted, an ordered window without an explicit frame uses `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This means `sum` becomes a running total, not a total. Always specify the frame if you need a full-partition aggregate.
- **NULL ordering.** By default, Spark places `NULL` values first in ascending order and last in descending order. This can affect ranking and lag/lead results. Use `asc_nulls_last()` or `desc_nulls_first()` to control.
- **Memory pressure with unbounded frames.** Unbounded windows require holding the entire partition in memory. On large partitions, this leads to spilling and potential `OutOfMemoryError`. Use bounded frames or increase `spark.sql.windowExec.buffer.spill.threshold`.
- **Data skew.** If a partition key is heavily skewed, a single task can become a bottleneck. Enable AQE skew join handling or salt the partition key.
- **Window functions cannot be used in `WHERE` or `HAVING` clauses.** They are evaluated after these clauses. To filter on a window function result, wrap the query in a subquery or use a DataFrame `filter` after `withColumn`.
- **Multiple window functions with different specifications** in the same query can cause multiple shuffles. Combine window specifications when possible, or accept the cost.

### Summary

Window functions in PySpark enable complex analytics such as ranking, running totals, and neighbor comparisons without collapsing rows. They are defined by a window specification comprising partitioning, ordering, and framing. While powerful, they require shuffle and sort operations that can be expensive on large datasets. By understanding default frames, tuning shuffle partitions, and using bounded frames and AQE, you can write efficient and correct window-based pipelines. Mastery of window functions is a hallmark of a proficient PySpark engineer.

