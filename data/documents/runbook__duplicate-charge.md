# Runbook: Duplicate Charge

## Symptoms
Customer reports being charged twice, double charged, or seeing two payments for one order.

## Diagnosis
Query the payments for the order. Two or more payments with status SUCCESS and the same amount on a single order confirm a duplicate charge. This usually comes from a double-submit at checkout.

## Resolution
Refunds of duplicate charges must be handled by the billing / finance team. Escalate the ticket with `escalate_ticket` and include both payment IDs and transaction IDs as evidence. Agents must not issue refunds directly.
