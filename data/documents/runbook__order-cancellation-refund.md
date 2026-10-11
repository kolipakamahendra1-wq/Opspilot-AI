# Runbook: Cancelled Order Without Refund

## Symptoms
Customer cancelled the order but was still charged and no refund appeared.

## Diagnosis
Order status CANCELLED while the payment status is still SUCCESS (not REFUND_PENDING or REFUNDED). The cancellation did not trigger the refund workflow.

## Resolution
A refund must be issued manually by billing. Escalate with `escalate_ticket` and include the order ID, payment ID and amount. Do not replay webhooks; the payment webhook is not the cause.
