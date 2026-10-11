# Guide: Payment Statuses

- SUCCESS: funds captured.
- FAILED: declined; no funds captured.
- REFUND_PENDING: refund initiated, 5-7 business days.
- REFUNDED: refund complete.

Every payment has a transaction ID (txn_id) used by the payment provider webhooks. One order normally has exactly one SUCCESS payment.
