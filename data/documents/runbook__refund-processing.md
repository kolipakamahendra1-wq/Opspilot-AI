# Runbook: Refund Processing

## Symptoms
Customer cancelled an order and asks where the refund is, or says the refund has not arrived.

## Diagnosis
For a cancelled order, payment status REFUND_PENDING means the refund was initiated and is in progress with the card network. REFUNDED means complete.

## SLA
Refunds take 5-7 business days to appear on the customer statement. If the refund is pending and inside the SLA, no action is needed: inform the customer of the timeline.

If the order is CANCELLED but the payment is still SUCCESS (no refund initiated), see the order cancellation refund runbook.
