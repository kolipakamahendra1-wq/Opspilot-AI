"""Demo failure scenarios.

Each seeded customer is assigned one scenario that shapes their most recent order,
payment and webhook records. The evaluation cases reference these customers, so the
expected diagnosis for a case follows from the scenario.
"""

# code -> (diagnosis text, recommended action, primary knowledge source)
DIAGNOSES: dict[str, tuple[str, str, str]] = {
    "webhook_failed": ("Payment webhook delivery failed, so the order was never updated", "replay_webhook", "runbook:payment-webhook-recovery"),
    "payment_declined": ("Payment was declined by the processor; no charge was captured", "none", "runbook:payment-declined"),
    "duplicate_charge": ("Customer was charged twice for the same order", "escalate_ticket", "runbook:duplicate-charge"),
    "refund_pending": ("Refund is processing and is within the 5-7 business day SLA", "none", "runbook:refund-processing"),
    "no_fault_found": ("No fault found: order, payment and webhook records are consistent", "none", "guide:order-lifecycle"),
    "fulfillment_delay": ("Order is stuck in fulfillment beyond the 72 hour SLA", "escalate_ticket", "runbook:order-fulfillment-delay"),
    "cancelled_no_refund": ("Order was cancelled but the payment was never refunded", "escalate_ticket", "runbook:order-cancellation-refund"),
    "carrier_delay": ("Carrier reported a delivery delay on the shipment", "escalate_ticket", "runbook:shipping-carrier-delay"),
    "in_transit": ("Package is in transit and still within the delivery ETA", "none", "guide:shipping-statuses"),
    "address_issue": ("Carrier could not validate the shipping address", "escalate_ticket", "runbook:shipping-address-issue"),
    "account_locked": ("Account is locked after repeated failed login attempts", "escalate_ticket", "runbook:account-lockout"),
    "email_unverified": ("Email address is not verified, so login is blocked until verification", "none", "runbook:email-verification"),
    "account_ok": ("No account issue found: account is active with no failed logins", "none", "runbook:account-lockout"),
    "api_unavailable": ("Internal API unavailable; escalated to a human with partial findings", "escalate_ticket", "runbook:internal-api-outage"),
}

# Ordered (scenario, count). CUST-1001 is the PRD's primary use case (webhook_failed).
SCENARIO_PLAN: list[tuple[str, int]] = [
    ("webhook_failed", 8),
    ("payment_declined", 4),
    ("duplicate_charge", 4),
    ("refund_pending", 4),
    ("healthy", 6),
    ("fulfillment_delay", 5),
    ("cancelled_no_refund", 4),
    ("carrier_delay", 4),
    ("in_transit", 4),
    ("address_issue", 3),
    ("account_locked", 4),
    ("email_unverified", 4),
    ("webhook_api_down", 4),
    ("all_api_down", 3),
]


def customer_scenarios() -> dict[str, str]:
    out: dict[str, str] = {}
    n = 1001
    for scenario, count in SCENARIO_PLAN:
        for _ in range(count):
            out[f"CUST-{n}"] = scenario
            n += 1
    return out


def customers_for(scenario: str) -> list[str]:
    return [c for c, s in customer_scenarios().items() if s == scenario]
