# Guide: Webhook Architecture

The payment provider sends webhook events (`payment.succeeded`, `payment.failed`, `payment.refund_pending`) to the orders service. Each delivery is recorded in `webhook_events` with status DELIVERED or FAILED, the number of attempts, and the last error.

The provider retries 3 times. After that the event stays FAILED until someone replays it. Replaying is idempotent: replaying a delivered event has no effect, and replaying a failed `payment.succeeded` event confirms the order.
