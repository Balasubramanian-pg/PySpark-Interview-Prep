# 1.2 RDD Vs DataFrame Vs Dataset

Spark provides three main data abstractions: RDD, DataFrame, and Dataset. Each has different levels of type safety, optimization, and performance. Understanding their differences is essential for choosing the right API for a given task.

**RDD (Resilient Distributed Dataset)**

An RDD is the original, low-level data abstraction in Spark. It is a fault-tolerant, immutable, distributed collection of objects. RDDs provide fine-grained control over data processing but do not benefit from Spark's optimizer.

Characteristics:
- Type-safe at compile time in Scala and Java. In Python, types are dynamic.
- No schema. Each element is a Java/Python object.
- No Catalyst optimization or Tungsten code generation.
- Serialization is manual or using Java/Kryo serialization.
- Supports a wide range of transformations and actions: `map`, `filter`, `flatMap`, `reduceByKey`, `groupByKey`, `join`, etc.
- Best for unstructured data, low-level control, and custom partitioning.

Example in PySpark:

```python
rdd = sc.parallelize([1, 2, 3, 4, 5])
rdd_filtered = rdd.filter(lambda x: x > 2)
rdd_mapped = rdd_filtered.map(lambda x: x * 2)
result = rdd_mapped.collect()  # [6, 8, 10]
```

**DataFrame**

A DataFrame is a distributed collection of data organized into named columns. It is conceptually equivalent to a table in a relational database. DataFrames are built on top of RDDs but use Catalyst and Tungsten for optimization.

Characteristics:
- Schema-based. Columns have names and data types.
- Not type-safe at compile time. Errors are caught at runtime.
- Benefits from Catalyst optimizer: predicate pushdown, column pruning, join reordering, constant folding.
- Benefits from Tungsten: whole-stage code generation, binary processing, cache-aware computation.
- API: `select`, `filter`, `groupBy`, `agg`, `join`, `withColumn`, etc.
- Can be created from RDDs, files, databases, or other DataFrames.
- Supported in Python, Scala, Java, and R.

Example in PySpark:

```python
df = spark.createDataFrame([(1, "a"), (2, "b"), (3, "c")], ["id", "name"])
df_filtered = df.filter(df.id > 1)
df_selected = df_filtered.select("name")
df_selected.show()
```

**Dataset**

A Dataset is a type-safe, object-oriented API introduced in Spark 1.6. It combines the benefits of RDDs (type safety) and DataFrames (optimization). Datasets are only available in Scala and Java, not Python or R. In Python, a DataFrame is essentially a Dataset of Row objects, but type safety is not enforced at compile time.

Characteristics:
- Type-safe at compile time in Scala and Java.
- Schema-based, like DataFrames.
- Benefits from Catalyst and Tungsten.
- API is a combination of RDD-like methods (`map`, `filter`, `flatMap`) and DataFrame-like methods (`select`, `groupBy`, `join`).
- Uses encoders to convert JVM objects to Spark's internal binary format.
- Best for strongly typed data and complex object transformations in Scala/Java.

Example in Scala:

```scala
case class Person(name: String, age: Int)
val ds = spark.read.json("people.json").as[Person]
ds.filter(_.age > 30).map(p => p.name).show()
```

**Key Differences**

| Aspect | RDD | DataFrame | Dataset |
|---|---|---|---|
| Type safety | Compile-time in Scala/Java | Runtime only | Compile-time in Scala/Java |
| Schema | No | Yes | Yes |
| Optimization | None | Catalyst + Tungsten | Catalyst + Tungsten |
| Serialization | Java/Kryo | Tungsten binary | Encoders |
| API level | Low-level | High-level | High-level + typed |
| Performance | Slowest | Fastest | Fast (slightly slower than DataFrame due to type conversion) |
| Languages | Python, Scala, Java, R | Python, Scala, Java, R | Scala, Java only |
| Use case | Unstructured data, low-level control | Structured data, SQL-like operations | Strongly typed structured data in Scala/Java |

**Performance Comparison**

DataFrames and Datasets are generally faster than RDDs because of Catalyst and Tungsten. Catalyst optimizes the query plan, and Tungsten generates efficient bytecode. RDDs do not have these optimizations, so they often require manual tuning.

However, for very simple operations, the difference may be small. For complex operations like joins and aggregations, DataFrames and Datasets are significantly faster.

**When to use which**

Use RDD when:
- You need fine-grained control over partitioning and data placement.
- You are working with unstructured data such as text or binary.
- You need to use low-level transformations not available in DataFrames.
- You are maintaining legacy code.

Use DataFrame when:
- You are working with structured or semi-structured data.
- You want the best performance through Catalyst and Tungsten.
- You prefer a SQL-like API.
- You are using Python or R, where Dataset is not available.

Use Dataset when:
- You are using Scala or Java.
- You need compile-time type safety.
- You want the performance benefits of Catalyst and Tungsten with typed objects.
- You are performing complex object transformations.

**Converting between RDD, DataFrame, and Dataset**

RDD to DataFrame:
```python
from pyspark.sql import Row
rdd = sc.parallelize([(1, "a"), (2, "b")])
df = rdd.toDF(["id", "name"])
```

DataFrame to RDD:
```python
rdd = df.rdd
```

DataFrame to Dataset (Scala):
```scala
val ds = df.as[Person]
```

Dataset to DataFrame (Scala):
```scala
val df = ds.toDF()
```

**Summary**

RDD is the low-level, type-safe but unoptimized abstraction. DataFrame is the high-level, schema-based, optimized abstraction but not type-safe at compile time. Dataset combines type safety with optimization but is only available in Scala and Java. In Python, DataFrame is the primary API. For most modern Spark workloads, DataFrames and Datasets are preferred over RDDs due to their performance and ease of use. Use RDDs only when you need low-level control or are working with unstructured data.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.2%20RDD%20Vs%20DataFrame%20Vs%20Dataset
