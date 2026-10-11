# Guide: Order Lifecycle

Order statuses move in this order:
PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED.
An order can be CANCELLED before it ships.

- PENDING: created, waiting for a successful payment webhook.
- CONFIRMED: payment captured and webhook processed.
- PROCESSING: in the warehouse queue (SLA 72 hours).
- SHIPPED: handed to the carrier.
- DELIVERED: carrier confirmed delivery.

When order, payment and webhook records are consistent (for example a CONFIRMED order, SUCCESS payment and DELIVERED webhook), there is no fault: tell the customer the current order status.
