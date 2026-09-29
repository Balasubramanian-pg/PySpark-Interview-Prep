# 4.6 Unit Testing In PySpark

Unit testing in PySpark verifies that individual transformations, DataFrame operations, and user-defined functions behave correctly before they are deployed to a cluster. Because Spark jobs are distributed, testing them requires a local SparkSession that runs in-process, deterministic input data, and assertions on the resulting DataFrame or RDD. Well-designed unit tests catch schema errors, logic bugs, and edge cases early, reduce debugging time on production clusters, and make refactoring safe. This answer covers the testing frameworks, patterns, and practices that senior PySpark engineers use to build reliable data pipelines.

#### Why Unit Testing in PySpark Matters

PySpark code often mixes business logic with distributed execution. A bug in a transformation can silently produce wrong results, corrupt downstream tables, or fail only at scale. Unit tests provide fast feedback in the development environment, isolate logic from infrastructure, and document expected behavior. They are especially valuable for:

- **Transformations**: `select`, `filter`, `withColumn`, `join`, `groupBy`, and window functions.
- **UDFs and Pandas UDFs**: custom logic that is easy to get wrong.
- **Schema contracts**: ensuring input and output schemas match expectations.
- **Edge cases**: nulls, empty DataFrames, duplicate keys, and type mismatches.
- **Streaming logic**: testing micro-batch functions and stateful operations with static data.

#### Testing Frameworks: unittest vs pytest

PySpark tests can be written with Python's built-in `unittest` or with `pytest`. Both work well; the choice depends on team preference and existing tooling.

| Aspect | unittest | pytest |
|---|---|---|
| Origin | Python standard library | Third-party, widely adopted |
| Test discovery | `unittest discover` | `pytest` automatic discovery |
| Fixtures | `setUp` / `tearDown` | `@pytest.fixture` with dependency injection |
| Assertions | `self.assertEqual`, etc. | Plain `assert` statements |
| Parametrization | Manual loops | `@pytest.mark.parametrize` |
| Plugins | Limited | Rich ecosystem (coverage, parallel, etc.) |
| Learning curve | Familiar to Java/JUnit users | Simpler for Python developers |

For new projects, `pytest` is generally preferred because of its concise syntax and fixture model. Existing projects often use `unittest` and can run `pytest` on top of it.

#### Setting Up a Test SparkSession

Every PySpark unit test needs a `SparkSession`. The key is to run it locally, with minimal resources, and reuse it across tests to avoid startup overhead.

```python
import pytest
from pyspark.sql import SparkSession

@pytest.fixture(scope="session")
def spark():
    return (
        SparkSession.builder
        .master("local[2]")          # two threads for parallelism
        .appName("PySparkUnitTests")
        .config("spark.sql.shuffle.partitions", "2")  # keep small for tests
        .config("spark.default.parallelism", "2")
        .config("spark.ui.enabled", "false")          # disable UI for speed
        .getOrCreate()
    )
```

A session-scoped fixture creates the SparkSession once per test run. Function-scoped fixtures can provide fresh DataFrames per test. Always set `spark.sql.shuffle.partitions` to a small number (e.g., 2) to keep test execution fast.

#### Testing Transformations and DataFrame Operations

The standard pattern is to create input DataFrames from Python lists, apply the transformation, and compare the result to an expected DataFrame. Use `collect()` for small results or `subtract()` for set comparison.

```python
def test_filter_and_aggregate(spark):
    input_data = [(1, "a", 10.0), (2, "b", 20.0), (3, "a", 30.0)]
    input_df = spark.createDataFrame(input_data, ["id", "category", "amount"])

    result = (
        input_df
        .filter(input_df.amount > 15.0)
        .groupBy("category")
        .sum("amount")
        .withColumnRenamed("sum(amount)", "total")
        .orderBy("category")
    )

    expected_data = [("a", 30.0), ("b", 20.0)]
    expected_df = spark.createDataFrame(expected_data, ["category", "total"])

    assert result.collect() == expected_df.collect()
```

For larger results, use `subtract()` to avoid ordering issues:

```python
def test_join(spark):
    left = spark.createDataFrame([(1, "a"), (2, "b")], ["id", "left_val"])
    right = spark.createDataFrame([(1, "x"), (3, "y")], ["id", "right_val"])

    result = left.join(right, on="id", how="inner")
    expected = spark.createDataFrame([(1, "a", "x")], ["id", "left_val", "right_val"])

    assert result.subtract(expected).count() == 0
    assert expected.subtract(result).count() == 0
```

#### Testing UDFs and Pandas UDFs

UDFs encapsulate custom logic. Test them directly as Python functions first, then test them through Spark to verify serialization and vectorization.

```python
from pyspark.sql.functions import udf
from pyspark.sql.types import StringType

def categorize_amount(amount):
    if amount is None:
        return "unknown"
    if amount < 50:
        return "low"
    return "high"

# Direct unit test of the Python function
def test_categorize_amount():
    assert categorize_amount(10) == "low"
    assert categorize_amount(100) == "high"
    assert categorize_amount(None) == "unknown"

# Spark UDF test
def test_udf_in_spark(spark):
    categorize_udf = udf(categorize_amount, StringType())
    df = spark.createDataFrame([(10,), (100,), (None,)], ["amount"])
    result = df.withColumn("category", categorize_udf("amount")).collect()
    assert [row.category for row in result] == ["low", "high", "unknown"]
```

For Pandas UDFs, test with small Pandas DataFrames and verify the output schema.

#### Testing SQL Queries

If your logic is expressed in SQL, register temporary views and run the query against them.

```python
def test_sql_query(spark):
    data = [(1, "a", 10.0), (2, "b", 20.0), (3, "a", 30.0)]
    df = spark.createDataFrame(data, ["id", "category", "amount"])
    df.createOrReplaceTempView("sales")

    result = spark.sql("""
        SELECT category, SUM(amount) AS total
        FROM sales
        WHERE amount > 15.0
        GROUP BY category
        ORDER BY category
    """)

    expected = [("a", 30.0), ("b", 20.0)]
    assert [tuple(row) for row in result.collect()] == expected
```

SQL equivalent for the same logic is exactly the query text above. The test verifies the query returns the expected rows.

#### Testing Streaming Logic

Structured Streaming tests typically use a memory sink or a `foreachBatch` function with a static DataFrame. For stateful operations, use `applyInPandasWithState` with a test input and verify the output.

```python
def test_streaming_foreach_batch(spark):
    results = []

    def capture_batch(df, batch_id):
        results.append(df.collect())

    input_df = spark.createDataFrame([(1, "a"), (2, "b")], ["id", "val"])
    query = (
        spark.readStream.format("rate").load()
        .writeStream
        .foreachBatch(capture_batch)
        .start()
    )
    query.processAllAvailable()
    query.stop()
    # Assert on captured batches
```

For deterministic streaming tests, use `spark.readStream.format("memory")` with a static DataFrame, or test the batch function directly.

#### Mocking and Fixtures

Mocking external dependencies (databases, APIs, file systems) keeps unit tests fast and isolated. Use `unittest.mock` or `pytest-mock` to replace I/O calls.

```python
from unittest.mock import patch

def test_pipeline_with_mocked_source(spark):
    with patch("my_module.read_from_database") as mock_read:
        mock_read.return_value = spark.createDataFrame([(1, "a")], ["id", "val"])
        result = my_pipeline(spark)
        assert result.count() == 1
```

Fixtures can provide reusable DataFrames, temporary directories, or configuration. Keep fixtures small and focused.

#### Performance Implications and Trade-offs

Unit tests should run in seconds, not minutes. A local SparkSession with minimal resources is sufficient. Avoid tests that require a cluster, large data volumes, or long-running jobs.

| Choice | Benefit | Cost |
|---|---|---|
| Local SparkSession | Fast, no cluster needed | May not catch cluster-specific issues |
| Small shuffle partitions | Faster tests | May hide partitioning bugs |
| Session-scoped SparkSession | Avoids repeated startup | Shared state can leak between tests |
| Function-scoped SparkSession | Isolation | Slower test suite |
| `collect()` on small data | Simple assertions | Not suitable for large results |
| `subtract()` for comparison | Order-independent | Two passes over data |
| Mocking I/O | Fast, isolated | Does not test real integration |
| Integration tests | Catch real issues | Slower, require infrastructure |

Configuration parameters relevant to testing:

| Parameter | Default | Description |
|---|---|---|
| `spark.sql.shuffle.partitions` | `200` | Reduce to 2 for tests to speed up shuffles. |
| `spark.default.parallelism` | varies | Reduce to 2 for local tests. |
| `spark.ui.enabled` | `true` | Set to `false` to avoid UI overhead. |
| `spark.sql.adaptive.enabled` | `true` | Can be left on; may add variability. |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` | Can be disabled for deterministic tests. |
| `spark.testing` | not set | Some Spark internals use this flag; avoid relying on it. |

#### Best Practices

- Write tests for transformations, UDFs, and schema contracts, not for Spark itself.
- Use a session-scoped local SparkSession with minimal resources.
- Keep test data small and deterministic.
- Test edge cases: nulls, empty DataFrames, duplicate keys, and type mismatches.
- Separate unit tests from integration tests. Run unit tests on every commit; run integration tests less frequently.
- Use `pytest` for concise tests and fixtures; use `unittest` if the team already uses it.
- Mock external I/O to keep tests fast and reliable.
- Assert on schema as well as data, especially for pipelines with strict contracts.
- Use `subtract()` for order-independent comparisons.
- Keep tests independent. Do not rely on state from previous tests.

#### Common Pitfalls and Limitations

- Creating a new SparkSession per test slows down the suite significantly. Reuse a session-scoped fixture.
- Leaving `spark.sql.shuffle.partitions` at 200 makes small tests slow.
- Using `collect()` on large DataFrames can cause driver OOM in tests. Keep test data small.
- Comparing DataFrames with `==` does not work; use `collect()` or `subtract()`.
- UDFs that rely on external state or non-serializable objects fail in distributed execution. Test them in Spark, not just as Python functions.
- Streaming tests that rely on real time are flaky. Use `processAllAvailable()` and memory sinks for determinism.
- Mocking too much can make tests pass while production fails. Balance unit and integration tests.
- Not testing schema evolution can lead to surprises when upstream data changes.
- Local mode does not replicate cluster behavior for partitioning, skew, or resource contention. Use integration tests on a real cluster for those concerns.
- PySpark tests can be slow to start. Keep the test suite focused and avoid unnecessary SparkSession creation.

#### Summary

Unit testing in PySpark verifies transformations, UDFs, SQL queries, and streaming logic using a local SparkSession and small deterministic DataFrames. `pytest` and `unittest` are both viable; `pytest` offers concise fixtures and parametrization. The key practices are: reuse a session-scoped SparkSession, reduce shuffle partitions to 2, test edge cases, mock external I/O, and separate unit tests from integration tests. Common pitfalls include slow test suites from repeated SparkSession creation, comparing DataFrames incorrectly, and relying on real time in streaming tests. In interviews, emphasize that unit tests catch logic errors early, but they do not replace integration tests on a real cluster for partitioning, skew, and resource behavior.

Notebook link: {{NOTEBOOK_URL}}
