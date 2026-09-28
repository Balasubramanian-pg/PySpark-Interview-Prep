# 3.8 Broadcast Variables And Accumulators

Broadcast variables and accumulators are two types of shared variables in Spark that allow efficient communication between the driver and executors. Broadcast variables are read-only and are used to distribute large data efficiently to all executors. Accumulators are write-only (add-only) and are used to aggregate information from executors back to the driver, such as counters or sums. Both are important for performance and correctness in distributed computations.

### 3.8.1 What are Broadcast Variables and when should you use them?

A broadcast variable is a read-only shared variable that is distributed to all executors once and cached on each machine, rather than being shipped with every task. This avoids the overhead of sending a large lookup table or configuration object repeatedly with each task.

When to use broadcast variables:
- When you have a large read-only dataset that is needed by all tasks, such as a lookup table, a dictionary, or a machine learning model.
- When you want to avoid shipping the same data with every task, which can cause excessive network I/O and serialization overhead.
- When you are performing a map-side join manually, where a small table is broadcast to all executors to avoid a shuffle.

Without a broadcast variable, if you reference a large object inside a transformation, Spark serializes that object and includes it in the closure of every task. If you have thousands of tasks, this means thousands of copies of the same data being sent over the network. A broadcast variable sends the data once per executor, and tasks on that executor share the same cached copy.

Example in PySpark:

```python
# Without broadcast: the dictionary is shipped with every task
lookup = {"a": 1, "b": 2, "c": 3}
rdd = sc.parallelize(["a", "b", "c", "d"])
result = rdd.map(lambda x: lookup.get(x, 0)).collect()

# With broadcast: the dictionary is sent once per executor
broadcast_lookup = sc.broadcast(lookup)
result = rdd.map(lambda x: broadcast_lookup.value.get(x, 0)).collect()
```

Broadcast variables are immutable. Once created, they cannot be modified. If you need to update the data, you must create a new broadcast variable and unpersist the old one.

### 3.8.2 How do Broadcast Variables work under the hood?

When you call `sc.broadcast(value)`, Spark does the following:

1. The driver serializes the value and stores it in the driver's block manager.
2. The driver creates a `Broadcast` object that holds a reference to the block and a unique broadcast ID.
3. When a task on an executor needs the broadcast value, it first checks its local block manager. If the value is not present, it fetches it from the driver or from another executor that already has it.
4. The value is cached on the executor in deserialized form for fast access. Subsequent tasks on the same executor reuse the cached copy.
5. Spark uses a BitTorrent-like protocol (TorrentBroadcast) to distribute large broadcast values efficiently across executors, reducing the load on the driver.

The broadcast data is stored in the executor's memory. If the broadcast value is too large, it can cause out-of-memory errors on the executors. You can monitor broadcast memory usage in the Spark UI under the Executors tab.

To remove a broadcast variable from memory, call `unpersist()`:

```python
broadcast_lookup.unpersist()
```

### 3.8.3 What are Accumulators and when should you use them?

An accumulator is a write-only shared variable that allows executors to add values to a shared counter or sum. The driver can read the accumulator's value after an action completes. Accumulators are useful for counters, error tracking, and debugging in distributed computations.

When to use accumulators:
- Counting events, such as the number of malformed records or the number of times a condition is met.
- Summing values across tasks, such as the total bytes processed or the total number of rows.
- Debugging and monitoring job execution.

Example in PySpark:

```python
# Create an accumulator
error_count = sc.accumulator(0)

def process_row(row):
    global error_count
    if row is None:
        error_count.add(1)
    return row

rdd = sc.parallelize([1, 2, None, 4, None])
rdd.foreach(process_row)

print(error_count.value)  # 2
```

Accumulators support numeric types by default, such as int, float, and long. You can also create custom accumulators by subclassing `AccumulatorParam`.

### 3.8.4 What are the pitfalls of using Accumulators with transformations?

Accumulators should only be used inside actions, not inside transformations. This is because transformations are lazy and can be recomputed if a task fails or if the RDD is recomputed. If an accumulator is updated inside a transformation, the update may happen multiple times, leading to incorrect results.

For example, the following code is incorrect:

```python
# Incorrect: accumulator updated in a transformation
acc = sc.accumulator(0)
rdd = sc.parallelize([1, 2, 3, 4])
rdd.map(lambda x: acc.add(x))  # lazy, not executed yet
rdd.count()  # action triggers computation
print(acc.value)  # may be incorrect if tasks are recomputed
```

The correct way is to use accumulators inside actions like `foreach` or `foreachPartition`:

```python
# Correct: accumulator updated in an action
acc = sc.accumulator(0)
rdd = sc.parallelize([1, 2, 3, 4])
rdd.foreach(lambda x: acc.add(x))
print(acc.value)  # 10
```

In Spark 2.x and later, accumulators used in transformations may only be updated once per task if the task is not recomputed. However, if a task fails and is retried, the accumulator update may be applied again, causing double counting. The safest approach is to use accumulators only in actions.

### 3.8.5 What is the difference between Broadcast Variables and Accumulators?

| Aspect | Broadcast Variables | Accumulators |
|---|---|---|
| Direction | Driver to executors | Executors to driver |
| Read/Write | Read-only | Write-only (add-only) |
| Purpose | Distribute large read-only data efficiently | Aggregate counters or sums from executors |
| Usage | Inside transformations and actions | Inside actions (preferably) |
| Serialization | Sent once per executor, cached | Updates sent back to driver |
| Fault tolerance | Immutable, can be re-broadcast | Updates may be re-applied on task retry |
| Memory location | Executor memory | Driver memory (for the final value) |

### 3.8.6 How do you use Broadcast Variables and Accumulators in PySpark?

Broadcast variable example:

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, udf
from pyspark.sql.types import IntegerType

spark = SparkSession.builder.appName("BroadcastExample").getOrCreate()

# Small lookup table
lookup = {"US": 1, "IN": 2, "UK": 3}
broadcast_lookup = spark.sparkContext.broadcast(lookup)

# UDF that uses the broadcast variable
def map_country(code):
    return broadcast_lookup.value.get(code, 0)

map_udf = udf(map_country, IntegerType())

df = spark.createDataFrame([("US",), ("IN",), ("UK",), ("XX",)], ["country"])
result = df.withColumn("country_id", map_udf(col("country")))
result.show()

broadcast_lookup.unpersist()
```

Accumulator example:

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("AccumulatorExample").getOrCreate()
sc = spark.sparkContext

# Create an accumulator
invalid_count = sc.accumulator(0)

def validate_row(row):
    global invalid_count
    if row["value"] < 0:
        invalid_count.add(1)
    return row

data = [(1,), (-2,), (3,), (-4,)]
rdd = sc.parallelize(data)
rdd.foreach(lambda row: validate_row({"value": row[0]}))

print("Invalid count:", invalid_count.value)  # 2
```

### 3.8.7 What are the best practices and limitations?

Best practices for broadcast variables:
- Use broadcast variables only for data that is small enough to fit in executor memory.
- Unpersist broadcast variables when they are no longer needed to free memory.
- Do not modify the broadcast value. It is read-only.
- Monitor broadcast memory usage in the Spark UI.
- For DataFrames, use the `broadcast()` function for joins instead of manually broadcasting a table.

Best practices for accumulators:
- Use accumulators only inside actions, not transformations.
- Do not rely on accumulators for exact counts if tasks may be recomputed. For exact counts, use actions that do not recompute, such as `foreach` on a cached dataset.
- Use named accumulators for easier identification in the Spark UI.
- For custom types, subclass `AccumulatorParam`.

Limitations:
- Broadcast variables can cause out-of-memory errors if they are too large.
- Accumulators are not fault-tolerant in the sense that updates may be re-applied on task retry.
- Accumulators are only visible to the driver after an action completes.
- Broadcast variables cannot be updated after creation.
- In Spark 2.x and later, accumulators in transformations may not update correctly if the transformation is recomputed.

Notebook link:
https://github.com/Balasubramanian-pg/PySpark-Interview-Prep/tree/main/3.%20Advanced/3.8%20Broadcast%20Variables%20And%20Accumulators
