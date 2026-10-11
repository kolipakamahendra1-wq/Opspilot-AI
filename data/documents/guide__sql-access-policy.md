# Guide: SQL Access Policy

The investigation agent queries the database through a read-only role.
- Only SELECT statements are allowed. INSERT, UPDATE, DELETE, DROP and DDL are rejected by a SQL parser.
- Allowed tables: customers, orders, payments, webhook_events.
- Every query gets a row limit of 100 and a 3 second timeout.
- Every query is written to the audit log.
