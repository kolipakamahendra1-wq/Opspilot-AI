# OpsPilot AI — Architecture

## System

```mermaid
flowchart TB
    subgraph Browser
        UI["React 18 + Vite website<br/>landing · console · live run view"]
    end
    subgraph Frontend container
        NGINX["nginx :3000<br/>static files + /api proxy (SSE unbuffered)"]
    end
    subgraph Backend container
        API["FastAPI<br/>JWT · roles · rate limit · audit"]
        GRAPH["LangGraph agent<br/>state persisted in runs.state"]
        TOOLS["Tool runner<br/>schema validation · allowlist · retries · fallback · trace"]
        RAG["RAG<br/>chunk · embed · pgvector top-k"]
        EVAL["Evaluation runner<br/>50 scenarios"]
    end
    subgraph Mock internal systems
        MOCK["mock_service :8001<br/>orders · payments · webhooks · replay"]
    end
    DB[("PostgreSQL 16 + pgvector<br/>app tables · demo records · chunks")]
    OLLAMA["Ollama on host<br/>qwen2.5:3b · nomic-embed-text"]

    UI --> NGINX --> API
    API --> GRAPH --> TOOLS
    TOOLS -->|search_knowledge| RAG --> DB
    TOOLS -->|query_orders_db<br/>read-only role| DB
    TOOLS -->|get_order / get_payment /<br/>get_webhook_status / replay_webhook| MOCK --> DB
    GRAPH -->|classify · analyze| OLLAMA
    RAG -->|embeddings| OLLAMA
    API --> EVAL --> GRAPH
```

## Agent state machine

```mermaid
stateDiagram-v2
    [*] --> CLASSIFY: phase=investigate
    CLASSIFY --> RETRIEVE
    RETRIEVE --> CALL_TOOLS
    CALL_TOOLS --> CALL_TOOLS: more evidence needed (≤ 6 steps)
    CALL_TOOLS --> ANALYZE: planner done / tool outage
    ANALYZE --> DECIDE
    DECIDE --> REPORT: no action needed
    DECIDE --> AWAIT_APPROVAL: replay_webhook / escalate_ticket
    AWAIT_APPROVAL --> [*]: run paused, state saved

    [*] --> EXECUTE: phase=resume, approved
    [*] --> REPORT: phase=resume, rejected
    EXECUTE --> VERIFY
    VERIFY --> REPORT
    REPORT --> [*]
```

The graph has a conditional entry point. A paused run is resumed by invoking the same graph with
`phase=resume`, so a run survives a server restart between the pause and the decision.

| Node | Rule baseline | With the LLM (`LLM_PROVIDER=ollama`) |
|---|---|---|
| CLASSIFY | keyword scoring | JSON `{category}`; falls back to rules if the LLM is unreachable |
| RETRIEVE | top-5 chunks for `category + ticket text` | same |
| CALL_TOOLS | evidence-driven planner: orders → order → payments → webhook (account: customer row) | same; tools are deterministic so evidence is reproducible |
| ANALYZE | decision table over the evidence | JSON `{diagnosis_code, confidence, summary}` validated against the 14 known codes; invalid twice → escalate (FR-7) |
| DECIDE | diagnosis → action policy + precondition guard | same (the LLM never chooses the action directly) |

## Approval flow

```mermaid
sequenceDiagram
    actor S as Support
    actor A as Admin
    participant API
    participant G as Agent graph
    participant M as Mock service
    S->>API: POST /api/tickets
    API->>G: run (background)
    G->>M: get_order / get_payment / get_webhook_status
    G-->>API: approval row (pending), run=awaiting_approval
    API-->>S: SSE steps on Run Detail
    A->>API: POST /api/approval/{id} {approve, note}
    API->>G: resume (phase=resume)
    G->>G: EXECUTE re-checks the approval in the DB
    G->>M: replay_webhook(txn_id)
    G->>M: get_order → CONFIRMED (VERIFY)
    G-->>API: report, run=resolved
```

## Safety controls

| Control | Where |
|---|---|
| Only `SELECT`, single statement, 4-table allowlist, forced `LIMIT 100` | `backend/tools/sql_guard.py` (sqlglot AST) |
| Read-only Postgres role, `default_transaction_read_only`, 3 s timeout | `backend/database/initdb/01-roles.sql` |
| Per-role tool allowlist | `backend/security/auth.py` `ROLE_TOOLS` |
| Action tools need an approved DB row | `backend/agents/graph.py` `execute()` |
| Replay precondition (FAILED webhook for a SUCCESS payment) | `backend/agents/graph.py` `decide()` |
| Untrusted text wrapped as `<ticket>` / `<untrusted_document>` data, injection patterns flagged | `backend/agents/reasoning.py` |
| PII masking in traces, audit entries and reports | `backend/security/pii.py` |
| Rate limiting (120/min, login 10/min) | `backend/security/rate_limit.py` |

## Data model

`users`, `tickets`, `runs` (with JSON `state`), `run_steps` (trace), `approvals`, `audit_log`,
`documents`, `chunks` (`vector(768)`), `evaluations`, plus demo systems `customers`, `orders`,
`payments`, `webhook_events`.
