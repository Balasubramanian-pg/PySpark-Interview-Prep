# 3.10 High Order Functions

High order functions in Spark SQL are built-in functions that operate on complex data types such as arrays and maps. They accept lambda expressions (anonymous functions) as arguments, allowing you to transform, filter, and aggregate nested data without exploding it into separate rows. They are part of the Spark SQL function library and are optimized by the Catalyst optimizer and Tungsten. Using high order functions is faster and more concise than using User Defined Functions (UDFs) or exploding and re-aggregating data.

### 3.10.1 What are High Order Functions and why are they useful

High order functions are functions that take one or more functions as arguments or return a function as a result. In Spark SQL, they are used to process arrays and maps directly. They let you express complex transformations on nested data in a single expression, avoiding the need to flatten and re-group the data.

Benefits:
- Performance: They are implemented natively in Spark and benefit from whole-stage code generation. They avoid the serialization overhead of Python UDFs.
- Conciseness: A single expression can replace multiple explode, groupBy, and collect_list operations.
- Readability: The intent of transforming or filtering an array is clear.
- No data explosion: You do not need to explode arrays into rows, which reduces shuffle and memory usage.

Common high order functions:
- `transform(array, lambda)` or `transform(array, (x, i) -> ...)`: applies a lambda to each element and returns a new array.
- `filter(array, lambda)`: returns a new array with elements that satisfy the predicate.
- `exists(array, lambda)`: returns true if any element satisfies the predicate.
- `forall(array, lambda)`: returns true if all elements satisfy the predicate.
- `aggregate(array, initial, merge, finish)`: reduces an array to a single value.
- `zip_with(array1, array2, lambda)`: combines two arrays element-wise using a lambda.
- `transform_values(map, lambda)`: applies a lambda to each value in a map.
- `transform_keys(map, lambda)`: applies a lambda to each key in a map.
- `map_filter(map, lambda)`: filters map entries based on a predicate.
- `map_zip_with(map1, map2, lambda)`: combines two maps by key.

### 3.10.2 How to use transform on an array

`transform` applies a lambda function to each element of an array and returns a new array of the same length. The lambda can take one argument (the element) or two arguments (the element and its index).

Example: multiply each element by 2.

```python
from pyspark.sql.functions import transform, col

df = spark.createDataFrame([(1, [1, 2, 3]), (2, [4, 5, 6])], ["id", "numbers"])
df.select("id", transform(col("numbers"), lambda x: x * 2).alias("doubled")).show()
```

Output:
```
+---+---------+
| id|  doubled|
+---+---------+
|  1|[2, 4, 6]|
|  2|[8,10,12]|
+---+---------+
```

Example with index: add the index to each element.

```python
df.select("id", transform(col("numbers"), lambda x, i: x + i).alias("indexed")).show()
```

### 3.10.3 How to use filter on an array

`filter` returns a new array containing only the elements that satisfy the given predicate.

Example: keep only even numbers.

```python
from pyspark.sql.functions import filter, col

df.select("id", filter(col("numbers"), lambda x: x % 2 == 0).alias("evens")).show()
```

Output:
```
+---+------+
| id| evens|
+---+------+
|  1|   [2]|
|  2|[4, 6]|
+---+------+
```

### 3.10.4 How to use exists and forall

`exists` returns true if at least one element satisfies the predicate. `forall` returns true if all elements satisfy the predicate.

Example: check if any element is greater than 2, and if all elements are positive.

```python
from pyspark.sql.functions import exists, forall, col

df.select(
    "id",
    exists(col("numbers"), lambda x: x > 2).alias("any_gt_2"),
    forall(col("numbers"), lambda x: x > 0).alias("all_positive")
).show()
```

Output:
```
+---+---------+------------+
| id|any_gt_2 |all_positive|
+---+---------+------------+
|  1|     true|        true|
|  2|     true|        true|
+---+---------+------------+
```

### 3.10.5 How to use aggregate

`aggregate` reduces an array to a single value. It takes an initial value, a merge function that combines the accumulator with each element, and an optional finish function that transforms the final accumulator.

Example: sum all elements in the array.

```python
from pyspark.sql.functions import aggregate, col

df.select("id", aggregate(col("numbers"), lit(0), lambda acc, x: acc + x).alias("sum")).show()
```

Output:
```
+---+---+
| id|sum|
+---+---+
|  1|  6|
|  2| 15|
+---+---+
```

Example with a finish function: compute the average.

```python
from pyspark.sql.functions import aggregate, lit, col

df.select(
    "id",
    aggregate(
        col("numbers"),
        (lit(0), lit(0)),  # (sum, count)
        lambda acc, x: (acc[0] + x, acc[1] + 1),
        lambda acc: acc[0] / acc[1]
    ).alias("average")
).show()
```

### 3.10.6 How to use zip_with

`zip_with` combines two arrays element-wise using a lambda. The two arrays must have the same length.

Example: add corresponding elements of two arrays.

```python
from pyspark.sql.functions import zip_with, col

df = spark.createDataFrame([
    (1, [1, 2, 3], [10, 20, 30]),
    (2, [4, 5, 6], [40, 50, 60])
], ["id", "a", "b"])

df.select("id", zip_with(col("a"), col("b"), lambda x, y: x + y).alias("summed")).show()
```

Output:
```
+---+-----------+
| id|     summed|
+---+-----------+
|  1|[11, 22, 33]|
|  2|[44, 55, 66]|
+---+-----------+
```

### 3.10.7 How to use high order functions on maps

Spark provides `transform_values`, `transform_keys`, `map_filter`, and `map_zip_with` for maps.

Example: transform values in a map.

```python
from pyspark.sql.functions import transform_values, col

df = spark.createDataFrame([
    (1, {"a": 1, "b": 2}),
    (2, {"c": 3, "d": 4})
], ["id", "map_col"])

df.select("id", transform_values(col("map_col"), lambda k, v: v * 10).alias("new_map")).show()
```

Output:
```
+---+----------------+
| id|         new_map|
+---+----------------+
|  1|{a: 10, b: 20}  |
|  2|{c: 30, d: 40}  |
+---+----------------+
```

Example: filter map entries.

```python
from pyspark.sql.functions import map_filter, col

df.select("id", map_filter(col("map_col"), lambda k, v: v > 1).alias("filtered")).show()
```

### 3.10.8 High Order Functions vs Explode and UDFs

Using high order functions is generally preferred over exploding arrays into rows or using UDFs.

Explode approach:
- Explodes the array into multiple rows.
- Requires groupBy and collect_list to reconstruct the array.
- Causes a shuffle and increases data size.
- More complex and less efficient.

UDF approach:
- Requires serialization between JVM and Python.
- Does not benefit from Catalyst optimization.
- Slower for large datasets.

High order function approach:
- Single expression, no shuffle.
- Native implementation, code-generated.
- Faster and more concise.

Example comparison: multiply each element by 2.

Explode and collect_list:
```python
from pyspark.sql.functions import explode, collect_list, col

df.select("id", explode("numbers").alias("num")) \
  .withColumn("num", col("num") * 2) \
  .groupBy("id").agg(collect_list("num").alias("doubled")) \
  .show()
```

High order function:
```python
df.select("id", transform(col("numbers"), lambda x: x * 2).alias("doubled")).show()
```

The high order function version is simpler and avoids the shuffle.

### 3.10.9 Common Pitfalls and Limitations

- Lambda syntax: In PySpark, lambdas are written with `lambda x: ...`. In SQL, use `x -> ...` or `(x, i) -> ...`. Ensure the correct syntax for your API.
- Null handling: If the array is null, the result is null. If an element is null, the lambda may need to handle it. Use `coalesce` or check for null.
- Array length: `zip_with` requires both arrays to have the same length. If they differ, the result is null.
- Type inference: The return type of the lambda must be compatible with Spark's type system. In some cases, you may need to cast the result.
- Nested arrays: High order functions can be nested, but deeply nested expressions can become hard to read. Consider breaking them into steps.
- Performance: While high order functions are faster than UDFs, they still operate on arrays that must fit in memory. Very large arrays can cause memory pressure.

### 3.10.10 Summary

High order functions in Spark SQL allow you to transform, filter, and aggregate arrays and maps using lambda expressions. They are natively implemented, benefit from Catalyst optimization, and avoid the overhead of exploding data or using Python UDFs. Common functions include `transform`, `filter`, `exists`, `forall`, `aggregate`, `zip_with`, `transform_values`, `transform_keys`, `map_filter`, and `map_zip_with`. Use them to process nested data efficiently and concisely. Always prefer high order functions over explode-and-collect or UDFs when the operation can be expressed as a lambda on an array or map.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.10%20High%20Order%20Functions
