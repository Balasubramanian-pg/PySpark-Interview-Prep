# 2.3 Complex Data Types

PySpark supports three primary complex data types: `ArrayType`, `MapType`, and `StructType`. These types allow you to store semi-structured and nested data directly in DataFrames, which is essential when working with JSON, Avro, Parquet, or other formats that contain nested structures. Understanding how to create, access, manipulate, and optimize operations on complex types is critical for building efficient ETL pipelines and analytical workloads.

### ArrayType

An `ArrayType` represents an ordered collection of elements of the same type. Arrays can be nested and can contain any Spark data type, including other complex types.

#### Creating Arrays

```python
from pyspark.sql import SparkSession
from pyspark.sql.types import ArrayType, IntegerType, StringType, StructType, StructField
from pyspark.sql.functions import array, array_contains, size, sort_array, explode, col

spark = SparkSession.builder.appName("ComplexTypes").getOrCreate()

# Create a DataFrame with an array column
data = [
    (1, ["apple", "banana", "cherry"]),
    (2, ["dog", "cat"]),
    (3, []),
]
df_array = spark.createDataFrame(data, ["id", "items"])
df_array.printSchema()
df_array.show(truncate=False)
```

#### Accessing Array Elements

Array elements are accessed using zero-based index notation.

```python
# Access first element
df_array.select("id", col("items")[0].alias("first_item")).show()

# Check if array contains a value
df_array.select("id", array_contains("items", "banana").alias("has_banana")).show()

# Get array size
df_array.select("id", size("items").alias("num_items")).show()

# Sort array
df_array.select("id", sort_array("items").alias("sorted_items")).show()
```

SQL equivalents:

```sql
SELECT id, items[0] AS first_item FROM df_array;
SELECT id, ARRAY_CONTAINS(items, 'banana') AS has_banana FROM df_array;
SELECT id, SIZE(items) AS num_items FROM df_array;
SELECT id, SORT_ARRAY(items) AS sorted_items FROM df_array;
```

#### Exploding Arrays

`explode` converts an array column into multiple rows, one per element. `explode_outer` also includes rows with empty or null arrays, producing nulls for those.

```python
# Explode array into rows
df_exploded = df_array.select("id", explode("items").alias("item"))
df_exploded.show()

# Explode with position
from pyspark.sql.functions import posexplode
df_array.select("id", posexplode("items").alias("pos", "item")).show()
```

SQL equivalents:

```sql
SELECT id, EXPLODE(items) AS item FROM df_array;
SELECT id, POSEXPLODE(items) AS (pos, item) FROM df_array;
```

#### Higher-Order Functions

Spark 3.x provides higher-order functions that operate on arrays without exploding them, which is more efficient.

```python
from pyspark.sql.functions import transform, filter, aggregate, zip_with

# Transform each element
df_array.select("id", transform("items", lambda x: upper(x)).alias("upper_items")).show()

# Filter elements
df_array.select("id", filter("items", lambda x: x.startswith("a")).alias("filtered")).show()

# Aggregate array elements
df_array.select("id", aggregate("items", 0, lambda acc, x: acc + size(x)).alias("total_len")).show()
```

SQL equivalents:

```sql
SELECT id, TRANSFORM(items, x -> UPPER(x)) AS upper_items FROM df_array;
SELECT id, FILTER(items, x -> x LIKE 'a%') AS filtered FROM df_array;
SELECT id, AGGREGATE(items, 0, (acc, x) -> acc + LENGTH(x)) AS total_len FROM df_array;
```

### MapType

A `MapType` represents a collection of key-value pairs. Keys must be of the same type, and values must be of the same type. Maps are unordered.

#### Creating Maps

```python
from pyspark.sql.functions import map_from_arrays, map_keys, map_values, element_at, create_map, lit

# Create a DataFrame with a map column
data = [
    (1, {"name": "Alice", "age": "30"}),
    (2, {"name": "Bob", "age": "25"}),
]
df_map = spark.createDataFrame(data, ["id", "attributes"])
df_map.printSchema()
df_map.show(truncate=False)

# Create map from arrays
df_map_from_arrays = spark.createDataFrame([(1, ["a", "b"], [10, 20])], ["id", "keys", "values"]) \
    .withColumn("mapped", map_from_arrays("keys", "values"))
df_map_from_arrays.show()

# Create map using create_map
df_map_create = df_map.select("id", create_map(lit("name"), col("attributes")["name"]).alias("new_map"))
```

#### Accessing Map Elements

Map values are accessed by key using bracket notation or `element_at`.

```python
# Access map value by key
df_map.select("id", col("attributes")["name"].alias("name")).show()

# Using element_at
df_map.select("id", element_at("attributes", "age").alias("age")).show()

# Get map keys and values
df_map.select("id", map_keys("attributes").alias("keys"), map_values("attributes").alias("values")).show()
```

SQL equivalents:

```sql
SELECT id, attributes['name'] AS name FROM df_map;
SELECT id, ELEMENT_AT(attributes, 'age') AS age FROM df_map;
SELECT id, MAP_KEYS(attributes) AS keys, MAP_VALUES(attributes) AS values FROM df_map;
```

#### Exploding Maps

`explode` on a map column produces rows with `key` and `value` columns.

```python
from pyspark.sql.functions import explode

df_map.select("id", explode("attributes").alias("key", "value")).show()
```

SQL equivalent:

```sql
SELECT id, EXPLODE(attributes) AS (key, value) FROM df_map;
```

### StructType

A `StructType` represents a row with named fields, similar to a table schema. Structs can be nested and can contain any data type.

#### Creating Structs

```python
from pyspark.sql.functions import struct, col

# Create a DataFrame with a struct column
data = [
    (1, ("Alice", 30)),
    (2, ("Bob", 25)),
]
df_struct = spark.createDataFrame(data, ["id", "person"])
df_struct.printSchema()
df_struct.show(truncate=False)

# Create struct using struct function
df_struct_created = df_struct.select("id", struct(col("person._1").alias("name"), col("person._2").alias("age")).alias("person_struct"))
```

#### Accessing Struct Fields

Struct fields are accessed using dot notation.

```python
# Access struct fields
df_struct.select("id", col("person._1").alias("name"), col("person._2").alias("age")).show()

# Using star expansion
df_struct.select("id", "person.*").show()
```

SQL equivalents:

```sql
SELECT id, person._1 AS name, person._2 AS age FROM df_struct;
SELECT id, person.* FROM df_struct;
```

### Nested Combinations

Complex types can be combined arbitrarily. For example, an array of structs, a map of arrays, or a struct containing maps.

```python
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, ArrayType, MapType

# Define a schema with nested complex types
schema = StructType([
    StructField("id", IntegerType(), True),
    StructField("orders", ArrayType(
        StructType([
            StructField("order_id", StringType(), True),
            StructField("items", ArrayType(StringType()), True),
            StructField("metadata", MapType(StringType(), StringType()), True)
        ])
    ), True)
])

data = [
    (1, [
        ("o1", ["item1", "item2"], {"status": "shipped"}),
        ("o2", ["item3"], {"status": "pending"})
    ])
]

df_nested = spark.createDataFrame(data, schema)
df_nested.printSchema()
df_nested.show(truncate=False)

# Access nested elements
df_nested.select("id", col("orders")[0]["order_id"].alias("first_order_id")).show()

# Explode nested array
df_nested.select("id", explode("orders").alias("order")).select("id", "order.order_id", "order.items").show()
```

### Performance Implications and Configuration

Complex types have significant performance implications:

- **Serialization overhead**: Nested structures are more expensive to serialize and deserialize, especially when using row-based formats. Columnar formats like Parquet and ORC handle nested data more efficiently.
- **Memory footprint**: Storing nested data in memory can increase memory pressure. Arrays and maps with many elements can be large.
- **Exploding increases row count**: `explode` can dramatically increase the number of rows, leading to larger shuffles and more tasks. Always filter and project before exploding.
- **Higher-order functions avoid explosion**: Functions like `transform`, `filter`, and `aggregate` operate on arrays in place and are generally much faster than exploding and re-aggregating.
- **Shuffle cost**: Shuffling complex types is expensive because the entire nested structure must be serialized and moved across the network.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.parquet.enableVectorizedReader` | `true` | Enables vectorized reading of Parquet files, including nested structures. |
| `spark.sql.orc.enableVectorizedReader` | `true` | Enables vectorized reading of ORC files. |
| `spark.sql.parquet.writeLegacyFormat` | `false` | When `true`, writes Parquet in a legacy format that may not support certain nested types. |
| `spark.sql.execution.arrow.pyspark.enabled` | `false` | Enables Arrow-based conversion between PySpark and pandas, which can speed up operations on complex types. |
| `spark.sql.shuffle.partitions` | `200` | Tune based on data size when exploding or shuffling complex types. |

### Best Practices and When to Use

- **Use complex types for semi-structured data**: When reading JSON, Avro, or Parquet with nested schemas, preserve the structure instead of flattening immediately.
- **Flatten early for analytics**: If you need to join, filter, or aggregate on nested fields, consider flattening the structure into columns early to simplify queries and improve performance.
- **Prefer higher-order functions over explode**: When you need to transform or filter array elements, use `transform`, `filter`, or `aggregate` to avoid row explosion.
- **Use `explode_outer` when nulls matter**: Regular `explode` drops rows with null or empty arrays. Use `explode_outer` to preserve them.
- **Limit nesting depth**: Deeply nested structures are harder to query and can degrade performance. Keep nesting to a reasonable level.
- **Use columnar formats**: Parquet and ORC handle nested data efficiently. Avoid row-based formats like CSV for complex types.
- **Leverage schema evolution**: When writing complex types, use formats that support schema evolution to handle changes gracefully.
- **Monitor shuffle partitions**: When exploding arrays or maps, the row count can increase dramatically. Adjust `spark.sql.shuffle.partitions` accordingly.

### Common Pitfalls and Limitations

- **Null handling in explode**: `explode` drops rows with null or empty arrays. Use `explode_outer` to keep them.
- **Array indexing out of bounds**: Accessing an index beyond the array size returns `null` rather than throwing an error. This can lead to silent data issues.
- **Map key access**: Accessing a non-existent map key returns `null`. Use `element_at` which returns `null` for missing keys.
- **Struct field names with special characters**: Fields with dots or other special characters must be escaped using backticks.
- **Performance of `collect_list` and `collect_set`**: These functions aggregate all values into a single array on a single executor, which can cause `OutOfMemoryError` on large datasets. Use them with caution and consider alternatives like `array_agg` in SQL or window functions.
- **Schema inference for nested data**: When reading JSON without a schema, Spark infers types by sampling. This can lead to incorrect types for nested fields. Always provide an explicit schema for production workloads.
- **UDFs on complex types**: Python UDFs on complex types are slow due to serialization overhead. Prefer built-in functions or Scala UDFs when possible.

### Summary

Complex data types in PySpark — arrays, maps, and structs — enable working with nested and semi-structured data directly in DataFrames. They provide powerful operations such as element access, explosion, and higher-order functions for transforming and aggregating nested data. While they are essential for handling JSON, Avro, and Parquet, they come with performance costs related to serialization, memory, and shuffle. By using higher-order functions instead of exploding, flattening when appropriate, and tuning shuffle partitions, you can efficiently process complex data in Spark 3.x. Understanding these types is crucial for any PySpark engineer working with modern data formats.
