# 2.7 User Defined Functions (UDFs)

User Defined Functions (UDFs) allow you to extend PySpark's built-in functions with custom logic written in Python, Scala, or Java. They are essential when built-in functions cannot express a required transformation, but they come with significant performance overhead because they break the JVM's native execution and require serialization between the JVM and Python. Understanding when and how to use UDFs efficiently is a key skill for PySpark engineers.

### Types of UDFs in PySpark

PySpark supports several categories of UDFs, each with different performance characteristics:

| Type | Description | Performance |
|------|-------------|-------------|
| Python UDF (row-at-a-time) | Standard UDF that processes one row at a time. | Slow due to serialization and Python interpreter overhead. |
| Pandas UDF (vectorized) | Processes data in batches using Apache Arrow. | Much faster than row-at-a-time UDFs. |
| Scala/Java UDF | Written in JVM languages, registered for use in PySpark. | Fastest, but requires JVM expertise and separate build. |

### Creating and Registering UDFs

UDFs can be created using `pyspark.sql.functions.udf`, the `@udf` decorator, or registered for SQL using `spark.udf.register`.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import udf, col
from pyspark.sql.types import StringType, IntegerType

spark = SparkSession.builder.appName("UDFs").getOrCreate()

# Sample data
data = [("Alice", 30), ("Bob", 25), ("Charlie", 35)]
df = spark.createDataFrame(data, ["name", "age"])

# Method 1: Using udf() function
def greet(name):
    return f"Hello, {name}!"

greet_udf = udf(greet, StringType())
df.withColumn("greeting", greet_udf("name")).show()

# Method 2: Using @udf decorator
@udf(returnType=StringType())
def greet_decorator(name):
    return f"Hello, {name}!"

df.withColumn("greeting", greet_decorator("name")).show()

# Register for SQL
spark.udf.register("greet_sql", greet, StringType())
df.createOrReplaceTempView("people")
spark.sql("SELECT name, greet_sql(name) AS greeting FROM people").show()
```

SQL equivalent after registration:

```sql
SELECT name, greet_sql(name) AS greeting FROM people;
```

### Python UDFs (Row-at-a-Time)

Python UDFs process one row at a time. Each row is serialized from the JVM to Python, processed, and serialized back. This is extremely expensive for large datasets.

```python
# Example: Complex string manipulation not available in built-ins
@udf(returnType=StringType())
def parse_title(name):
    # Simulate complex logic
    return name.lower().replace(" ", "_")

df.withColumn("username", parse_title("name")).show()
```

### Pandas UDFs (Vectorized UDFs)

Pandas UDFs, introduced in Spark 2.3 and enhanced in Spark 3.x, use Apache Arrow to transfer data in batches. They operate on pandas Series or DataFrames and are significantly faster than row-at-a-time UDFs.

```python
import pandas as pd
from pyspark.sql.functions import pandas_udf
from pyspark.sql.types import DoubleType

# Series to Series Pandas UDF
@pandas_udf(DoubleType())
def add_tax(price: pd.Series) -> pd.Series:
    return price * 1.1

df_prices = spark.createDataFrame([(100.0,), (200.0,), (300.0,)], ["price"])
df_prices.withColumn("price_with_tax", add_tax("price")).show()
```

For aggregations, use a Pandas UDF with `GROUPED_AGG`:

```python
from pyspark.sql.functions import pandas_udf, PandasUDFType

@pandas_udf(DoubleType(), PandasUDFType.GROUPED_AGG)
def mean_udf(v: pd.Series) -> float:
    return v.mean()

df.groupBy("department").agg(mean_udf("salary").alias("avg_salary")).show()
```

In Spark 3.x, the `PandasUDFType` is optional; you can use `pandas_udf` with type hints and specify the function type via the `functionType` parameter. For grouped map operations, use `applyInPandas`.

### Performance Implications and Configuration

UDFs are a major performance bottleneck because they prevent Catalyst from optimizing the logic and require data movement between the JVM and Python.

| Factor | Python UDF | Pandas UDF |
|--------|------------|------------|
| Serialization | Row-by-row | Batch (Arrow) |
| Catalyst optimization | None | Limited |
| Speed | Slow | Fast |
| Memory | Low | Higher (batch size) |

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.execution.arrow.pyspark.enabled` | `true` (Spark 3.x) | Enables Arrow-based conversion for Pandas UDFs. |
| `spark.sql.execution.arrow.pyspark.fallback.enabled` | `true` | Falls back to non-Arrow if Arrow fails. |
| `spark.sql.execution.arrow.maxRecordsPerBatch` | `10000` | Max rows per Arrow batch. Tune for memory. |
| `spark.sql.legacy.allowUntypedScalaUDF` | `false` | Allows untyped Scala UDFs (legacy). |

Trade-offs:
- Built-in functions are always preferred. They are JVM-native and Catalyst-optimized.
- Python UDFs should be avoided on large datasets. If unavoidable, use them only on small DataFrames or after heavy filtering.
- Pandas UDFs are a good compromise when built-ins are insufficient but performance matters. They still have overhead but are an order of magnitude faster than Python UDFs.
- Scala/Java UDFs are the fastest but require compiling and packaging JARs.

### Best Practices and When to Use

- **Exhaust built-in functions first.** Most common transformations have optimized built-ins.
- **Use Pandas UDFs over Python UDFs** whenever possible, especially for numerical or vectorized operations.
- **Avoid UDFs in filters, joins, and groupBy keys.** These operations benefit greatly from Catalyst optimization, which UDFs bypass.
- **Type hints are mandatory for Pandas UDFs.** Incorrect type hints cause runtime errors.
- **Handle nulls explicitly.** UDFs do not automatically skip nulls; you must handle them inside the function.
- **Keep UDFs deterministic.** Nondeterministic UDFs can cause incorrect results in distributed settings.
- **Use `spark.udf.register` for SQL** when you need to use the function in SQL queries.
- **For grouped map operations**, use `applyInPandas` instead of a UDF, as it is designed for grouped transformations.
- **Monitor Arrow batch size.** Adjust `spark.sql.execution.arrow.maxRecordsPerBatch` to balance memory and throughput.

### Common Pitfalls and Limitations

- **Null handling**: Python UDFs receive `None` for null inputs. If not handled, they may throw exceptions. Pandas UDFs receive `NaN` for nulls, which can affect calculations.
- **Serialization errors**: Passing non-serializable objects (e.g., database connections) to UDFs causes failures.
- **Performance degradation**: A single UDF can turn a fast job into a slow one. Always benchmark.
- **Catalyst blindness**: UDFs are black boxes to the optimizer. Predicate pushdown, column pruning, and constant folding do not apply.
- **Memory pressure**: Pandas UDFs load entire batches into memory. Large batches or complex operations can cause `OutOfMemoryError`.
- **Type mismatches**: Returning a type different from the declared return type causes runtime errors or silent data corruption.
- **Arrow fallback**: If Arrow is disabled or fails, Pandas UDFs fall back to slower row-based execution. Check logs for fallback warnings.
- **Python version mismatch**: The Python version on the driver and executors must match for Pandas UDFs.
- **UDFs in SQL**: Registered UDFs are session-scoped and not available in other sessions.

### Summary

User Defined Functions extend PySpark's capabilities but come with significant performance costs. Python UDFs process row-by-row and are the slowest; Pandas UDFs use Arrow for vectorized execution and are much faster. Built-in functions should always be preferred. When UDFs are necessary, use Pandas UDFs, handle nulls carefully, avoid using them in critical operations like joins and filters, and tune Arrow batch sizes. Understanding these trade-offs is essential for writing efficient PySpark pipelines in Spark 3.x.
