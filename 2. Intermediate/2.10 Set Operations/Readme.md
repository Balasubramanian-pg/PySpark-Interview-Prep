# 2.10 Set Operations

Set operations combine rows from two or more DataFrames using set semantics. They are essential for appending datasets, deduplicating records, finding common rows, and identifying rows that exist in one dataset but not another. In PySpark, the DataFrame API provides `union`, `unionByName`, `intersect`, `intersectAll`, `except`, `exceptAll`, and `subtract`. Understanding how these operations handle duplicates, column matching, and shuffling is critical for writing correct and performant pipelines.

### Core Set Operations and Semantics

The following table summarizes the available set operations in PySpark and their SQL equivalents.

| Operation | PySpark Method | SQL Equivalent | Duplicates | Shuffle Required |
|-----------|----------------|----------------|------------|------------------|
| Union all | `union()` | `UNION ALL` | Preserved | No |
| Union distinct | `union().distinct()` | `UNION` | Removed | Yes (due to `distinct`) |
| Union by name | `unionByName()` | N/A | Preserved | No |
| Intersect distinct | `intersect()` | `INTERSECT` | Removed | Yes |
| Intersect all | `intersectAll()` | `INTERSECT ALL` | Preserved (min count) | Yes |
| Except distinct | `except()` / `subtract()` | `EXCEPT` / `MINUS` | Removed | Yes |
| Except all | `exceptAll()` | `EXCEPT ALL` | Preserved (max(0, m-n)) | Yes |

Key rules:
- `union` and `unionAll` match columns by position. `unionAll` is a deprecated alias for `union` since Spark 2.0.
- `unionByName` matches columns by name and can optionally allow missing columns.
- `intersect`, `intersectAll`, `except`, and `exceptAll` match columns by position.
- `intersect` and `except` remove duplicates. `intersectAll` and `exceptAll` preserve duplicates according to SQL set semantics.
- `subtract` is an alias for `except` (distinct).

### Union and UnionByName

`union` concatenates two DataFrames and is equivalent to SQL `UNION ALL`. It does not remove duplicates and does not shuffle data.

```python
# Union all (SQL UNION ALL)
df_union = df1.union(df2)

# Union distinct (SQL UNION)
df_union_distinct = df1.union(df2).distinct()

# Union by name (aligns columns by name, not position)
df_union_by_name = df1.unionByName(df2)

# Union by name allowing missing columns; missing columns are filled with null
df_union_missing = df1.unionByName(df2, allowMissingColumns=True)
```

SQL equivalents:

```sql
-- UNION ALL
SELECT * FROM df1
UNION ALL
SELECT * FROM df2;

-- UNION (distinct)
SELECT * FROM df1
UNION
SELECT * FROM df2;
```

Important notes:
- `union` requires the same number of columns and compatible data types. Spark attempts to find a common type; incompatible types cause an analysis error.
- `unionByName` was introduced in Spark 2.3.0. The `allowMissingColumns` parameter was added in Spark 3.1.0.
- `union` does not preserve row order. Set operations are unordered.

### Intersect and IntersectAll

`intersect` returns rows that appear in both DataFrames and removes duplicates. `intersectAll` preserves duplicates: for each row, if it appears `m` times in the left DataFrame and `n` times in the right, the result contains `min(m, n)` copies.

```python
# Intersect distinct (SQL INTERSECT)
df_intersect = df1.intersect(df2)

# Intersect all (SQL INTERSECT ALL)
df_intersect_all = df1.intersectAll(df2)
```

SQL equivalents:

```sql
-- INTERSECT
SELECT * FROM df1
INTERSECT
SELECT * FROM df2;

-- INTERSECT ALL
SELECT * FROM df1
INTERSECT ALL
SELECT * FROM df2;
```

`intersectAll` is available in Spark 3.0 and later.

### Except, ExceptAll, and Subtract

`except` (or `subtract`) returns rows in the left DataFrame that are not in the right DataFrame and removes duplicates. `exceptAll` preserves duplicates: for each row, if it appears `m` times in the left and `n` times in the right, the result contains `max(0, m - n)` copies.

```python
# Except distinct (SQL EXCEPT / MINUS)
df_except = df1.except(df2)
# Alias
df_subtract = df1.subtract(df2)

# Except all (SQL EXCEPT ALL)
df_except_all = df1.exceptAll(df2)
```

SQL equivalents:

```sql
-- EXCEPT (distinct)
SELECT * FROM df1
EXCEPT
SELECT * FROM df2;

-- MINUS is an alias for EXCEPT in Spark SQL
SELECT * FROM df1
MINUS
SELECT * FROM df2;

-- EXCEPT ALL
SELECT * FROM df1
EXCEPT ALL
SELECT * FROM df2;
```

`exceptAll` is available in Spark 2.4 and later.

### Performance Implications and Configuration

Set operations differ significantly in their execution cost.

- `union` is a narrow transformation. It does not trigger a shuffle. However, it creates a DataFrame with the sum of partitions from both inputs. If you union many DataFrames, the number of partitions can grow large, leading to many small tasks. Use `coalesce()` or `repartition()` afterward to control partition count.
- `union().distinct()` introduces a shuffle because `distinct` requires global deduplication.
- `intersect`, `intersectAll`, `except`, and `exceptAll` are wide transformations. They require a shuffle to compare rows across partitions. These operations are significantly more expensive than `union`.
- `intersectAll` and `exceptAll` may require additional memory to track duplicate counts during the shuffle.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.shuffle.partitions` | 200 | Number of partitions used for shuffles, including set operations that require shuffle. Tune based on data size. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Enables adaptive query execution, which can coalesce shuffle partitions and optimize set operations at runtime. |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` | Allows AQE to merge small partitions after a shuffle. |

Trade-offs:
- Set operations are declarative and easy to read, but they may not always be the most efficient choice. For example, `intersect` can be expressed as an inner join followed by `distinct`, and `except` can be expressed as a left anti join. In some cases, join-based alternatives give you more control over partitioning and can be faster.
- `union` is cheap, but adding `distinct` or using `intersect`/`except` introduces shuffle costs. Always filter and project columns before set operations to reduce the data that must be shuffled.

### Best Practices and When to Use

- Use `union` when you need to append DataFrames with identical schemas and column order, and duplicates are acceptable.
- Use `union().distinct()` when you need SQL `UNION` semantics (deduplicated union).
- Use `unionByName` when column order may differ between DataFrames. This is safer and more maintainable than relying on positional matching.
- Use `unionByName(..., allowMissingColumns=True)` when schemas are similar but not identical, and missing columns should be filled with nulls.
- Use `intersect` to find distinct common rows.
- Use `intersectAll` when duplicates matter and you need SQL `INTERSECT ALL` semantics.
- Use `except` or `subtract` to find distinct rows in the left DataFrame that are not in the right.
- Use `exceptAll` when duplicates matter and you need SQL `EXCEPT ALL` semantics.
- Always filter and select only the necessary columns before set operations to minimize shuffle and memory usage.
- After `union`, consider `coalesce()` or `repartition()` to control the number of output partitions, especially when writing to storage.
- When performance is critical, evaluate join-based alternatives: inner join plus `distinct` for `intersect`, and left anti join for `except`.

### Common Pitfalls and Limitations

- **`union` does not deduplicate.** Many developers expect `union` to behave like SQL `UNION`, but it behaves like `UNION ALL`. Use `distinct()` if deduplication is required.
- **Column order matters for positional operations.** `union`, `intersect`, and `except` match columns by position. If the column order differs, results can be incorrect. Use `unionByName` for union operations.
- **Schema mismatches.** Positional set operations require the same number of columns and compatible types. Incompatible types cause errors. `unionByName` with `allowMissingColumns=True` can handle missing columns but still requires compatible types for matching columns.
- **`intersect` and `except` remove duplicates by default.** If duplicates must be preserved, use `intersectAll` or `exceptAll`.
- **NULL handling.** Set operations treat `NULL` values as equal when comparing rows, following SQL semantics. This differs from joins, where `NULL` does not equal `NULL`.
- **Union in a loop can create a deep logical plan.** Chaining many `union` calls can lead to a long lineage and potential stack overflow or driver memory issues. Use `functools.reduce` or union multiple DataFrames in a single SQL statement when possible.
- **Shuffle cost.** `intersect`, `except`, and their `All` variants trigger a shuffle. On large datasets, this can be expensive. Tune `spark.sql.shuffle.partitions` and enable AQE to mitigate.

### Summary

PySpark set operations provide a declarative way to combine, compare, and filter rows across DataFrames. `union` and `unionByName` append data without deduplication, while `intersect`, `except`, and their `All` variants perform set comparisons that require shuffling. The choice of operation depends on whether duplicates should be preserved, how columns should be matched, and the performance characteristics of the underlying shuffle. By understanding the semantics, configuring shuffle partitions appropriately, and considering join-based alternatives when necessary, you can use set operations effectively in production PySpark workloads.

