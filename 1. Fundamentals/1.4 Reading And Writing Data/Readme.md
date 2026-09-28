# 1.4 Reading And Writing Data

Reading and writing data is a core operation in every Spark application. Spark provides a unified API to read from and write to many data sources, including files (CSV, JSON, Parquet, ORC, text), databases (JDBC), and data warehouses. Understanding the available formats, options, and best practices helps you build efficient and reliable pipelines.

### 1.4.1 How to read data in PySpark

The primary entry point for reading data is `SparkSession.read`. It returns a `DataFrameReader` that you configure with format, options, and schema, then call `load()` or a format-specific method.

**Reading CSV**

```python
df = (spark.read
      .format("csv")
      .option("header", "true")
      .option("inferSchema", "true")
      .option("delimiter", ",")
      .load("/path/to/file.csv"))
```

Shortcut:
```python
df = spark.read.csv("/path/to/file.csv", header=True, inferSchema=True)
```

**Reading JSON**

```python
df = spark.read.json("/path/to/file.json")
```

**Reading Parquet**

```python
df = spark.read.parquet("/path/to/file.parquet")
```

**Reading ORC**

```python
df = spark.read.orc("/path/to/file.orc")
```

**Reading text**

```python
df = spark.read.text("/path/to/file.txt")
```

**Reading from JDBC**

```python
df = (spark.read
      .format("jdbc")
      .option("url", "jdbc:postgresql://host:5432/db")
      .option("dbtable", "schema.table")
      .option("user", "user")
      .option("password", "pass")
      .load())
```

**Reading with schema**

For production, avoid `inferSchema` because it requires an extra pass over the data. Define an explicit schema.

```python
from pyspark.sql.types import StructType, StructField, StringType, IntegerType

schema = StructType([
    StructField("id", IntegerType(), True),
    StructField("name", StringType(), True)
])

df = spark.read.csv("/path/to/file.csv", header=True, schema=schema)
```

### 1.4.2 How to write data in PySpark

Writing is done through `DataFrame.write`, which returns a `DataFrameWriter`. You specify format, mode, options, and partitioning.

**Write modes**

- `append`: Add to existing data.
- `overwrite`: Replace existing data.
- `ignore`: Do nothing if data exists.
- `error` or `errorifexists` (default): Throw an error if data exists.

**Writing CSV**

```python
(df.write
   .mode("overwrite")
   .option("header", "true")
   .csv("/path/to/output"))
```

**Writing JSON**

```python
df.write.mode("overwrite").json("/path/to/output")
```

**Writing Parquet**

```python
df.write.mode("overwrite").parquet("/path/to/output")
```

**Writing ORC**

```python
df.write.mode("overwrite").orc("/path/to/output")
```

**Writing to JDBC**

```python
(df.write
   .mode("append")
   .format("jdbc")
   .option("url", "jdbc:postgresql://host:5432/db")
   .option("dbtable", "schema.table")
   .option("user", "user")
   .option("password", "pass")
   .save())
```

### 1.4.3 Partitioning on write

Partitioning divides output into directories based on column values. It improves read performance for queries that filter on those columns.

```python
df.write.partitionBy("date", "country").parquet("/path/to/output")
```

This creates directories like `date=2024-01-01/country=US/`. Avoid partitioning on high-cardinality columns, as it creates many small directories and files.

### 1.4.4 Bucketing on write

Bucketing distributes data into a fixed number of files based on a hash of the bucketing columns. It enables shuffle-free joins when both sides are bucketed identically.

```python
(df.write
   .bucketBy(100, "customer_id")
   .sortBy("customer_id")
   .saveAsTable("bucketed_table"))
```

Bucketing requires `saveAsTable` and a metastore. It is not supported with `save`.

### 1.4.5 Compression

Compression reduces storage and I/O. Spark supports several codecs. For Parquet and ORC, compression is set via options.

```python
df.write.option("compression", "snappy").parquet("/path/to/output")
```

Common codecs: `snappy`, `gzip`, `lzo`, `bzip2`, `zstd`, `none`. Snappy is the default for Parquet and is a good balance of speed and compression ratio.

### 1.4.6 Best practices for reading and writing

- Use Parquet or ORC for analytical workloads. They are columnar, compressed, and support predicate pushdown.
- Avoid `inferSchema` in production. Define schemas explicitly.
- Filter and select early to reduce the amount of data read and written.
- Control the number of output files. Use `coalesce` or `repartition` before writing to avoid many small files.
- Use partitioning for low-cardinality filter columns and bucketing for high-cardinality join keys.
- Set the write mode appropriately to avoid accidental overwrites.
- Use compression to reduce storage and network I/O.
- For JDBC, use batch size and isolation level options for performance.
- Always check the number of partitions and output files in the Spark UI.

### 1.4.7 Common options for CSV and JSON

CSV options:
- `header`: true/false
- `delimiter`: default comma
- `quote`: default double quote
- `escape`: default backslash
- `nullValue`: string to treat as null
- `dateFormat`: date format string
- `mode`: PERMISSIVE, DROPMALFORMED, FAILFAST

JSON options:
- `multiLine`: true/false
- `allowComments`: true/false
- `allowSingleQuotes`: true/false
- `mode`: PERMISSIVE, DROPMALFORMED, FAILFAST

### 1.4.8 Summary

Reading and writing data in Spark is flexible and supports many formats and sources. Use `spark.read` and `df.write` with the appropriate format and options. Prefer columnar formats like Parquet for performance. Define schemas explicitly, control output file counts, and use partitioning and bucketing wisely. Always consider compression and write modes. These practices will make your pipelines faster and more reliable.

**Notebook link:**
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/1.%20Fundamentals/1.4%20Reading%20And%20Writing%20Data
