# 4.8 Security And Governance

Spark security and governance cover the controls that protect data, compute, and metadata in a distributed environment. A Spark cluster processes data across multiple nodes, reads from and writes to external storage, and serves a web UI that exposes job details. Without authentication, authorization, encryption, and auditing, any user with network access could submit jobs, read shuffle data, or impersonate another user. Governance extends security with data catalogs, access policies, lineage, and compliance controls that make the platform auditable and trustworthy. In interviews, this topic tests whether you can layer defenses from the perimeter to the data, and whether you understand the trade-offs between security and performance.

#### Authentication: Verifying Identity

Authentication answers the question "who are you?" Spark supports several authentication mechanisms, each suited to a different deployment model.

| Mechanism | How It Works | When to Use |
|---|---|---|
| **Kerberos** | Ticket-based mutual authentication; the user obtains a TGT from the KDC and presents it to Spark services | Enterprise Hadoop clusters (YARN, HDFS) |
| **LDAP** | Username and password verified against a directory server | Spark Thrift Server, JDBC/ODBC clients |
| **Shared secret** | A secret key is configured in `spark.authenticate.secret`; all nodes must present it | Standalone clusters, simple shared environments |
| **SASL** | Simple Authentication and Security Layer negotiates authentication between nodes | Internal RPC encryption |
| **PAM** | Pluggable Authentication Modules verify local system credentials | Linux environments without Kerberos |

Kerberos is the standard for Hadoop-integrated Spark deployments. The principal and keytab are configured with `spark.security.kerberos.principal` and `spark.security.kerberos.keytab`. The keytab file must be protected with strict file permissions, because it allows the holder to authenticate as the service principal.

```python
spark = (
    SparkSession.builder
    .appName("KerberosAuthDemo")
    .config("spark.security.kerberos.principal", "spark/_HOST@EXAMPLE.COM")
    .config("spark.security.kerberos.keytab", "/etc/security/keytabs/spark.keytab")
    .config("spark.authenticate", "true")
    .getOrCreate()
)
```

For Spark Thrift Server, LDAP authentication is configured with `spark.sql.hive.server2.authentication=LDAP` and related parameters. JDBC clients connect with a username and password that is verified against the LDAP directory.

#### Authorization: Controlling Access

Authorization answers the question "what are you allowed to do?" Spark provides two levels of authorization: **ACLs** for the Spark UI and application management, and **fine-grained access control (FGAC)** for data access.

**ACLs** control who can view or modify a Spark application in the UI. They are disabled by default.

| Parameter | Default | Description |
|---|---|---|
| `spark.acls.enable` | `false` | Enables ACL checks for the Spark UI and application management. |
| `spark.admin.acls` | Empty | Comma-separated list of users with admin access to all applications. |
| `spark.admin.acls.groups` | Empty | Comma-separated list of groups with admin access. |
| `spark.ui.view.acls` | Empty | Users who can view the application UI. |
| `spark.ui.view.acls.groups` | Empty | Groups who can view the application UI. |
| `spark.modify.acls` | Empty | Users who can modify the application. |
| `spark.user.groups.mapping` | `ShellBasedGroupsMappingProvider` | Provider that maps usernames to groups. |

When ACLs are enabled, Spark checks whether the authenticated user has permission to view or modify the application. A `*` in an ACL list grants access to all users. The `spark.user.groups.mapping` parameter determines how groups are resolved from usernames.

**Fine-grained access control (FGAC)** restricts access at the database, table, column, row, and cell level. Native Spark does not provide FGAC out of the box. It is delivered through external systems such as:

- **Apache Ranger**: A centralized security framework that provides a Spark plugin for SQL authorization. It enforces policies when queries are submitted through Spark Thrift Server.
- **AWS Lake Formation**: Enforces FGAC policies for EMR Serverless and EMR on EKS, including row and column filtering.
- **Microsoft OneLake Security**: Enforces row-level and column-level security policies when users read lakehouse Delta tables from Spark notebooks and job definitions.
- **Unity Catalog** (Databricks): Provides fine-grained access control, lineage, and auditing across workspaces.

FGAC restricts certain PySpark APIs to maintain data access controls. Functions that bypass the security layer—such as direct file path access—are blocked or return access-denied errors. This means that pipelines relying on direct file path reads cannot access tables protected by row or column-level security policies.

#### Encryption: Protecting Data at Rest and in Transit

Encryption ensures that data is unreadable without the correct key. Spark supports encryption in three areas: data at rest, data in transit, and shuffle data.

**Encryption in transit** uses TLS/SSL to protect communication between the driver, executors, and external services. It is disabled by default.

| Parameter | Default | Description |
|---|---|---|
| `spark.ssl.enabled` | `false` | Enables SSL connections on all supported protocols. |
| `spark.ssl.protocol` | None | Required when `spark.ssl.enabled=true`. Specifies the TLS protocol version. |
| `spark.ssl.keyStore` | None | Path to the key store file containing the server certificate. |
| `spark.ssl.keyStorePassword` | None | Password for the key store. |
| `spark.ssl.trustStore` | None | Path to the trust store containing trusted certificates. |
| `spark.ssl.trustStorePassword` | None | Password for the trust store. |
| `spark.ssl.enabledAlgorithms` | Empty | Comma-separated list of allowed cipher suites. |
| `spark.ssl.keyPassword` | None | Password for the private key in the key store. |

SSL can be configured per namespace for different services such as `fs`, `ui`, `standalone`, and `historyServer`. For example, `spark.ssl.ui.enabled=true` enables SSL only for the Spark UI.

**Internal RPC encryption** protects communication between Spark components. It is controlled by `spark.authenticate` and `spark.network.crypto.enabled`.

| Parameter | Default | Description |
|---|---|---|
| `spark.authenticate` | `false` | Enables authentication for internal Spark RPC. |
| `spark.network.crypto.enabled` | `false` | Enables encryption for internal RPC. |
| `spark.network.crypto.keyLength` | `256` | Length of the encryption key. |
| `spark.io.encryption.enabled` | `false` | Enables encryption for local temporary files and shuffle data. |

A man-in-the-middle vulnerability in Spark versions before 4.0.0, 3.5.2, and 3.4.4 used an insecure default network encryption cipher for RPC communication, allowing an attacker to modify encrypted traffic undetected. Upgrading to a patched version or explicitly configuring a strong cipher mitigates this.

**Encryption at rest** is typically handled by the storage layer: HDFS transparent encryption, S3 SSE-KMS, Azure Storage Service Encryption, or GCS customer-managed encryption keys. Spark does not encrypt data at rest itself; it relies on the storage system.

#### Auditing and Logging

Auditing records who did what, when, and from where. It is the foundation of compliance and forensic analysis.

Spark event logs record job, stage, and task events when `spark.eventLog.enabled=true`. These logs are used by the History Server and can be retained for auditing. The Spark UI can expose sensitive information such as file paths and SQL query text; access should be restricted with ACLs and SSL.

For deeper auditing, external frameworks capture access and operation logs:

- **Apache Ranger** records audit logs for data access operations, including user, operation type, and timestamp.
- **Unity Catalog** automatically logs all permission changes and data access events, providing a complete audit trail.
- **Huawei Cloud MRS** supports `spark.audit.log.enabled`, `spark.audit.log.dir`, and `spark.audit.log.fs.cleaner.maxAge` to control audit logging. The audit feature is server-controlled so clients cannot disable it.

| Audit Source | What It Captures | Retention Control |
|---|---|---|
| Spark event logs | Job, stage, and task events | Log rotation and file system lifecycle |
| Apache Ranger | Data access operations | Ranger audit log configuration |
| Unity Catalog | Permission changes and data access | System table retention |
| Cloud-native logging | Platform-level access and API calls | Cloud logging service retention |

#### Governance: Data Catalogs, Lineage, and Compliance

Governance extends security with the metadata and processes that make data discoverable, trustworthy, and compliant.

- **Data catalogs** (Hive Metastore, Unity Catalog, AWS Glue Data Catalog) store table schemas, locations, and access policies. They provide a single source of truth for data definitions.
- **Lineage** tracks how data flows from source to destination. Unity Catalog and Apache Atlas provide column-level lineage, which is essential for impact analysis and regulatory reporting.
- **Data classification** tags columns with sensitivity levels (PII, PHI, financial). This enables automated masking and access policies.
- **PII masking and tokenization** protect sensitive data in analytics. Delta Lake supports column-level masking through Unity Catalog or custom UDFs that apply format-preserving encryption or hashing.
- **Retention policies** define how long data is kept. Delta Lake's `VACUUM` and table properties such as `delta.deletedFileRetentionDuration` implement retention at the table level.

```sql
-- Apply a column mask using Unity Catalog (Databricks)
ALTER TABLE customers ALTER COLUMN email SET MASK mask_email;

-- Apply row-level security
ALTER TABLE customers ADD CONSTRAINT valid_region CHECK (region IN ('US', 'EU'));
```

#### Complete Python Example: Secure Configuration

The following self-contained example configures a Spark session with authentication, ACLs, SSL, and internal RPC encryption.

```python
from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("SecureSparkDemo")
    # Authentication
    .config("spark.authenticate", "true")
    .config("spark.security.kerberos.principal", "spark/_HOST@EXAMPLE.COM")
    .config("spark.security.kerberos.keytab", "/etc/security/keytabs/spark.keytab")
    # Authorization (ACLs)
    .config("spark.acls.enable", "true")
    .config("spark.admin.acls", "admin_user")
    .config("spark.admin.acls.groups", "data_engineers")
    .config("spark.ui.view.acls", "analyst_user")
    .config("spark.ui.view.acls.groups", "analytics")
    # Encryption in transit (TLS/SSL)
    .config("spark.ssl.enabled", "true")
    .config("spark.ssl.protocol", "TLSv1.3")
    .config("spark.ssl.keyStore", "/etc/security/ssl/spark.jks")
    .config("spark.ssl.keyStorePassword", "keystore_password")
    .config("spark.ssl.trustStore", "/etc/security/ssl/truststore.jks")
    .config("spark.ssl.trustStorePassword", "truststore_password")
    # Internal RPC encryption
    .config("spark.network.crypto.enabled", "true")
    .config("spark.network.crypto.keyLength", "256")
    .config("spark.io.encryption.enabled", "true")
    # Event logging for auditing
    .config("spark.eventLog.enabled", "true")
    .config("spark.eventLog.dir", "hdfs:///spark-logs/secure")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

# Run a simple query
df = spark.range(0, 1000)
df.createOrReplaceTempView("numbers")

result = spark.sql("SELECT count(*) AS cnt FROM numbers")
result.show()

spark.stop()
```

#### SQL Equivalents

Security configuration is not expressed in SQL, but SQL is used to manage access policies in governance platforms.

```sql
-- Grant table access (Unity Catalog / Hive Metastore)
GRANT SELECT ON TABLE sales TO ROLE analyst;

-- Revoke access
REVOKE SELECT ON TABLE sales FROM ROLE analyst;

-- Create a view with masked data
CREATE VIEW masked_customers AS
SELECT id, mask_email(email) AS email, region
FROM customers
WHERE region IN ('US', 'EU');

-- Grant access to the view
GRANT SELECT ON VIEW masked_customers TO ROLE analyst;
```

#### Security Configuration Parameters

| Parameter | Default | Description |
|---|---|---|
| `spark.authenticate` | `false` | Enables authentication for internal Spark RPC. |
| `spark.acls.enable` | `false` | Enables ACL checks for the Spark UI. |
| `spark.admin.acls` | Empty | Users with admin access to all applications. |
| `spark.ui.view.acls` | Empty | Users who can view the application UI. |
| `spark.modify.acls` | Empty | Users who can modify the application. |
| `spark.ssl.enabled` | `false` | Enables SSL connections on all supported protocols. |
| `spark.ssl.protocol` | None | TLS protocol version (required when SSL is enabled). |
| `spark.ssl.keyStore` | None | Path to the key store. |
| `spark.ssl.trustStore` | None | Path to the trust store. |
| `spark.network.crypto.enabled` | `false` | Enables encryption for internal RPC. |
| `spark.network.crypto.keyLength` | `256` | Length of the RPC encryption key. |
| `spark.io.encryption.enabled` | `false` | Enables encryption for local temporary files and shuffle data. |
| `spark.eventLog.enabled` | `false` | Enables event logging for auditing and History Server. |
| `spark.eventLog.dir` | `file:///tmp/spark-events` | Directory for event logs. |
| `spark.audit.log.enabled` | `false` (platform-specific) | Enables audit logging on platforms that support it. |
| `spark.user.groups.mapping` | `ShellBasedGroupsMappingProvider` | Maps usernames to groups for ACL checks. |
| `spark.sql.authorization.enabled` | `false` | Enables authorization checks for SQL data sources. |

#### Trade-offs

| Choice | Benefit | Cost |
|---|---|---|
| Kerberos authentication | Strong, centralized identity | Operational complexity; keytab management |
| LDAP authentication | Simple integration with existing directories | Passwords transmitted unless SSL is enabled |
| ACLs enabled | UI and application access control | Additional configuration; user-to-group mapping required |
| FGAC (Ranger, Lake Formation) | Row and column-level data protection | Restricted PySpark APIs; performance overhead |
| SSL/TLS enabled | Encrypted communication | Certificate management; slight latency |
| RPC encryption enabled | Internal traffic protection | CPU overhead for encryption |
| Event logging enabled | Auditing and History Server | Storage cost; slight runtime overhead |
| Audit logging enabled | Compliance and forensics | Storage cost; performance overhead |

#### Best Practices

- Enable Kerberos for enterprise Hadoop clusters. Store keytabs with strict file permissions and rotate them regularly.
- Enable `spark.acls.enable=true` and configure `spark.admin.acls` and `spark.ui.view.acls` to restrict UI access.
- Use TLS/SSL for all external communication and set `spark.ssl.enabled=true` with a modern protocol such as TLSv1.3.
- Enable `spark.network.crypto.enabled=true` and `spark.io.encryption.enabled=true` for defense in depth.
- Enable event logging (`spark.eventLog.enabled=true`) and retain logs according to compliance requirements.
- Deploy FGAC through Ranger, Lake Formation, or Unity Catalog for tables containing sensitive data.
- Classify data and apply masking or tokenization to PII columns at the catalog level.
- Use service accounts with least-privilege permissions for Spark jobs accessing external storage.
- Keep Spark versions up to date to mitigate known vulnerabilities such as CVE-2018-11760 and the RPC encryption weakness.
- Test security configuration in a staging environment before applying it to production.

#### Common Pitfalls and Limitations

- Leaving `spark.acls.enable=false` and `spark.authenticate=false` in production. The Spark UI is accessible without authentication, and job details can be viewed by anyone with network access.
- Storing keytabs in world-readable locations or committing them to version control.
- Enabling SSL without configuring `spark.ssl.protocol`. Spark requires the protocol to be explicitly set when SSL is enabled.
- Using the default insecure RPC cipher in Spark versions before 4.0.0, 3.5.2, and 3.4.4. Upgrade or explicitly configure a strong cipher.
- Assuming native Spark provides FGAC. It does not; FGAC requires an external framework such as Ranger, Lake Formation, or Unity Catalog.
- Direct file path access to tables protected by row or column-level security policies is blocked. Pipelines must use catalog access, not file paths.
- Certain PySpark functions are blocked by FGAC allow-lists and return access-denied errors. Test pipelines against the FGAC policy before deployment.
- Event logs and the Spark UI can expose sensitive data such as file paths and SQL text. Restrict access and consider redacting sensitive information.
- Security configuration is not enabled by default. Every production cluster requires explicit hardening.
- CVE-2018-11760 allowed a local user to impersonate the Spark application user in versions 1.x through 2.3.1. Keep Spark patched.

#### Summary

Security and governance in Spark require layered controls: authentication to verify identity, authorization to control access, encryption to protect data, and auditing to record activity. Kerberos and LDAP provide authentication; ACLs and FGAC provide authorization; TLS/SSL and RPC encryption protect data in transit; event logs and external audit systems provide accountability. Governance extends these controls with data catalogs, lineage, classification, and retention policies. In interviews, emphasize that native Spark does not provide FGAC, that ACLs and authentication are disabled by default, and that the strongest architectures combine Kerberos, TLS, RPC encryption, event logging, and a governance platform such as Unity Catalog or Apache Ranger.

Notebook link: {{NOTEBOOK_URL}}
