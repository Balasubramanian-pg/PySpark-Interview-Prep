# 1.5 Basic Select And Filter

Select and filter are the two most fundamental operations in PySpark DataFrames. `select` chooses columns, and `filter` (or `where`) chooses rows. They are lazy transformations that build a plan without executing until an action is called. Understanding how to use them effectively is essential for every Spark job.

#### 1.5.1 What is select and how do you use it?

`select` returns a new DataFrame containing only the specified columns. You can pass column names as strings, Column objects, or expressions.

Basic usage with column names:

```python
df = spark.createDataFrame([(1, "Alice", 25), (2, "Bob", 30)], ["id", "name", "age"])
df_selected = df.select("name", "age")
df_selected.show()
```

Using Column objects:

```python
from pyspark.sql.functions import col
df_selected = df.select(col("name"), col("age"))
```

Using expressions:

```python
df_selected = df.select("name", (col("age") + 1).alias("age_plus_one"))
```

Selecting all columns:

```python
df.select("*")
```

Selecting with renaming:

```python
df.select(col("name").alias("full_name"), "age")
```

SQL equivalent:

```sql
SELECT name, age FROM table;
```

#### 1.5.2 What is filter and how do you use it?

`filter` returns a new DataFrame containing only the rows that satisfy a condition. `where` is an alias for `filter`; they are identical.

Basic usage with a string condition:

```python
df_filtered = df.filter("age > 25")
df_filtered.show()
```

Using Column objects:

```python
df_filtered = df.filter(col("age") > 25)
```

Using multiple conditions with `&` (and), `|` (or), `~` (not):

```python
df_filtered = df.filter((col("age") > 25) & (col("name") == "Bob"))
```

Using `isin`:

```python
df_filtered = df.filter(col("name").isin("Alice", "Bob"))
```

Using `isNull` / `isNotNull`:

```python
df_filtered = df.filter(col("age").isNotNull())
```

Using `like`:

```python
df_filtered = df.filter(col("name").like("A%"))
```

SQL equivalent:

```sql
SELECT * FROM table WHERE age > 25;
```

#### 1.5.3 What is the difference between filter and where?

There is no difference. `where` is simply an alias for `filter`. Both methods are available on DataFrame and return the same result.

```python
df.filter("age > 25")
df.where("age > 25")
```

In SQL, `WHERE` is the standard clause.

#### 1.5.4 How to use column expressions in select and filter

PySpark provides many functions in `pyspark.sql.functions` to build expressions. These can be used in both `select` and `filter`.

Common functions:
- `col("name")` or `df["name"]`: reference a column.
- `lit(value)`: literal value.
- `when(condition, value).otherwise(value)`: conditional logic.
- `upper(col("name"))`, `lower(col("name"))`: string case.
- `length(col("name"))`: string length.
- `substring(col("name"), 1, 3)`: substring.
- `round(col("age"), 1)`: rounding.
- `cast("int")`: type casting.

Example in select:

```python
from pyspark.sql.functions import upper, lit, when

df.select(
    upper(col("name")).alias("upper_name"),
    when(col("age") > 25, lit("senior")).otherwise(lit("junior")).alias("category")
).show()
```

Example in filter:

```python
df.filter(length(col("name")) > 3).show()
```

#### 1.5.5 Chaining select and filter

You can chain multiple transformations. Spark pipelines them into a single stage if they are narrow.

```python
result = (df
          .filter(col("age") > 20)
          .select("name", "age")
          .filter(col("name").startswith("A")))
result.show()
```

The order matters for performance. Filter early to reduce the number of rows before selecting columns. Select only the columns you need to reduce data size.

#### 1.5.6 Best practices

- Filter early: Apply filters before joins and aggregations to reduce data volume.
- Select only needed columns: Avoid `select("*")` in production; specify columns explicitly.
- Use Column objects for complex conditions: String conditions are parsed, but Column objects allow programmatic construction and are less error-prone.
- Use `where` and `filter` interchangeably.
- Avoid Python UDFs in filter when a built-in function exists. Built-in functions are optimized.
- Use `explain(True)` to verify predicate pushdown and column pruning are applied.

#### 1.5.7 Summary

`select` chooses columns, and `filter` (or `where`) chooses rows. Both are lazy transformations. Use Column expressions and built-in functions for complex logic. Chain them to build efficient pipelines. Filter early and select only necessary columns to reduce data volume. These basic operations form the foundation of every PySpark job.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.5%20Basic%20Select%20And%20Filter# 1.5 Basic Select And Filter

*(Brief explanation of the concept goes here)*

---

### 1.5.1 What is the difference between `select()` and `withColumn()`?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.2 How do you filter a DataFrame based on multiple conditions?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.3 Is there a performance difference between `filter()` and `where()`?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.4 How do you rename a column in a PySpark DataFrame?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.5 How do you drop one or multiple columns from a DataFrame?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.6 How do you check if a column exists in a DataFrame before selecting it?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.7 What is the difference between `col('name')` and `df['name']`?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

### 1.5.8 How do you conditionally create a new column using `when()` and `otherwise()`?

**Answer:**

*(Provide your answer, code snippets, and explanations here)*

---

