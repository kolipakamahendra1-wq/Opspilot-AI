# Escalation Policy

Escalate a ticket with `escalate_ticket(ticket_id, reason)` when:
- money must be moved (refunds, duplicate charges),
- a physical process is stuck (warehouse, carrier, address),
- an account must be unlocked (identity verification),
- the investigation cannot finish because a system is unavailable.

Every escalation requires approval by an Admin before it is sent. Include the evidence and the reason.
