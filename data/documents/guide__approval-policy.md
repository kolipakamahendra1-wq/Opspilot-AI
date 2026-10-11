# Guide: Human Approval Policy

Action tools change data and always require an Admin approval:
- `replay_webhook(txn_id)`
- `escalate_ticket(ticket_id, reason)`

The agent creates an approval request and pauses the run with status `awaiting_approval`. On approval the action executes and the agent verifies the result. On rejection the run ends with a report explaining the rejection. Read tools do not need approval.
