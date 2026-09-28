# 1.7 Basic Aggregations

Aggregations summarize data by computing values such as count, sum, average, minimum, and maximum. In PySpark, aggregations are performed on DataFrames using `groupBy`, `agg`, and built-in functions from `pyspark.sql.functions`. They are wide transformations that trigger a shuffle when grouping by a key, so understanding their behavior is important for performance.

#### 1.7.1 What are aggregations?

An aggregation reduces multiple rows into fewer rows by applying a function. There are two common forms:

- Whole DataFrame aggregation: computes a single result across all rows.
- Grouped aggregation: computes one result per group defined by one or more columns.

Aggregations are lazy transformations. They execute only when an action such as `show()`, `count()`, or `write()` is called.

#### 1.7.2 Aggregate the entire DataFrame

Use `df.agg()` to compute aggregations across all rows without grouping.

```python
from pyspark.sql.functions import sum, avg, count, min, max, countDistinct

df = spark.createDataFrame([
    (1, "Alice", 25, 100.0),
    (2, "Bob", 30, 200.0),
    (3, "Alice", 25, 300.0),
    (4, "Bob", 30, 400.0),
    (5, "Charlie", 35, 500.0)
], ["id", "name", "age", "amount"])

df.agg(
    sum("amount").alias("total_amount"),
    avg("amount").alias("avg_amount"),
    count("*").alias("row_count"),
    min("amount").alias("min_amount"),
    max("amount").alias("max_amount")
).show()
```

Output:
```
+------------+----------+---------+----------+----------+
|total_amount|avg_amount|row_count|min_amount|max_amount|
+------------+----------+---------+----------+----------+
|      1500.0|     300.0|        5|     100.0|     500.0|
+------------+----------+---------+----------+----------+
```

#### 1.7.3 GroupBy and agg

Use `groupBy` to define groups, then `agg` to apply aggregate functions.

```python
df.groupBy("name").agg(
    sum("amount").alias("total_amount"),
    avg("amount").alias("avg_amount"),
    count("*").alias("order_count")
).show()
```

Output:
```
+-------+------------+----------+-----------+
|   name|total_amount|avg_amount|order_count|
+-------+------------+----------+-----------+
|  Alice|       400.0|     200.0|          2|
|    Bob|       600.0|     300.0|          2|
|Charlie|       500.0|     500.0|          1|
+-------+------------+----------+-----------+
```

Grouping by multiple columns:

```python
df.groupBy("name", "age").agg(sum("amount").alias("total")).show()
```

#### 1.7.4 Common aggregate functions

- `count("*")`: counts all rows, including nulls.
- `count("col")`: counts non-null values in a column.
- `countDistinct("col")`: counts distinct non-null values.
- `approx_count_distinct("col", rsd)`: approximate distinct count, faster for large data.
- `sum("col")`: sums non-null values.
- `avg("col")`: average of non-null values.
- `min("col")`, `max("col")`: minimum and maximum.
- `first("col")`, `last("col")`: first and last value in the group.
- `collect_list("col")`: collects values into an array, including duplicates.
- `collect_set("col")`: collects distinct values into an array.
- `stddev("col")`, `variance("col")`: standard deviation and variance.

Example:

```python
from pyspark.sql.functions import countDistinct, collect_list, collect_set, approx_count_distinct

df.groupBy("name").agg(
    countDistinct("amount").alias("distinct_amounts"),
    collect_list("amount").alias("amount_list"),
    collect_set("amount").alias("amount_set"),
    approx_count_distinct("amount", 0.01).alias("approx_distinct")
).show()
```

#### 1.7.5 Multiple aggregations and aliases

You can apply multiple aggregate functions in a single `agg` call. Always use `.alias()` to name the resulting columns clearly.

```python
df.groupBy("name").agg(
    sum("amount").alias("total"),
    avg("amount").alias("average"),
    count("id").alias("orders")
).show()
```

#### 1.7.6 Filtering aggregated results (HAVING)

Spark does not have a `HAVING` clause in the DataFrame API. Instead, filter after aggregation using `filter` or `where`.

```python
df.groupBy("name").agg(sum("amount").alias("total")) \
  .filter("total > 400") \
  .show()
```

SQL equivalent:

```sql
SELECT name, SUM(amount) AS total
FROM table
GROUP BY name
HAVING SUM(amount) > 400;
```

#### 1.7.7 Grouping sets, rollup, and cube

These operations compute aggregations at multiple levels of grouping in a single pass.

`rollup` creates hierarchical subtotals.

```python
df.rollup("name", "age").agg(sum("amount").alias("total")).show()
```

`cube` creates subtotals for all combinations of grouping columns.

```python
df.cube("name", "age").agg(sum("amount").alias("total")).show()
```

`grouping sets` allows specifying exact grouping combinations.

```python
df.groupBy("name", "age").agg(sum("amount").alias("total")) \
  .groupingSets([("name",), ("age",), ()]) \
  .show()
```

#### 1.7.8 Pivot

Pivot turns distinct values of a column into separate columns, often used with aggregation.

```python
df.groupBy("name").pivot("age").agg(sum("amount")).show()
```

Output columns become the distinct age values. Pivot can be expensive if the pivot column has high cardinality.

#### 1.7.9 Null handling in aggregations

Most aggregate functions ignore nulls. For example, `sum`, `avg`, `min`, and `max` skip null values. `count("col")` counts non-null values, while `count("*")` counts all rows.

```python
df_null = spark.createDataFrame([(1, None), (2, 10), (3, 20)], ["id", "value"])
df_null.agg(
    sum("value").alias("sum_value"),
    count("value").alias("count_value"),
    count("*").alias("count_all")
).show()
```

Output:
```
+---------+-----------+---------+
|sum_value|count_value|count_all|
+---------+-----------+---------+
|     30.0|          2|        3|
+---------+-----------+---------+
```

#### 1.7.10 Performance considerations

- Aggregations with `groupBy` trigger a shuffle. The shuffle is expensive due to network I/O, disk I/O, and serialization.
- Filter and select before grouping to reduce the data shuffled.
- Use `approx_count_distinct` instead of `countDistinct` when an approximate result is acceptable and the cardinality is high.
- Avoid `collect_list` and `collect_set` on high-cardinality columns, as they can create very large arrays and cause memory pressure.
- Grouping by a high-cardinality column can cause skew. Enable Adaptive Query Execution (AQE) to handle skew automatically.
- Tune `spark.sql.shuffle.partitions` based on data size. AQE can coalesce shuffle partitions at runtime.
- Use `explain(True)` to inspect the physical plan and verify partial and final aggregations.
- For repeated aggregations on the same data, cache the filtered and selected DataFrame before grouping.

#### 1.7.11 SQL equivalents

Most DataFrame aggregations have SQL equivalents.

```sql
SELECT name, SUM(amount) AS total, AVG(amount) AS average, COUNT(*) AS orders
FROM table
GROUP BY name
HAVING SUM(amount) > 400
ORDER BY total DESC;
```

#### 1.7.12 Summary

Basic aggregations in PySpark use `groupBy`, `agg`, and built-in functions such as `sum`, `avg`, `count`, `min`, `max`, `countDistinct`, `collect_list`, and `collect_set`. Whole DataFrame aggregations use `df.agg()` without grouping. Filter after aggregation to simulate `HAVING`. Use `rollup`, `cube`, `grouping sets`, and `pivot` for advanced grouping. Be aware that aggregations trigger a shuffle and can be expensive. Filter early, select only needed columns, use approximate functions for large cardinality, and enable AQE for skew handling. These practices will keep your aggregation jobs fast and reliable.

Notebook link:
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.7%20Basic%20Aggregations
