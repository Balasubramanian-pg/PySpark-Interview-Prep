# 2.4 Date And Time Functions

Date and time functions are fundamental for processing temporal data in PySpark. They enable parsing, formatting, extracting components, performing arithmetic, and handling time zones. Correct usage is critical for data correctness and performance, especially in distributed environments where time zone mismatches and inefficient string manipulation can cause subtle bugs or significant slowdowns. Spark 3.x provides a rich set of built-in functions that operate directly on `DateType` and `TimestampType` columns, avoiding the need for slow Python UDFs.

### Date and Timestamp Types

Spark supports the following temporal types:

- **DateType**: Represents a date without time or time zone (year, month, day). Range: 0001-01-01 to 9999-12-31.
- **TimestampType**: Represents a point in time with microsecond precision. Internally stored as UTC, but displayed according to the session time zone.
- **TimestampNTZType** (Spark 3.4+): Timestamp without time zone, storing local date-time without any time zone conversion.

```python
from pyspark.sql.types import DateType, TimestampType, TimestampNTZType

# Example schema
schema = "date_col DATE, ts_col TIMESTAMP, ts_ntz_col TIMESTAMP_NTZ"
```

### Common Date and Time Functions

The following table summarizes the most frequently used functions. All are available in `pyspark.sql.functions` and have SQL equivalents.

| Function | Description | Example |
|----------|-------------|---------|
| `current_date()` | Returns current date. | `current_date()` |
| `current_timestamp()` | Returns current timestamp. | `current_timestamp()` |
| `year(col)` | Extracts year. | `year("date")` |
| `month(col)` | Extracts month (1-12). | `month("date")` |
| `dayofmonth(col)` | Extracts day of month (1-31). | `dayofmonth("date")` |
| `dayofweek(col)` | Day of week (1=Sunday, 7=Saturday). | `dayofweek("date")` |
| `dayofyear(col)` | Day of year (1-366). | `dayofyear("date")` |
| `weekofyear(col)` | ISO week number. | `weekofyear("date")` |
| `quarter(col)` | Quarter (1-4). | `quarter("date")` |
| `hour(col)` | Extracts hour (0-23). | `hour("ts")` |
| `minute(col)` | Extracts minute (0-59). | `minute("ts")` |
| `second(col)` | Extracts second (0-59). | `second("ts")` |
| `date_add(col, n)` | Adds n days. | `date_add("date", 7)` |
| `date_sub(col, n)` | Subtracts n days. | `date_sub("date", 7)` |
| `datediff(end, start)` | Difference in days. | `datediff("end", "start")` |
| `add_months(col, n)` | Adds n months. | `add_months("date", 3)` |
| `months_between(end, start)` | Months between dates (fractional). | `months_between("end", "start")` |
| `last_day(col)` | Last day of month. | `last_day("date")` |
| `next_day(col, day)` | Next specified weekday. | `next_day("date", "Mon")` |
| `trunc(col, fmt)` | Truncates to format (e.g., "year", "month"). | `trunc("date", "month")` |
| `date_trunc(fmt, col)` | Truncates timestamp to format. | `date_trunc("month", "ts")` |
| `date_format(col, fmt)` | Formats date/timestamp as string. | `date_format("date", "yyyy-MM-dd")` |
| `to_date(col, fmt)` | Parses string to date. | `to_date("date_str", "yyyy-MM-dd")` |
| `to_timestamp(col, fmt)` | Parses string to timestamp. | `to_timestamp("ts_str", "yyyy-MM-dd HH:mm:ss")` |
| `from_unixtime(col, fmt)` | Converts Unix epoch to timestamp string. | `from_unixtime("epoch", "yyyy-MM-dd")` |
| `unix_timestamp(col, fmt)` | Converts timestamp string to Unix epoch. | `unix_timestamp("ts_str", "yyyy-MM-dd HH:mm:ss")` |
| `from_utc_timestamp(col, tz)` | Converts UTC to given time zone. | `from_utc_timestamp("ts", "America/New_York")` |
| `to_utc_timestamp(col, tz)` | Converts given time zone to UTC. | `to_utc_timestamp("ts", "America/New_York")` |

### Code Examples

The following examples demonstrate common date and time operations in PySpark.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    to_date, to_timestamp, year, month, dayofmonth, date_add, date_sub,
    datediff, add_months, months_between, last_day, next_day,
    trunc, date_trunc, date_format, current_date, current_timestamp,
    from_utc_timestamp, to_utc_timestamp, col
)

spark = SparkSession.builder.appName("DateTimeFunctions").getOrCreate()

# Sample data
data = [
    ("2023-01-15", "2023-01-15 10:30:00"),
    ("2023-02-20", "2023-02-20 14:45:00"),
    ("2023-03-25", "2023-03-25 08:15:00"),
]
df = spark.createDataFrame(data, ["date_str", "ts_str"])

# Parse strings to DateType and TimestampType
df = df.withColumn("date", to_date("date_str", "yyyy-MM-dd")) \
       .withColumn("ts", to_timestamp("ts_str", "yyyy-MM-dd HH:mm:ss"))

# Extract components
df.select(
    "date",
    year("date").alias("year"),
    month("date").alias("month"),
    dayofmonth("date").alias("day"),
    date_format("date", "EEEE").alias("weekday")
).show()

# Date arithmetic
df.select(
    "date",
    date_add("date", 7).alias("plus_7_days"),
    date_sub("date", 7).alias("minus_7_days"),
    add_months("date", 1).alias("plus_1_month"),
    last_day("date").alias("last_day_of_month"),
    next_day("date", "Mon").alias("next_monday")
).show()

# Differences
df.select(
    "date",
    datediff(current_date(), "date").alias("days_since"),
    months_between(current_date(), "date").alias("months_since")
).show()

# Truncation and formatting
df.select(
    "date",
    trunc("date", "month").alias("month_start"),
    date_trunc("month", "ts").alias("ts_month_start"),
    date_format("date", "yyyy/MM/dd").alias("formatted_date")
).show()

# Time zone conversion
df.select(
    "ts",
    from_utc_timestamp("ts", "America/New_York").alias("ny_time"),
    to_utc_timestamp("ts", "America/New_York").alias("utc_time")
).show()
```

### SQL Equivalents

All the above operations have direct SQL equivalents.

```sql
-- Parse strings
SELECT TO_DATE(date_str, 'yyyy-MM-dd') AS date,
       TO_TIMESTAMP(ts_str, 'yyyy-MM-dd HH:mm:ss') AS ts
FROM df;

-- Extract components
SELECT date,
       YEAR(date) AS year,
       MONTH(date) AS month,
       DAYOFMONTH(date) AS day,
       DATE_FORMAT(date, 'EEEE') AS weekday
FROM df;

-- Date arithmetic
SELECT date,
       DATE_ADD(date, 7) AS plus_7_days,
       DATE_SUB(date, 7) AS minus_7_days,
       ADD_MONTHS(date, 1) AS plus_1_month,
       LAST_DAY(date) AS last_day_of_month,
       NEXT_DAY(date, 'Mon') AS next_monday
FROM df;

-- Differences
SELECT date,
       DATEDIFF(CURRENT_DATE(), date) AS days_since,
       MONTHS_BETWEEN(CURRENT_DATE(), date) AS months_since
FROM df;

-- Truncation and formatting
SELECT date,
       TRUNC(date, 'month') AS month_start,
       DATE_TRUNC('month', ts) AS ts_month_start,
       DATE_FORMAT(date, 'yyyy/MM/dd') AS formatted_date
FROM df;

-- Time zone conversion
SELECT ts,
       FROM_UTC_TIMESTAMP(ts, 'America/New_York') AS ny_time,
       TO_UTC_TIMESTAMP(ts, 'America/New_York') AS utc_time
FROM df;
```

### Time Zone Handling

Time zone handling is a frequent source of bugs. Spark stores timestamps internally as UTC. The session time zone (`spark.sql.session.timeZone`) controls how timestamps are interpreted when parsing strings and how they are displayed. By default, it is set to the JVM's local time zone.

Key points:

- When parsing a string without a time zone offset, Spark assumes the session time zone.
- `from_utc_timestamp` and `to_utc_timestamp` convert between UTC and a specified time zone.
- `current_timestamp()` returns the current time in UTC, but displayed in session time zone.
- `current_date()` returns the current date in the session time zone.
- To avoid ambiguity, always specify the time zone explicitly when parsing timestamps from strings that include offsets, or set the session time zone to UTC for consistency.

### Performance Implications and Configuration

Date and time functions are implemented as native JVM expressions and are highly optimized. However, there are performance considerations:

- **Avoid Python UDFs** for date operations. Built-in functions run in the JVM and are significantly faster.
- **String parsing** with `to_date` and `to_timestamp` is efficient, but repeated parsing of the same column can be avoided by parsing once and reusing the column.
- **Time zone conversions** are relatively cheap but can be unnecessary if all data is already in a consistent time zone.
- **Filtering on date columns** using `to_date` literals enables partition pruning and predicate pushdown.
- **Date formatting** (`date_format`) returns a string, which is less efficient for subsequent date operations. Prefer keeping dates as `DateType` and only formatting for display.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.session.timeZone` | JVM local time zone | Session time zone for timestamp display and parsing. Set to `UTC` for consistency. |
| `spark.sql.legacy.timeParserPolicy` | `EXCEPTION` | Controls parsing behavior. Options: `EXCEPTION`, `LEGACY`, `CORRECTED`. Spark 3.0 introduced a stricter parser. |
| `spark.sql.ansi.enabled` | `false` | When `true`, invalid date operations throw errors instead of returning null. |

### Best Practices and When to Use

- **Use `DateType` for dates** and `TimestampType` for timestamps. Avoid storing dates as strings.
- **Always specify format strings** when parsing with `to_date` and `to_timestamp` to avoid ambiguity and errors.
- **Set `spark.sql.session.timeZone` to `UTC`** for consistent behavior across environments, especially when data crosses time zones.
- **Use `date_trunc` for truncation** rather than string manipulation followed by re-parsing.
- **Filter early** on date columns to leverage partition pruning.
- **Use `datediff` and `months_between`** for date differences rather than converting to Unix timestamps and dividing.
- **Be explicit about time zones** when using `from_utc_timestamp` and `to_utc_timestamp`. Document the intended time zone for each timestamp column.
- **Avoid `unix_timestamp` and `from_unixtime`** unless working with epoch values; prefer `to_timestamp` and `date_format` for readability.

### Common Pitfalls and Limitations

- **Time zone ambiguity**: Parsing "2023-01-01" as a timestamp yields midnight in the session time zone. If the session time zone is not UTC, the resulting UTC value may differ from expectation.
- **Daylight Saving Time (DST)**: Adding intervals across DST boundaries can produce unexpected results. For example, adding 1 day to a timestamp during a DST transition may result in 23 or 25 hours.
- **Format mismatch**: Using an incorrect format string in `to_date` or `to_timestamp` returns `null` instead of throwing an error (unless ANSI mode is enabled). Always validate parsed results.
- **Legacy parser**: Spark 3.0 changed the date/time parser to be stricter. If migrating from Spark 2.x, set `spark.sql.legacy.timeParserPolicy` to `LEGACY` temporarily to maintain compatibility.
- **`datediff` returns null** if either argument is null. Use `coalesce` or filter nulls beforehand.
- **`months_between` returns fractional months**. Use `round` or `cast` to integer if needed.
- **String comparisons for dates** can be incorrect if formats are not ISO (yyyy-MM-dd). Always compare `DateType` columns.
- **`current_date` and `current_timestamp` are not deterministic** within a query; they are evaluated once per query, not per row. This is usually desired, but be aware.

### Summary

PySpark's date and time functions provide a comprehensive toolkit for parsing, formatting, extracting, and manipulating temporal data. Built-in functions are optimized for the JVM, making them far faster than Python UDFs. The key to correctness lies in understanding time zone handling, using explicit format strings, and preferring `DateType` and `TimestampType` over strings. By following best practices and being aware of common pitfalls such as DST and parser changes, you can build robust and efficient date-time pipelines in Spark 3.x.
