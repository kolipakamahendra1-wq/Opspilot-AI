# Runbook: Payment Declined

## Symptoms
Customer says the card payment did not go through, checkout failed, or the order is stuck awaiting payment.

## Diagnosis
Payment status is FAILED. The `payment.failed` webhook was delivered, and the order remains PENDING because no funds were captured. No money was taken from the customer.

## Resolution
No system action is needed. Tell the customer the payment was declined by the card issuer or processor, and ask them to retry checkout with another card or contact their bank. Do not replay webhooks for failed payments; replaying cannot turn a declined payment into a successful one.
