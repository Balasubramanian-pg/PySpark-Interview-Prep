# 2.5 String Manipulation And Regex

String manipulation is one of the most common tasks in data engineering, covering cleaning, parsing, extracting, and transforming textual data. PySpark provides a comprehensive set of built-in string functions and regular expression (regex) functions that execute natively in the JVM, avoiding the overhead of Python UDFs. Mastering these functions is essential for writing efficient and maintainable PySpark pipelines, especially when dealing with log data, JSON fields, or free-text columns.

### Common String Functions

PySpark's `pyspark.sql.functions` module offers a wide range of string functions. The table below summarizes the most frequently used ones.

| Function | Description | Example |
|----------|-------------|---------|
| `concat(*cols)` | Concatenates multiple columns. | `concat("a", "b")` |
| `concat_ws(sep, *cols)` | Concatenates with a separator. | `concat_ws("-", "a", "b")` |
| `upper(col)` | Converts to uppercase. | `upper("name")` |
| `lower(col)` | Converts to lowercase. | `lower("name")` |
| `initcap(col)` | Capitalizes first letter of each word. | `initcap("name")` |
| `trim(col)` | Removes leading and trailing whitespace. | `trim("text")` |
| `ltrim(col)` | Removes leading whitespace. | `ltrim("text")` |
| `rtrim(col)` | Removes trailing whitespace. | `rtrim("text")` |
| `lpad(col, len, pad)` | Left-pads to length. | `lpad("id", 5, "0")` |
| `rpad(col, len, pad)` | Right-pads to length. | `rpad("id", 5, "0")` |
| `length(col)` | Returns string length. | `length("text")` |
| `substring(col, pos, len)` | Extracts substring (1-based). | `substring("text", 1, 3)` |
| `split(col, pattern)` | Splits string by pattern. | `split("tags", ",")` |
| `instr(col, substr)` | Returns 1-based index of substring. | `instr("text", "a")` |
| `locate(substr, col)` | Same as `instr` but argument order. | `locate("a", "text")` |
| `translate(col, matching, replace)` | Replaces characters. | `translate("abc", "a", "x")` |
| `repeat(col, n)` | Repeats string n times. | `repeat("ab", 3)` |
| `reverse(col)` | Reverses string. | `reverse("abc")` |
| `regexp_replace(col, pattern, replacement)` | Replaces regex matches. | `regexp_replace("text", "\\d+", "")` |
| `regexp_extract(col, pattern, idx)` | Extracts capture group. | `regexp_extract("text", "(\\d+)", 1)` |
| `regexp_extract_all(col, pattern, idx)` | Extracts all matches (Spark 3.1+). | `regexp_extract_all("text", "(\\d+)", 1)` |
| `rlike(col, pattern)` | Returns true if regex matches. | `rlike("text", "^\\d+$")` |

#### Code Examples

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    concat, concat_ws, upper, lower, trim, lpad, length,
    substring, split, regexp_replace, regexp_extract, rlike, col
)

spark = SparkSession.builder.appName("StringFunctions").getOrCreate()

data = [
    (1, "  Alice Smith  ", "alice@example.com", "2023-01-15"),
    (2, "  Bob Jones  ", "bob@test.com", "2023-02-20"),
]
df = spark.createDataFrame(data, ["id", "name", "email", "date_str"])

# Basic cleaning and transformation
df_clean = df.select(
    "id",
    trim("name").alias("clean_name"),
    upper(trim("name")).alias("upper_name"),
    length(trim("name")).alias("name_len"),
    concat_ws("-", "id", substring("date_str", 1, 4)).alias("id_year")
)
df_clean.show(truncate=False)

# Split and regex
df_regex = df.select(
    "id",
    split("email", "@")[0].alias("user"),
    regexp_extract("email", "([^@]+)@(.+)", 1).alias("user_regex"),
    regexp_extract("email", "([^@]+)@(.+)", 2).alias("domain"),
    regexp_replace("date_str", "-", "/").alias("date_slash")
)
df_regex.show(truncate=False)

# Filter with rlike
df.filter(rlike("email", "^[a-z]+@example\\.com$")).show()
```

### Regular Expression Functions

Regex functions are powerful for pattern matching and extraction. They use the Java regex engine, which is similar to Perl syntax.

- **`regexp_replace(col, pattern, replacement)`**: Replaces all occurrences of `pattern` with `replacement`. To replace only the first occurrence, anchor the pattern or use `regexp_extract` with concatenation.
- **`regexp_extract(col, pattern, idx)`**: Extracts the `idx`-th capture group. `idx = 0` returns the entire match. If no match, returns an empty string.
- **`regexp_extract_all(col, pattern, idx)`**: Returns an array of all matches for the capture group (Spark 3.1+).
- **`rlike(col, pattern)`**: Returns `true` if the string matches the regex pattern. Equivalent to SQL `RLIKE`.
- **`split(col, pattern)`**: Splits by a regex pattern. Use `split(col, "\\|")` to split on a literal pipe.

#### Code Examples with Capture Groups

```python
from pyspark.sql.functions import regexp_extract, regexp_extract_all, regexp_replace

# Sample log data
log_data = [
    ("2023-01-15 10:30:00 ERROR [main] com.example.App - NullPointerException"),
    ("2023-01-15 10:31:00 INFO  [worker] com.example.Service - Started"),
]
log_df = spark.createDataFrame(log_data, ["log_line"])

# Extract log level, thread, and message
log_df.select(
    regexp_extract("log_line", r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (\w+)", 1).alias("level"),
    regexp_extract("log_line", r"\[(\w+)\]", 1).alias("thread"),
    regexp_extract("log_line", r"- (.+)$", 1).alias("message")
).show(truncate=False)

# Extract all numbers from a string
num_df = spark.createDataFrame([("abc123def456ghi789",)], ["text"])
num_df.select(regexp_extract_all("text", r"(\d+)", 1).alias("numbers")).show()
```

### SQL Equivalents

All string and regex functions have direct SQL counterparts.

```sql
-- Basic string functions
SELECT id,
       TRIM(name) AS clean_name,
       UPPER(TRIM(name)) AS upper_name,
       LENGTH(TRIM(name)) AS name_len,
       CONCAT_WS('-', id, SUBSTRING(date_str, 1, 4)) AS id_year
FROM df;

-- Regex extraction
SELECT id,
       SPLIT(email, '@')[0] AS user,
       REGEXP_EXTRACT(email, '([^@]+)@(.+)', 1) AS user_regex,
       REGEXP_EXTRACT(email, '([^@]+)@(.+)', 2) AS domain,
       REGEXP_REPLACE(date_str, '-', '/') AS date_slash
FROM df;

-- Filter with RLIKE
SELECT * FROM df WHERE email RLIKE '^[a-z]+@example\\.com$';

-- Extract all numbers
SELECT REGEXP_EXTRACT_ALL(text, '(\\d+)', 1) AS numbers FROM num_df;
```

### Performance Implications and Configuration

String and regex functions are implemented as native JVM expressions, making them significantly faster than Python UDFs. However, performance can still degrade with poorly written regex or large text columns.

- **Regex complexity**: Catastrophic backtracking in regex patterns can cause exponential time complexity. Avoid nested quantifiers like `(a+)+` and prefer specific character classes.
- **Large strings**: Operations on very large text fields (e.g., multi-megabyte JSON blobs) can cause memory pressure and slow processing. Consider parsing only the necessary parts.
- **Repeated parsing**: If you parse the same string multiple times with `regexp_extract`, consider using a single regex with multiple capture groups or a UDF that parses once.
- **Built-in vs UDF**: Always prefer built-in functions. Python UDFs incur serialization and JVM-Python communication overhead.
- **Column pruning and predicate pushdown**: Filtering with `rlike` or `regexp_extract` can sometimes be pushed down to the data source if the format supports it (e.g., Parquet with predicate pushdown), but regex is generally not pushdown-able.

Relevant configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spark.sql.ansi.enabled` | `false` | When `true`, some string functions throw errors on invalid input (e.g., `substring` with out-of-range indices). |
| `spark.sql.parser.escapedStringLiterals` | `false` | Controls parsing of escape sequences in string literals. Rarely changed. |
| `spark.sql.shuffle.partitions` | `200` | Tune when grouping or joining on string columns after transformation. |
| `spark.sql.adaptive.enabled` | `true` (Spark 3.2+) | Helps optimize shuffles after string operations. |

### Best Practices and When to Use

- **Use built-in functions** whenever possible. They are optimized and run in the JVM.
- **Prefer `regexp_extract` with capture groups** over multiple `regexp_replace` calls. Extract once and reuse.
- **Use `split` for simple delimiters** (e.g., comma, pipe) rather than regex when possible. `split` with a literal string is faster.
- **Escape regex special characters** properly. In Python strings, use raw strings (`r"..."`) to avoid double escaping.
- **Use `rlike` for filtering** rather than `regexp_extract` followed by a null check.
- **Normalize case early** if you need case-insensitive matching. Use `lower` or `upper` on the column once, then apply regex.
- **Consider `translate` for character-level replacements** instead of regex when replacing single characters.
- **When to use regex**: For pattern matching, extraction of structured substrings, validation, and complex replacements. Avoid regex for simple exact string operations.

### Common Pitfalls and Limitations

- **Escaping backslashes**: In Python strings, a backslash is an escape character. Use raw strings (`r"\d+"`) or double backslashes (`"\\d+"`).
- **`regexp_extract` returns empty string**: If the pattern does not match, `regexp_extract` returns an empty string, not `null`. Use `when` and `length` to convert to null if needed.
- **`regexp_replace` replaces all occurrences**: There is no built-in limit parameter. To replace only the first occurrence, anchor the pattern or use `regexp_extract` and concatenate.
- **`split` with regex special characters**: Characters like `.`, `|`, `*`, `+`, `?`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$` have special meaning. Escape them with `\\`.
- **Locale-sensitive case conversion**: `upper` and `lower` use the JVM's default locale. For consistent behavior across environments, set `spark.sql.session.locale` to a fixed locale (e.g., `en-US`).
- **Null propagation**: Most string functions return `null` if the input is `null`. Use `coalesce` or `fillna` to handle nulls before transformation.
- **Performance of `regexp_extract_all`**: This function returns an array and can explode memory if the number of matches is large. Use with caution on large text.
- **Unicode normalization**: Spark does not perform Unicode normalization. If your data contains combining characters or different Unicode representations, consider normalizing with `normalize` (Spark 3.5+) or a UDF.

### Summary

PySpark's string manipulation and regex functions provide a powerful, JVM-native toolkit for cleaning, parsing, and transforming text data. Built-in functions such as `trim`, `upper`, `split`, `regexp_extract`, and `regexp_replace` cover the vast majority of use cases and outperform Python UDFs. Correctness depends on proper escaping, understanding return values (e.g., empty strings vs. nulls), and being aware of regex performance pitfalls. By following best practices and leveraging SQL equivalents, you can write efficient and maintainable string processing pipelines in Spark 3.x.
