# 2.6 Aggregations And Pivoting

Aggregations and pivoting are core operations for summarizing and reshaping data in PySpark. Aggregations collapse multiple rows into summary values, while pivoting rotates rows into columns to create cross-tabular views. Together they enable everything from simple counts to complex reporting and feature engineering. In distributed environments, these operations require shuffling data by grouping keys, so understanding their execution characteristics and configuration is essential for performance tuning.

### Aggregations

Aggregations group rows by one or more keys and compute summary statistics. PySpark provides the `groupBy()` method followed by `agg()`, or direct aggregate functions on a DataFrame.

#### Basic GroupBy and Agg

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import sum, avg, count, max, min, col

spark = SparkSession.builder.appName("Aggregations").getOrCreate()

data = [
    ("Engineering", "Alice", 90000),
    ("Engineering", "Bob", 80000),
    ("Engineering", "Charlie", 85000),
    ("Sales", "Diana", 70000),
    ("Sales", "Eve", 75000),
    ("Sales", "Frank", 72000),
]
df = spark.createDataFrame(data, ["department", "name", "salary"])

# Group by one column and aggregate
df.groupBy("department").agg(
    sum("salary").alias("total_salary"),
    avg("salary").alias("avg_salary"),
    count("*").alias("num_employees"),
    max("salary").alias("max_salary"),
    min("salary").alias("min_salary")
).show()

# Multiple grouping columns
df.groupBy("department", "name").agg(sum("salary")).show()
```

SQL equivalents:

```sql
SELECT department,
       SUM(salary) AS total_salary,
       AVG(salary) AS avg_salary,
       COUNT(*) AS num_employees,
       MAX(salary) AS max_salary,
       MIN(salary) AS min_salary
FROM employees
GROUP BY department;
```

#### Common Aggregate Functions

| Function | Description |
|----------|-------------|
| `sum(col)` | Sum of values |
| `avg(col)` | Average |
| `count(col)` | Count of non-null values |
| `countDistinct(col)` | Count of distinct values |
| `max(col)` | Maximum |
| `min(col)` | Minimum |
| `stddev(col)` | Standard deviation |
| `variance(col)` | Variance |
| `collect_list(col)` | Collects values into an array (with duplicates) |
| `collect_set(col)` | Collects distinct values into an array |
| `first(col)` | First value in group |
| `last(col)` | Last value in group |
| `approx_count_distinct(col, rsd)` | Approximate distinct count (HyperLogLog) |

#### Grouping Sets, Rollup, and Cube

These operations produce multiple levels of aggregation in a single query, useful for hierarchical summaries.

```python
# Rollup: hierarchical subtotals
df.rollup("department", "name").agg(sum("salary")).show()

# Cube: all combinations of grouping columns
df.cube("department", "name").agg(sum("salary")).show()

# Grouping sets: explicit combinations
df.groupBy("department", "name").agg(sum("salary")).show()  # replace with grouping sets
```

SQL equivalents:

```sql
-- Rollup
SELECT department, name, SUM(salary)
FROM employees
GROUP BY ROLLUP(department, name);

-- Cube
SELECT department, name, SUM(salary)
FROM employees
GROUP BY CUBE(department, name);

-- Grouping sets
SELECT department, name, SUM(salary)
FROM employees
GROUP BY GROUPING SETS ((department), (name), ());
```

### Pivoting

Pivoting transforms distinct values from a column into new columns, with aggregations applied to the remaining columns. It is the inverse of grouping: instead of collapsing rows, it expands a column into multiple columns.

#### Basic Pivot

```python
# Pivot on department, aggregate salary
df.groupBy("name").pivot("department").agg(sum("salary")).show()

# With explicit pivot values (more efficient)
departments = ["Engineering", "Sales"]
df.groupBy("name").pivot("department", departments).agg(sum("salary")).show()
```

The explicit list of pivot values is recommended because it avoids an extra pass over the data to determine distinct values.

#### Dynamic Pivot

When pivot values are not known in advance, you must compute them first.

```python
# Get distinct pivot values
pivot_values = [row[0] for row in df.select("department").distinct().collect()]

# Use them in pivot
df.groupBy("name").pivot("department", pivot_values).agg(sum("salary")).show()
```

Collecting distinct values to the driver can be expensive if the cardinality is high. Use this pattern only when the number of distinct values is small (e.g., < 1000).

#### Multiple Aggregations with Pivot

```python
df.groupBy("name").pivot("department").agg(
    sum("salary").alias("total"),
    avg("salary").alias("avg")
).show()
```

### Unpivoting

Unpivoting (also called melting) transforms columns into rows. Spark 3.4+ provides the `melt` function; earlier versions use the `stack` SQL function or a union of selects.

#### Using stack (SQL)

```python
df_pivot = df.groupBy("name").pivot("department").agg(sum("salary"))

# Unpivot using stack
df_pivot.createOrReplaceTempView("pivoted")

spark.sql("""
    SELECT name, department, salary
    FROM pivoted
    LATERAL VIEW STACK(2, 'Engineering', Engineering, 'Sales', Sales) AS department, salary
""").show()
```

#### Using melt (Spark 3.4+)

```python
from pyspark.sql.functions import melt

df_pivot.melt(
    ids=["name"],
    values=["Engineering", "Sales"],
    variableColumnName="department",
    valueColumnName="salary"
).show()
```

### Performance Implications and Configuration

Aggregations and pivoting are wide transformations that require a shuffle to co-locate rows with the same grouping key. The cost grows with the number of distinct keys, data size, and skew.

- **Shuffle partitions**: The number of partitions after shuffle is controlled by `spark.sql.shuffle.partitions` (default 200). For small datasets, 200 partitions create excessive overhead. For large datasets, it may be insufficient. Tune based on data volume.
- **Skew**: A single grouping key with many rows can cause one task to process far more data than others. Enable adaptive query execution (AQE) skew handling or salt the key.
- **Pivot cardinality**: Pivoting with a high-cardinality column creates a very wide DataFrame, which can lead to memory issues and slow performance. Always specify the pivot values explicitly.
- **Collecting pivot values**: `collect()` to the driver can cause `OutOfMemoryError` if the distinct set is large. Consider using a two-pass approach or limiting the values.
- **Approximate aggregations**: For large datasets, use `approx_count_distinct` instead of `countDistinct` to reduce shuffle and memory.
- **Broadcast for small groups**: If one side of a join is small, broadcast hints can avoid shuffles, but aggregations themselves always shuffle by group key.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.shuffle.partitions` | 200 | Number of partitions for shuffles. Tune for data size. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Enables AQE, which optimizes shuffle partitions and skew. |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` | Merges small partitions after shuffle. |
| `spark.sql.adaptive.skewJoin.enabled` | `true` | Splits skewed partitions during joins, also helps aggregations. |
| `spark.sql.aggregate.adaptivePartialAggregationEnabled` | `true` | Enables partial aggregation before shuffle. |
| `spark.sql.aggregate.adaptivePartialAggregationInterval` | 1000000 | Number of rows before partial aggregation. |

### Best Practices and When to Use

- **Filter and project before aggregating**: Reduce the number of rows and columns entering the shuffle to lower network and memory costs.
- **Use built-in aggregate functions**: They are JVM-native and far faster than Python UDFs.
- **Prefer `countDistinct` with caution**: On large datasets, use `approx_count_distinct` for a performance boost with acceptable error.
- **Explicitly list pivot values**: This avoids an extra pass to determine distinct values and prevents wide schemas.
- **Use `rollup` and `cube` sparingly**: They generate multiple aggregation levels and can significantly increase shuffle size. Use only when the hierarchical summaries are needed.
- **For unpivoting, prefer `melt` in Spark 3.4+**: It is more readable and optimized than `stack` or unions.
- **Tune shuffle partitions**: Set `spark.sql.shuffle.partitions` based on the size of the data being shuffled. A common heuristic is 100–200 MB per partition.
- **Enable AQE**: Let Spark dynamically coalesce partitions and handle skew.
- **Consider bucketing**: If the same aggregation is repeated on the same key, bucketing the table by that key eliminates the shuffle.

### Common Pitfalls and Limitations

- **Null grouping keys**: `groupBy` treats nulls as a separate group, which may or may not be desired. Use `fillna` or filter nulls before grouping.
- **`collect_list` and `collect_set` memory**: These functions collect all values into a single array on one executor, which can cause `OutOfMemoryError`. Use only on small groups or with `array_agg` in SQL with limits.
- **Pivot with non-aggregated columns**: All columns not in `groupBy` or `pivot` must be aggregated. Forgetting this leads to errors or incorrect results.
- **Pivot with high cardinality**: Creates a very wide schema, potentially exceeding limits or causing performance degradation.
- **`countDistinct` is expensive**: It requires a full shuffle and deduplication. Use `approx_count_distinct` when exactness is not critical.
- **Grouping sets with many columns**: The number of grouping sets grows exponentially with the number of columns. Use only when necessary.
- **Unpivot with stack requires equal types**: All columns being unpivoted must have compatible data types.
- **Pivot column name conflicts**: If a pivot value contains special characters or spaces, the resulting column name may need backticks in SQL.
- **Memory pressure on driver**: Collecting distinct pivot values can exhaust driver memory if cardinality is high.

### Summary

Aggregations and pivoting are essential for summarizing and reshaping data in PySpark. Aggregations group rows and compute summary statistics, while pivoting rotates rows into columns for cross-tabular analysis. Both are wide transformations that require shuffling, making partition tuning, skew handling, and AQE critical for performance. By filtering early, using built-in functions, specifying pivot values explicitly, and being aware of pitfalls such as high cardinality and memory-intensive collect operations, you can build efficient and scalable aggregation pipelines in Spark 3.x.
