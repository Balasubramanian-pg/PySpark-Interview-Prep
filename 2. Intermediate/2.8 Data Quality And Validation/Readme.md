# 2.8 Data Quality And Validation

Data quality and validation ensure that data is complete, accurate, consistent, and fit for its intended use before it reaches downstream consumers. In PySpark pipelines, validation must scale across distributed data without collecting entire datasets to the driver. Poor data quality leads to incorrect analytics, failed machine learning models, and costly debugging. Spark 3.x provides a rich set of built-in functions and SQL expressions that allow you to define, measure, and enforce data quality rules efficiently.

### Dimensions of Data Quality

Data quality is typically assessed across several dimensions. The following table summarizes the most relevant ones for PySpark pipelines.

| Dimension | Description | Example Check |
|-----------|-------------|---------------|
| Completeness | No missing values where required. | `col("email").isNotNull()` |
| Uniqueness | No duplicate records on key columns. | `groupBy("id").count().filter("count > 1")` |
| Validity | Values conform to expected format or domain. | `col("age").between(0, 120)` |
| Accuracy | Values correctly represent reality. | Cross-check against source system. |
| Consistency | Related fields agree with each other. | `col("end_date") >= col("start_date")` |
| Timeliness | Data is fresh and up to date. | `max("updated_at")` within SLA. |
| Integrity | Foreign keys exist in parent tables. | Left anti join with reference table. |

### Validation Techniques in PySpark

#### Schema Validation

Schema validation ensures that the DataFrame structure matches expectations before any transformation. This is best done at read time by providing an explicit schema.

```python
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, TimestampType
from pyspark.sql.functions import col

expected_schema = StructType([
    StructField("id", IntegerType(), False),
    StructField("name", StringType(), True),
    StructField("email", StringType(), True),
    StructField("created_at", TimestampType(), True)
])

df = spark.read.schema(expected_schema).json("path/to/data")

# Validate that required columns are not null
df.filter(col("id").isNull()).show()
```

SQL equivalent for checking nulls:

```sql
SELECT * FROM df WHERE id IS NULL;
```

#### Null and Missing Value Checks

Null checks are the most common validation. Use `isNull`, `isNotNull`, and aggregate functions to quantify missing values without collecting rows.

```python
from pyspark.sql.functions import count, when, col

# Count nulls per column in a single pass
null_counts = df.select([
    count(when(col(c).isNull(), c)).alias(c) for c in df.columns
])
null_counts.show()
```

SQL equivalent:

```sql
SELECT
    COUNT(*) - COUNT(id) AS id_nulls,
    COUNT(*) - COUNT(name) AS name_nulls,
    COUNT(*) - COUNT(email) AS email_nulls
FROM df;
```

#### Uniqueness Checks

Uniqueness validation detects duplicate records on key columns.

```python
# Find duplicate IDs
duplicates = df.groupBy("id").count().filter(col("count") > 1)
duplicates.show()

# Drop duplicates keeping the first occurrence
df_dedup = df.dropDuplicates(["id"])
```

SQL equivalent:

```sql
SELECT id, COUNT(*) AS cnt
FROM df
GROUP BY id
HAVING COUNT(*) > 1;
```

#### Range and Domain Checks

Range checks ensure numeric values fall within acceptable bounds. Domain checks verify that categorical values belong to a known set.

```python
from pyspark.sql.functions import col

# Range check
invalid_age = df.filter((col("age") < 0) | (col("age") > 120))
invalid_age.show()

# Domain check
valid_statuses = ["active", "inactive", "pending"]
invalid_status = df.filter(~col("status").isin(valid_statuses))
invalid_status.show()
```

SQL equivalents:

```sql
SELECT * FROM df WHERE age < 0 OR age > 120;
SELECT * FROM df WHERE status NOT IN ('active', 'inactive', 'pending');
```

#### Pattern and Regex Checks

Pattern checks validate string formats such as email addresses, phone numbers, or dates.

```python
from pyspark.sql.functions import col

# Email pattern
invalid_email = df.filter(~col("email").rlike(r"^[^@]+@[^@]+\.[^@]+$"))
invalid_email.show()

# Date pattern (ISO)
invalid_date = df.filter(~col("date_str").rlike(r"^\d{4}-\d{2}-\d{2}$"))
invalid_date.show()
```

SQL equivalents:

```sql
SELECT * FROM df WHERE email NOT RLIKE '^[^@]+@[^@]+\\.[^@]+$';
SELECT * FROM df WHERE date_str NOT RLIKE '^\\d{4}-\\d{2}-\\d{2}$';
```

#### Referential Integrity

Referential integrity checks ensure that foreign keys in a child table exist in the parent table. Left anti joins are the idiomatic way to find orphan records.

```python
# Find child records with no matching parent
orphans = child_df.join(parent_df, on="parent_id", how="left_anti")
orphans.show()
```

SQL equivalent:

```sql
SELECT * FROM child_df
LEFT ANTI JOIN parent_df ON child_df.parent_id = parent_df.id;
```

#### Cross-Column Consistency

Consistency checks verify that related columns agree.

```python
from pyspark.sql.functions import col

# end_date must be after start_date
inconsistent = df.filter(col("end_date") < col("start_date"))
inconsistent.show()
```

SQL equivalent:

```sql
SELECT * FROM df WHERE end_date < start_date;
```

#### Freshness and Timeliness

Freshness checks ensure data is up to date according to an SLA.

```python
from pyspark.sql.functions import max, current_timestamp, lit
from datetime import timedelta

# Check latest timestamp
latest = df.agg(max("updated_at").alias("max_ts")).collect()[0]["max_ts"]

# Alternatively, compute in a distributed way without collecting
freshness_check = df.agg(
    (current_timestamp() - max("updated_at")).alias("lag")
)
freshness_check.show()
```

SQL equivalent:

```sql
SELECT CURRENT_TIMESTAMP() - MAX(updated_at) AS lag FROM df;
```

### Quarantining Bad Records

A common pattern is to split the DataFrame into valid and invalid records. The valid records continue through the pipeline, while invalid records are written to a quarantine location for later analysis.

```python
from pyspark.sql.functions import col

valid_condition = (
    col("id").isNotNull() &
    col("age").between(0, 120) &
    col("email").rlike(r"^[^@]+@[^@]+\.[^@]+$")
)

valid_df = df.filter(valid_condition)
invalid_df = df.filter(~valid_condition)

valid_df.write.mode("overwrite").parquet("path/to/valid")
invalid_df.write.mode("overwrite").parquet("path/to/quarantine")
```

### Data Quality Metrics and Reporting

Compute quality metrics in a single aggregation pass to avoid multiple scans of the data.

```python
from pyspark.sql.functions import count, when, col, lit

total = df.count()

metrics = df.agg(
    count(when(col("id").isNull(), True)).alias("null_id"),
    count(when(~col("email").rlike(r"^[^@]+@[^@]+\.[^@]+$"), True)).alias("invalid_email"),
    count(when((col("age") < 0) | (col("age") > 120), True)).alias("invalid_age")
).collect()[0]

total_rows = total
null_id_pct = metrics["null_id"] / total_rows * 100
invalid_email_pct = metrics["invalid_email"] / total_rows * 100
invalid_age_pct = metrics["invalid_age"] / total_rows * 100
```

For larger pipelines, consider using a data quality framework such as Great Expectations, Deequ, or Delta Live Tables expectations. Delta Lake also supports CHECK constraints that enforce rules at write time.

```sql
-- Delta Lake CHECK constraint
ALTER TABLE my_table ADD CONSTRAINT valid_age CHECK (age BETWEEN 0 AND 120);
```

### Performance Implications and Configuration

Data quality checks are transformations and aggregations. They can be expensive if implemented poorly.

- **Single-pass aggregation**: Compute multiple metrics in one `agg` call rather than multiple `filter().count()` calls. Each `count` triggers a full scan.
- **Avoid Python UDFs**: Built-in functions are JVM-native and Catalyst-optimized. UDFs disable these optimizations.
- **Cache reused DataFrames**: If the same DataFrame is used for validation and transformation, cache it to avoid recomputation.
- **Partition pruning**: When validating partitioned data, filter on partition columns to limit the data scanned.
- **Sampling**: For very large datasets, validate on a sample to get a quick estimate, then run full validation periodically.
- **AQE**: Enable adaptive query execution to optimize shuffles and skew during validation aggregations.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.shuffle.partitions` | 200 | Tune for the size of validation aggregations. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Enables AQE for dynamic partition coalescing. |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` | Merges small partitions after shuffle. |
| `spark.sql.ansi.enabled` | `false` | When `true`, invalid operations throw errors instead of returning null. Useful for strict validation. |
| `spark.sql.legacy.timeParserPolicy` | `EXCEPTION` | Controls date parsing behavior. `EXCEPTION` fails on invalid dates. |

### Best Practices and When to Use

- **Define expectations explicitly**: Document every data quality rule as code, ideally in a reusable library or configuration file.
- **Validate early**: Check data quality immediately after ingestion, before expensive transformations.
- **Fail fast or quarantine**: Decide whether a failed check should halt the pipeline or route bad records to quarantine. Both are valid; the choice depends on business requirements.
- **Measure and trend**: Track data quality metrics over time to detect degradation.
- **Use built-in functions**: They are faster and more maintainable than custom UDFs.
- **Combine checks**: Use a single aggregation to compute multiple metrics.
- **Test on samples**: Run validation on a sample during development, then on full data in production.
- **Leverage Delta Lake constraints**: For Delta tables, use CHECK constraints and expectations for write-time enforcement.
- **Automate**: Integrate validation into CI/CD and orchestration tools such as Airflow or Databricks Workflows.

### Common Pitfalls and Limitations

- **Collecting to the driver**: Using `collect()` to fetch validation results can cause `OutOfMemoryError` on large datasets. Use aggregations instead.
- **Multiple scans**: Calling `count()` or `filter().count()` repeatedly rescans the data. Combine into one aggregation.
- **Ignoring nulls**: Many validation rules must explicitly handle nulls. For example, `col("age").between(0, 120)` returns `null` for null ages, which is treated as `false` in filters. Use `isNull()` checks explicitly.
- **Overlooking schema drift**: New columns or changed types can break downstream processing. Validate schema on every ingestion.
- **Performance of regex**: Complex regex patterns can be slow. Test patterns on representative data.
- **Skew in validation aggregations**: A single key with many rows can slow down `groupBy` checks. Enable AQE skew handling.
- **Not handling quarantine writes**: Invalid records must be written somewhere for analysis. Without quarantine, bad data is silently dropped.
- **Assuming all columns are required**: Some columns may be optional. Define rules per column rather than applying the same rule to all.
- **Forgetting timeliness checks**: Data can be valid but stale. Always validate freshness against an SLA.

### Summary

Data quality and validation in PySpark require scalable techniques that avoid collecting data to the driver and minimize full scans. Built-in functions for null checks, uniqueness, range validation, pattern matching, referential integrity, and freshness checks cover most needs. Combine multiple checks into a single aggregation, use left anti joins for referential integrity, and quarantine invalid records for analysis. Enable AQE and tune shuffle partitions for performance. For production pipelines, consider frameworks like Great Expectations or Delta Lake constraints to enforce quality at scale. Mastering these practices ensures reliable, trustworthy data in Spark 3.x.
