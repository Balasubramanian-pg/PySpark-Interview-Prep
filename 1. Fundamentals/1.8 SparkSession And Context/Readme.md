# 1.8 SparkSession And Context

SparkSession and SparkContext are the entry points to Spark functionality. SparkContext is the original low-level entry point introduced with RDDs. SparkSession is the unified high-level entry point introduced in Spark 2.0. It wraps SparkContext and provides access to DataFrame, Dataset, and SQL APIs. Understanding both is essential for creating Spark applications, configuring them, and managing their lifecycle.

### 1.8.1 What is SparkSession?

SparkSession is the main entry point for Spark SQL and DataFrame/Dataset APIs. It was introduced in Spark 2.0 to unify SparkContext, SQLContext, and HiveContext into a single entry point. It allows you to create DataFrames, execute SQL, read and write data, register UDFs, and access the catalog.

Key capabilities:
- Create DataFrames from various sources.
- Execute SQL queries with `spark.sql()`.
- Access the catalog with `spark.catalog`.
- Configure runtime settings with `spark.conf`.
- Create and manage temporary views.
- Access the underlying SparkContext with `spark.sparkContext`.

Example:

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("MyApp").getOrCreate()
df = spark.range(10)
df.show()
spark.stop()
```

### 1.8.2 How do you create a SparkSession?

Use the builder pattern. The `getOrCreate()` method returns an existing SparkSession if one is already active, or creates a new one.

```python
from pyspark.sql import SparkSession

spark = (SparkSession.builder
         .appName("MyApp")
         .master("local[*]")
         .config("spark.sql.shuffle.partitions", "200")
         .config("spark.executor.memory", "4g")
         .enableHiveSupport()
         .getOrCreate())
```

Common builder methods:
- `appName(name)`: sets the application name shown in the Spark UI.
- `master(url)`: sets the cluster manager, such as `local[*]`, `yarn`, `k8s://...`.
- `config(key, value)`: sets a Spark configuration property.
- `enableHiveSupport()`: enables Hive metastore support.
- `getOrCreate()`: returns an existing session or creates a new one.

In cluster mode, `master` is usually set by `spark-submit` and should not be hardcoded.

### 1.8.3 What is SparkContext?

SparkContext is the original entry point to Spark functionality. It represents a connection to a Spark cluster and is responsible for:
- Creating RDDs.
- Creating broadcast variables and accumulators.
- Setting checkpoint directories.
- Submitting jobs to the cluster.
- Accessing the cluster manager and executor information.

There can be only one active SparkContext per JVM. If you try to create a second one, Spark throws an error unless you stop the first one.

Example:

```python
from pyspark import SparkContext

sc = SparkContext.getOrCreate()
rdd = sc.parallelize([1, 2, 3, 4])
result = rdd.map(lambda x: x * 2).collect()
print(result)
sc.stop()
```

In Spark 2.0 and later, you usually do not create SparkContext directly. Instead, create a SparkSession and access `spark.sparkContext`.

### 1.8.4 What is the relationship between SparkSession and SparkContext?

SparkSession wraps SparkContext. When you create a SparkSession, it internally creates or reuses a SparkContext. You can access it through `spark.sparkContext`.

```python
spark = SparkSession.builder.appName("MyApp").getOrCreate()
sc = spark.sparkContext
print(sc.appName)
```

SparkSession provides high-level APIs (DataFrames, SQL, Datasets), while SparkContext provides low-level APIs (RDDs, broadcast variables, accumulators). In modern Spark applications, you use SparkSession for most tasks and access SparkContext only when you need low-level control.

### 1.8.5 What are SQLContext and HiveContext?

SQLContext and HiveContext are legacy entry points from Spark 1.x. SQLContext provided access to Spark SQL and DataFrames. HiveContext extended SQLContext with Hive metastore support. In Spark 2.0 and later, both are replaced by SparkSession. You can still access SQLContext through `spark.sqlContext`, but it is not recommended for new code.

```python
sqlContext = spark.sqlContext
```

### 1.8.6 How do you configure SparkSession?

You can configure SparkSession at creation time using the builder, or at runtime using `spark.conf.set()`.

At creation:

```python
spark = (SparkSession.builder
         .appName("MyApp")
         .config("spark.sql.shuffle.partitions", "400")
         .config("spark.sql.adaptive.enabled", "true")
         .config("spark.executor.memory", "8g")
         .getOrCreate())
```

At runtime:

```python
spark.conf.set("spark.sql.shuffle.partitions", "400")
print(spark.conf.get("spark.sql.shuffle.partitions"))
```

Using SQL:

```python
spark.sql("SET spark.sql.shuffle.partitions=400")
```

Some configurations cannot be changed at runtime, such as executor memory or the number of executors. These must be set at application submission time.

### 1.8.7 How do you access SparkContext from SparkSession?

Use `spark.sparkContext`. This gives you access to RDD APIs, broadcast variables, accumulators, and checkpointing.

```python
sc = spark.sparkContext

# Create an RDD
rdd = sc.parallelize([1, 2, 3, 4, 5])

# Create a broadcast variable
lookup = sc.broadcast({"a": 1, "b": 2})

# Create an accumulator
counter = sc.accumulator(0)

# Set checkpoint directory
sc.setCheckpointDir("/checkpoint/dir")
```

### 1.8.8 How do you stop SparkSession or SparkContext?

Use `spark.stop()` to stop the SparkSession and its underlying SparkContext. This releases cluster resources and terminates the application.

```python
spark.stop()
```

If you created a SparkContext directly, you can stop it with `sc.stop()`. In most cases, `spark.stop()` is sufficient and recommended.

### 1.8.9 Common methods of SparkSession

- `spark.read`: returns a DataFrameReader for reading data.
- `df.write`: returns a DataFrameWriter for writing data.
- `spark.sql(query)`: executes a SQL query and returns a DataFrame.
- `spark.table(name)`: returns a DataFrame for a table or view.
- `spark.range(start, end, step, numPartitions)`: creates a DataFrame with a range of numbers.
- `spark.createDataFrame(data, schema)`: creates a DataFrame from a list or RDD.
- `spark.catalog`: access to the catalog, including tables, databases, and functions.
- `spark.conf`: runtime configuration.
- `spark.udf`: register user-defined functions.
- `spark.streams`: access to streaming queries.

Example:

```python
df = spark.read.parquet("/data/events")
df.createOrReplaceTempView("events")
result = spark.sql("SELECT count(*) FROM events")
result.show()
```

### 1.8.10 Best practices

- Use SparkSession.builder.getOrCreate() to avoid creating multiple sessions.
- Do not hardcode master or executor settings in production; pass them via spark-submit.
- Use `spark.conf.set()` for runtime configurations that support dynamic changes.
- Access SparkContext only when you need RDD-level APIs.
- Call `spark.stop()` at the end of the application to release resources.
- Avoid creating multiple SparkContexts. There can be only one active SparkContext per JVM.
- Use `enableHiveSupport()` only if you need Hive metastore integration.
- Keep configuration consistent across driver and executors.

### 1.8.11 Summary

SparkSession is the unified entry point for Spark SQL, DataFrames, and Datasets. It wraps SparkContext, which provides low-level RDD APIs. SparkSession is created using the builder pattern with `getOrCreate()`. SparkContext is accessed through `spark.sparkContext`. Use SparkSession for most tasks and SparkContext for RDD-level operations. Configure SparkSession at creation or runtime, and always stop it when done. Understanding both entry points is fundamental to writing and managing Spark applications.

Notebook link:
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.8%20SparkSession%20And%20Context
