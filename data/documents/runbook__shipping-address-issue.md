# Runbook: Shipping Address Issue

## Symptoms
Package not delivered, carrier returned the package, address problem on tracking.

## Diagnosis
Shipping status ADDRESS_ISSUE means the carrier could not validate or deliver to the shipping address.

## Resolution
Logistics must contact the customer to confirm the address and redirect the shipment. Escalate with `escalate_ticket` including the carrier and order ID.
