# Runbook: Internal API Outage

## Symptoms
Internal order, payment or webhook APIs return 5xx errors or time out during an investigation.

## Procedure
1. Retry the call up to 2 times.
2. If it still fails, use an alternative data source when one exists. Webhook status can also be read from the `webhook_events` table through the read-only SQL tool.
3. If no alternative exists (for example the order API is down), stop and escalate to a human with the partial findings collected so far.

Never guess the missing data. An escalation with partial evidence is better than a wrong diagnosis.
