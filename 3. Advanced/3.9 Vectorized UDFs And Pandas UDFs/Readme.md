# 3.9 Vectorized UDFs And Pandas UDFs

PySpark provides several mechanisms for executing custom Python logic on distributed data. The most performant of these are Vectorized UDFs, commonly known as Pandas UDFs, which process data in batches using Apache Arrow and pandas rather than row by row. This section covers what they are, how they work, their types, performance characteristics, limitations, and best practices.

### 3.9.1 What are Vectorized UDFs (Pandas UDFs)

A Pandas UDF, also known as a vectorized UDF, is a user-defined function that uses Apache Arrow to transfer data between the JVM and Python processes, and uses pandas to operate on the data in vectorized batches. Instead of processing one row at a time, Spark splits the data into batches of rows, calls the Python function for each batch, and then concatenates the results.

Pandas UDFs are defined using the `pandas_udf` decorator and wrapped with a Python type hint. They can increase performance up to 100x compared to row-at-a-time Python UDFs. This performance gain comes from two sources: the reduction in serialization and deserialization overhead due to Arrow's columnar format, and the ability to use vectorized operations from pandas and NumPy that operate on entire columns at once.

**Basic example of a Series to Series Pandas UDF:**

```python
import pandas as pd
from pyspark.sql.functions import col, pandas_udf
from pyspark.sql.types import LongType

def multiply_func(a: pd.Series, b: pd.Series) -> pd.Series:
    return a * b

multiply = pandas_udf(multiply_func, returnType=LongType())

df = spark.createDataFrame([(1, 2), (3, 4), (5, 6)], ["a", "b"])
df.select(multiply(col("a"), col("b"))).show()
```

### 3.9.2 Why are Pandas UDFs faster than regular Python UDFs

Regular Python UDFs process data one row at a time. Each row must be serialized with pickle or cloudpickle, sent from the JVM to a Python worker process, deserialized, processed, serialized again, and sent back to the JVM. This per-row serialization and deserialization is the primary performance bottleneck.

Pandas UDFs eliminate this bottleneck by using Apache Arrow, a standardized cross-language columnar in-memory data representation. Arrow allows data to be transferred between the JVM and Python in batches without the expensive per-row pickling. The data is already in a columnar format that pandas and NumPy can process efficiently. Vectorized operations then apply a single function call to an entire column rather than iterating over each row, which leverages CPU-level parallelism and optimized native libraries.

The performance difference is substantial. Benchmarks show vectorized Python UDFs can be up to 5.76x faster than scalar Python UDFs in native execution engines, and in some workloads the improvement can reach 100x.

**Comparison summary:**

| Aspect | Scalar Python UDF | Pandas UDF |
|---|---|---|
| Processing model | Row by row | Batch (vectorized) |
| Serialization | Pickle/cloudpickle per row | Apache Arrow batches |
| Performance | Baseline | Up to 100x faster |
| Data format | Python objects | pandas Series/DataFrame |
| Catalyst optimization | Broken | Better integration |

### 3.9.3 What are the types of Pandas UDFs

Pandas UDFs are categorized by their input and output types. The main types are Series to Series, Series to Scalar, Iterator of Series to Iterator of Series, and Iterator of Multiple Series to Iterator of Series.

**Series to Series UDF**

This is the most common type. It takes one or more pandas Series as input and returns a pandas Series of the same length. It is used with `select` and `withColumn` for vectorized scalar operations. The type hint is `pandas.Series -> pandas.Series` or `Tuple[pandas.Series, ...] -> pandas.Series`.

```python
import pandas as pd
from pyspark.sql.functions import pandas_udf
from pyspark.sql.types import LongType

@pandas_udf(LongType())
def multiply(a: pd.Series, b: pd.Series) -> pd.Series:
    return a * b

df.select(multiply(col("a"), col("b"))).show()
```

**Iterator of Series to Iterator of Series UDF**

This type takes an iterator of batches and returns an iterator of output batches. The length of the entire output must match the length of the entire input. It can only take a single Spark column as input, whereas the Series to Series UDF can take multiple columns. The type hint is `Iterator[pandas.Series] -> Iterator[pandas.Series]`.

This type is useful when the UDF execution requires initializing some state, such as loading a machine learning model file once and applying inference to every input batch.

```python
from typing import Iterator
import pandas as pd
from pyspark.sql.functions import pandas_udf

@pandas_udf("long")
def plus_one(iterator: Iterator[pd.Series]) -> Iterator[pd.Series]:
    for s in iterator:
        yield s + 1

df.select(plus_one(col("x"))).show()
```

**Series to Scalar UDF**

This type takes one or more pandas Series as input and returns a scalar value. It is used with `groupBy().agg()` and is similar to an aggregation function. The type hint is `pandas.Series -> Any` or `Tuple[pandas.Series, ...] -> Any`.

```python
import pandas as pd
from pyspark.sql.functions import pandas_udf

@pandas_udf("double")
def mean_udf(v: pd.Series) -> float:
    return v.mean()

df.groupBy("group").agg(mean_udf(df["value"])).show()
```

**Iterator of Multiple Series to Iterator of Series UDF**

This is a variation that takes an iterator of tuples of pandas Series and returns an iterator of pandas Series. It allows multiple input columns with iterator-based processing. The type hint is `Iterator[Tuple[pandas.Series, ...]] -> Iterator[pandas.Series]`.

### 3.9.4 How does Apache Arrow optimize Pandas UDFs

Apache Arrow is a cross-language development platform for in-memory columnar data. It provides a standardized memory format that allows different systems to share data without serialization and deserialization overhead. Pandas UDFs use Arrow to transfer data between the JVM and Python processes.

The optimization works as follows:

1. JVM to Python transfer: Data is stored in Arrow's columnar format on the JVM side. It is sent to the Python worker as Arrow record batches without per-row serialization.
2. Python processing: The Arrow data is converted to pandas Series or DataFrames. In some cases, zero-copy conversion is possible, meaning the pandas object shares the same memory as the Arrow data. However, columns with NULL values trigger deep copies.
3. Python to JVM return: The result pandas Series or DataFrame is converted back to Arrow format and sent to the JVM.

This process avoids the traditional pickle-based serialization that scalar Python UDFs rely on. The result is faster data exchange, lower memory usage, and better CPU utilization.

**Arrow optimization configuration:**

```python
spark.conf.set("spark.sql.execution.arrow.pyspark.enabled", "true")
```

This configuration enables Arrow-based conversion for `toPandas()` and `createDataFrame()`, and it is also relevant for Pandas UDF performance.

**Advanced: Arrow UDFs**

A newer advancement is native Arrow UDFs, which operate directly on Arrow data without converting to pandas or NumPy. This eliminates the pandas/Arrow conversion overhead entirely. Benchmarks show Arrow UDFs are approximately 10% faster and use about 40% less memory than Pandas UDFs, with better support for complex data types. Arrow UDFs use the `@arrow_udf` decorator and work with `pyarrow.Array` objects.

```python
import pyarrow as pa
from pyspark.sql.functions import arrow_udf

@arrow_udf("long")
def multiply_arrow_func(a, b):
    return pa.compute.multiply(a, b)
```

### 3.9.5 What are the limitations of Pandas UDFs

Pandas UDFs have several important limitations that developers must understand.

**Mutation of input is not allowed.** The input pandas Series or DataFrame must not be mutated. Functions that mutate the passed object can produce unexpected behavior or errors and are not supported. Users should also not rely on the index of the input Series, as it may not be preserved.

**Single-column input for iterator UDFs.** The Iterator of Series to Iterator of Series UDF can only take a single Spark column as input. To process multiple columns with iterator-based logic, you must use Iterator of Multiple Series to Iterator of Series, which takes an iterator of tuples of pandas Series.

**All columns are converted, even unused ones.** When executing a scalar Pandas UDF, PySpark currently converts all Arrow columns to pandas Series, even if the UDF only uses a subset of columns. This is wasteful when working with wide DataFrames where the UDF needs only a few columns.

**Limited support for complex types.** Pandas UDFs have limited support for complex data types. For example, nested StructType instances are not supported for the output type with aggregation use cases. BinaryType is also not supported in Pandas UDFs.

**Size limitations.** There are known issues with Pandas UDFs for datasets where any group is larger than 2 GB, due to int32 buffer length limitations in the Arrow-Java integration.

**No conditional expressions or short-circuiting.** Pandas UDFs do not support conditional expressions or short-circuiting in boolean expressions. All branches are executed internally.

**Aggregations and filters are not supported in some contexts.** When using Pandas UDFs in certain frameworks like Hamilton, only map operations are supported. Aggregations and filters are not supported in that context.

**Breaks Catalyst optimization in some cases.** Python UDFs, including Pandas UDFs, can break Catalyst optimization and predicate pushdown. Spark cannot optimize through a Python UDF, so filters and column pruning may not be pushed down as effectively.

### 3.9.6 When should you use Pandas UDFs over regular UDFs

**Use Pandas UDFs when:**

- The logic can be expressed as a vectorized operation on pandas Series or DataFrames. This includes mathematical operations, string manipulation, and date operations that have pandas equivalents.
- You are processing large volumes of data and per-row Python UDF overhead is a bottleneck.
- You need to leverage Python libraries such as NumPy, SciPy, or scikit-learn that operate on arrays or DataFrames.
- You need to initialize expensive state once per batch, such as loading a machine learning model. Use the Iterator of Series to Iterator of Series type for this.

**Use regular scalar Python UDFs when:**

- The logic is simple and cannot be vectorized.
- The data volume is small and the overhead of per-row processing is acceptable.
- You need to process complex data types that are not well supported by Pandas UDFs.
- You are debugging and simplicity is more important than performance.

**Use built-in Spark SQL functions when possible:**

- Built-in functions are always faster than any UDF because they are implemented in Scala and benefit from Catalyst optimization and whole-stage code generation.
- Before writing a UDF, check whether an equivalent function exists in `pyspark.sql.functions`.

**Use native Arrow UDFs when:**

- You need the highest performance and lowest memory usage.
- You are working with complex data types that Pandas UDFs do not support well.
- You are on a platform that supports Arrow UDFs (Databricks Runtime 18.0+).

### 3.9.7 What are the best practices for Pandas UDFs

**Prefer built-in functions over UDFs.** Always check whether a built-in Spark SQL function can accomplish the task. Built-in functions benefit from Catalyst optimization and are significantly faster.

**Keep batch sizes reasonable.** The batch size is controlled by `spark.sql.execution.arrow.maxRecordsPerBatch` (default 10,000). For wide DataFrames or large rows, reduce this value to avoid out-of-memory errors on the Python worker. For narrow DataFrames, you can increase it to reduce per-batch overhead.

**Avoid mutating inputs.** Never modify the input pandas Series or DataFrame. Always return a new object. Mutation can produce incorrect results and is not supported.

**Use type hints correctly.** Always wrap the function with the correct Python type hint. For Series to Series, use `pandas.Series -> pandas.Series`. For iterator UDFs, use `Iterator[pandas.Series] -> Iterator[pandas.Series]`. Incorrect type hints will cause runtime errors.

**Handle nulls explicitly.** Pandas UDFs receive pandas Series that may contain NaN or None values. Handle them appropriately in your function to avoid unexpected behavior.

**Use iterator UDFs for expensive initialization.** If your UDF needs to load a model or initialize a large data structure, use the Iterator of Series to Iterator of Series type so the initialization happens once per batch rather than once per row.

**Monitor Python worker memory.** Pandas UDFs run in Python worker processes. If your batches are too large or your logic allocates too much memory, the worker can run out of memory and crash. Monitor the Spark UI for Python worker memory usage and adjust batch sizes accordingly.

**Enable Arrow optimization globally.** Set `spark.sql.execution.arrow.pyspark.enabled` to `true` to ensure Arrow is used for all conversions between JVM and Python.

**Consider native Arrow UDFs for new projects.** If you are on a supported platform and need maximum performance, native Arrow UDFs eliminate the pandas conversion overhead entirely and provide better complex type support.

**Test with local pandas data first.** A Pandas UDF function should be able to execute with local pandas data. Test it in a pure Python environment before running it on a Spark cluster. This simplifies debugging and ensures the logic is correct.

**Example of a well-structured Pandas UDF:**

```python
import pandas as pd
from typing import Iterator
from pyspark.sql.functions import pandas_udf

@pandas_udf("double")
def normalize(iterator: Iterator[pd.Series]) -> Iterator[pd.Series]:
    # Initialize state once per batch iterator
    for s in iterator:
        # Handle nulls explicitly
        mean = s.mean()
        std = s.std()
        if std == 0:
            yield s * 0.0
        else:
            yield (s - mean) / std
```

**Summary**

Vectorized UDFs, also known as Pandas UDFs, use Apache Arrow to transfer data in batches and pandas to perform vectorized operations. They can be up to 100x faster than scalar Python UDFs by eliminating per-row serialization overhead and leveraging native vectorized libraries. The main types are Series to Series, Series to Scalar, and Iterator of Series to Iterator of Series. Pandas UDFs have limitations including no input mutation, limited complex type support, and potential Catalyst optimization issues. Use them when logic can be vectorized and data volume is large. Prefer built-in functions when possible. For maximum performance, consider native Arrow UDFs which eliminate the pandas conversion overhead.

Notebook link:
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.9%20Vectorized%20UDFs%20And%20Pandas%20UDFs
