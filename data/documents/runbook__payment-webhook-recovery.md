# Runbook: Payment Webhook Recovery

## Symptoms
Customer reports the payment succeeded (card was charged) but the order is still pending. Payment status is SUCCESS while order status remains PENDING.

## Root cause
The payment provider sends a `payment.succeeded` webhook to the orders service. When webhook delivery fails (HTTP 5xx, timeout, or the orders service was down), the order is never moved from PENDING to CONFIRMED.

## Diagnosis checklist
1. Look up the order: status should be PENDING.
2. Look up the payment for that order: status SUCCESS.
3. Check webhook delivery status for the payment transaction (txn_id): status FAILED.

All three together confirm a failed payment webhook.

## Resolution
Replay the webhook with `replay_webhook(txn_id)`. This requires human approval. After replay, verify the order status changed from PENDING to CONFIRMED. If the replay fails twice, escalate to the payments on-call engineer.

## Do not
Do not issue a refund or a second charge. The customer has already paid.
