# Runbook: Shipping Carrier Delay

## Symptoms
Package is late, tracking has not moved, delivery is overdue.

## Diagnosis
Order status SHIPPED and shipping status DELAYED, or the ETA is in the past. The carrier has reported a delay in the shipment.

## Resolution
Open a trace request with the carrier. Escalate the ticket with `escalate_ticket` to the logistics team, including the carrier name and order ID. Offer the customer an updated delivery estimate once logistics responds.
