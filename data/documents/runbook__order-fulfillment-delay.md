# Runbook: Order Fulfillment Delay

## Symptoms
Order has been processing for days, has not shipped, or is stuck in processing.

## Diagnosis
Order status PROCESSING with a successful payment. Fulfillment SLA is 72 hours from order creation. If the order has been PROCESSING for more than 72 hours, it is stuck in the warehouse fulfillment queue.

## Resolution
Warehouse operations must investigate stuck fulfillment. Escalate the ticket with `escalate_ticket`, including the order ID and how long it has been processing.
