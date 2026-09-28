# 1.6 Handling Nulls And Missing Data

Nulls and missing data are common in real-world datasets. In Spark, null represents a missing or unknown value. Handling nulls correctly is essential for accurate analysis and to avoid unexpected results in aggregations, joins, and comparisons. PySpark provides a variety of functions to detect, drop, fill, and replace nulls.

#### 1.6.1 What are nulls and missing data?

In Spark, a null is a special value that indicates the absence of a value. It is not the same as an empty string or zero. Nulls can appear in any column that allows them. Missing data can also be represented by sentinel values such as "N/A", "unknown", -1, or 0, which are not null but should be treated as missing.

Nulls propagate through most operations. For example, any arithmetic operation involving null returns null. Comparisons with null return null (which is treated as false in filters). Aggregations like sum, avg, and count ignore nulls by default, but count(*) includes rows with nulls.

#### 1.6.2 How to detect nulls

Use `isNull()` and `isNotNull()` to check for nulls.

```python
from pyspark.sql.functions import col

df = spark.createDataFrame([(1, "Alice", 25), (2, None, 30), (3, "Bob", None)], ["id", "name", "age"])

# Rows where name is null
df.filter(col("name").isNull()).show()

# Rows where age is not null
df.filter(col("age").isNotNull()).show()
```

In SQL:

```sql
SELECT * FROM table WHERE name IS NULL;
SELECT * FROM table WHERE age IS NOT NULL;
```

#### 1.6.3 How to drop nulls

`dropna()` removes rows that contain nulls. You can specify how and which columns to consider.

```python
# Drop rows with any null
df.dropna().show()

# Drop rows where all values are null
df.dropna(how="all").show()

# Drop rows where any of the specified columns are null
df.dropna(subset=["name", "age"]).show()

# Drop rows with fewer than 2 non-null values
df.dropna(thresh=2).show()
```

Parameters:
- `how`: "any" (default) or "all".
- `thresh`: minimum number of non-null values required to keep the row.
- `subset`: list of columns to consider.

#### 1.6.4 How to fill nulls

`fillna()` replaces nulls with specified values. You can fill all columns with the same value or specify a dictionary for different columns.

```python
# Fill all nulls with 0
df.fillna(0).show()

# Fill nulls with different values per column
df.fillna({"name": "Unknown", "age": 0}).show()

# Fill only specific columns
df.fillna("Unknown", subset=["name"]).show()
```

In SQL, use `COALESCE` or `IFNULL`:

```sql
SELECT COALESCE(name, 'Unknown') AS name, COALESCE(age, 0) AS age FROM table;
```

#### 1.6.5 How to replace values

`replace()` replaces specific values with new ones. It can also replace nulls if you pass `None` as the value to replace.

```python
# Replace "N/A" with null
df.replace("N/A", None).show()

# Replace multiple values
df.replace({"N/A": None, "unknown": None}).show()

# Replace numeric sentinel values
df.replace(-1, None, subset=["age"]).show()
```

#### 1.6.6 Using coalesce and when/otherwise

`coalesce()` returns the first non-null value from a list of columns. It is useful for combining columns or providing default values.

```python
from pyspark.sql.functions import coalesce, lit

# Use age if not null, otherwise 0
df.select("id", coalesce(col("age"), lit(0)).alias("age_filled")).show()

# Combine two columns
df.select(coalesce(col("name"), col("nickname"), lit("Unknown")).alias("display_name")).show()
```

`when()` and `otherwise()` provide conditional logic.

```python
from pyspark.sql.functions import when

df.select(
    "id",
    when(col("age").isNull(), 0).otherwise(col("age")).alias("age_filled")
).show()
```

#### 1.6.7 Null handling in aggregations and joins

Aggregations: Most aggregate functions ignore nulls. For example, `sum`, `avg`, `min`, `max` skip nulls. `count(col)` counts non-null values, while `count("*")` counts all rows.

```python
df.agg(sum("age").alias("sum_age"), count("age").alias("count_age")).show()
```

Joins: In a join, null keys do not match anything. If you join on a column with nulls, those rows will not be included in an inner join. For outer joins, nulls are preserved on the preserved side.

```python
df1.join(df2, "id", "inner")  # rows with null id are dropped
```

To handle nulls in joins, you may need to fill them with a sentinel value before joining, or use a condition that explicitly handles nulls.

#### 1.6.8 Best practices

- Understand your data: Know which columns can be null and how nulls should be treated.
- Use explicit checks: Prefer `isNull()` and `isNotNull()` over comparing to `None`.
- Fill or drop nulls early: Decide on a strategy before aggregations and joins.
- Be careful with sentinel values: Replace sentinel values like "N/A" or -1 with null if they represent missing data.
- Use `coalesce` for default values: It is concise and handles multiple columns.
- Test null handling: Nulls can cause unexpected results in filters and joins. Always test with sample data.
- Use `dropna` and `fillna` with subset: Avoid dropping or filling columns unintentionally.
- For aggregations, remember that nulls are ignored. Use `count("*")` for total row count and `count(col)` for non-null count.

#### 1.6.9 Summary

Handling nulls and missing data is a critical part of data preparation in PySpark. Use `isNull` and `isNotNull` to detect nulls, `dropna` to remove rows, `fillna` to replace nulls with default values, and `replace` to convert sentinel values to null. Use `coalesce` and `when/otherwise` for conditional filling. Be aware of how nulls behave in aggregations and joins. Always validate your null handling strategy to ensure accurate results.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.6%20Handling%20Nulls%20And%20Missing%20Data
