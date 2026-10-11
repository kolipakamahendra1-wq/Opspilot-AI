# PRD: OpsPilot AI

**Project:** Support Incident Investigation Agent
**Type:** Portfolio / engineering project (not a commercial product)
**Version:** MVP 1.0
**Author:** [Your Name]
**Timeline:** 6 weeks, solo

---

## 1. Overview

OpsPilot AI is an LLM agent that investigates customer support tickets (for example, "payment successful but order still pending"). It reads the ticket, searches internal documentation, queries a database, calls internal APIs, produces a diagnosis with evidence, and proposes a fix. Any action that changes data runs only after a human approves it.

The project demonstrates how to build, evaluate, secure, and deploy a tool-using AI agent, not just call an LLM API.

## 2. Problem Statement

Support engineers investigating a ticket manually have to:

- Search documentation and runbooks
- Look up the order, payment, and webhook records
- Compare the case with earlier incidents
- Decide on a fix and write a report

A plain chatbot cannot do this reliably because it cannot access systems, run multi-step checks, or be held accountable for its actions. This project builds an agent that can, under controlled permissions.

## 3. Goals

1. Build a multi-step agent with planning, tool calling, and error recovery.
2. Implement RAG with source citations.
3. Give the agent safe, restricted access to a database and APIs.
4. Add human-in-the-loop approval before any state-changing action.
5. Measure quality with a repeatable evaluation suite (50 scenarios).
6. Add tracing, security controls, CI/CD, and containerized deployment.

## 4. Non-Goals

- Training or fine-tuning a model
- Fully autonomous execution of risky actions
- Support for many third-party integrations
- Multi-tenant or large-scale production traffic
- Cloud-native infrastructure (Kubernetes, Terraform)

## 5. Users

| Role | Description | Permissions |
|---|---|---|
| Support | Submits tickets, views runs | Create ticket, view own runs |
| Admin | Approves actions, views metrics | All of Support, plus approve/reject, view traces and metrics |

## 6. Primary Use Case

**Input:** Ticket `TICKET-1001`, customer `CUST-1001`, message "My payment succeeded but my order is pending."

**Agent steps:**

1. Classify the ticket (payment issue).
2. Retrieve payment/webhook troubleshooting docs (RAG).
3. Query the order and payment records.
4. Check webhook delivery status.
5. Diagnose: webhook failed, so the order was not updated.
6. Recommend `replay_webhook` with confidence and evidence.
7. Pause for human approval.
8. After approval, execute the action.
9. Verify the order status changed from `PENDING` to `CONFIRMED`.
10. Generate a final report.

## 7. Functional Requirements

### FR-1 Ticket Intake
- Create and retrieve tickets through the REST API.
- Fields: ticket_id, customer_id, message, priority, created_at.

### FR-2 Agent Workflow
- Implemented as a LangGraph state machine.
- States: `CLASSIFY → RETRIEVE → CALL_TOOLS → ANALYZE → DECIDE → AWAIT_APPROVAL → EXECUTE → VERIFY → REPORT`.
- The agent can loop back to `CALL_TOOLS` when it needs more information (max 6 steps).
- Run state is persisted so a run can resume after approval.

### FR-3 RAG Knowledge Base
- Source: 15–20 Markdown troubleshooting docs and runbooks.
- Pipeline: load → clean → chunk → embed → store in pgvector → retrieve top-k.
- Every claim in the final report that comes from documentation must include a source reference.

### FR-4 Tools

| Tool | Type | Approval needed |
|---|---|---|
| `search_knowledge(query)` | Read | No |
| `query_orders_db(sql)` | Read | No |
| `get_order(order_id)` | Read | No |
| `get_payment(payment_id)` | Read | No |
| `get_webhook_status(txn_id)` | Read | No |
| `replay_webhook(txn_id)` | Action | **Yes** |
| `escalate_ticket(ticket_id, reason)` | Action | **Yes** |

- All tools use Pydantic-validated input and output schemas.
- A mock internal service (order, payment, webhook) is built as part of the project.

### FR-5 SQL Tool Safety
- Read-only database role.
- Only `SELECT` statements; reject anything else (parsed, not string-matched).
- Table allowlist, row limit, and query timeout.
- Every query is written to the audit log.

### FR-6 Human Approval
- Action tools create an approval request and stop the run (`status: awaiting_approval`).
- An Admin approves or rejects through the API or UI.
- On approval the action executes, then the agent verifies the result.
- On rejection the run ends with a report that explains it.

### FR-7 Reliability
- Tool timeout: retry up to 2 times.
- Still failing: try an alternative tool when one exists.
- Still failing: escalate to a human with the partial findings.
- Invalid LLM output: re-prompt once with the validation error, then escalate.

### FR-8 Observability
- Each run stores a trace: step, tool name, input, output, latency, tokens, cost, error.
- A metrics page shows totals and averages.

### FR-9 Website
- Full React web application with login, dashboard, tickets, live agent run view, approvals, knowledge base, evaluations, traces, and audit log.
- See Section 20 for pages, flows, and acceptance criteria.

## 8. Security Requirements

| Area | Requirement |
|---|---|
| Authentication | JWT |
| Authorization | Two roles, with a per-role tool allowlist |
| Prompt injection | Retrieved text is treated as untrusted data and kept separate from instructions; tool arguments are schema-validated; instructions found inside documents are never followed |
| Data protection | Mask PII (email, phone, card numbers) in logs and traces |
| Secrets | Environment variables, never committed |
| Abuse | Rate limiting on the API |
| Audit | Log every tool call and every approval decision |

## 9. Architecture

```
React/Streamlit UI
        |
     FastAPI  (auth, rate limit)
        |
  LangGraph Agent  ---- Claude API
        |
  +-----+--------------+------------------+
  |                    |                  |
search_knowledge   query_orders_db    REST tools
  |                    |                  |
pgvector           PostgreSQL        Mock order/payment/
(embeddings)       (read-only role)   webhook service
        |
  Trace + audit tables  -->  Metrics page
```

## 10. Data Model (core tables)

- `tickets` (id, customer_id, message, priority, status, created_at)
- `runs` (id, ticket_id, status, diagnosis, confidence, started_at, finished_at)
- `run_steps` (id, run_id, node, tool, input, output, latency_ms, tokens, cost, error)
- `approvals` (id, run_id, action, status, decided_by, decided_at)
- `audit_log` (id, actor, event, detail, created_at)
- `documents`, `chunks` (text, embedding, source)
- Demo data: `customers`, `orders`, `payments`, `webhook_events` (about 200 seeded records with realistic failure cases)

## 11. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Get JWT |
| POST | `/api/tickets` | Create ticket |
| GET | `/api/tickets/{id}` | Get ticket |
| POST | `/api/agent/run` | Start an agent run |
| GET | `/api/agent/{run_id}` | Run status, diagnosis, evidence |
| POST | `/api/approval/{id}` | Approve or reject an action |
| GET | `/api/traces/{run_id}` | Full trace |
| POST | `/api/knowledge/search` | Search the knowledge base |
| POST | `/api/documents/upload` | Add a document |
| GET | `/api/metrics` | Aggregated metrics |
| GET | `/api/evaluations` | Latest evaluation results |

**Example response from `POST /api/agent/run`:**

```json
{
  "run_id": "RUN-9821",
  "status": "awaiting_approval",
  "diagnosis": "Payment webhook delivery failed",
  "confidence": 0.94,
  "recommended_action": "replay_webhook",
  "evidence": [
    "payment_status=SUCCESS",
    "order_status=PENDING",
    "webhook_status=FAILED"
  ],
  "sources": ["runbook:payment-webhook-recovery"]
}
```

## 12. Evaluation Plan

**Dataset:** 50 scenarios in `data/evaluation/cases.json`.

| Category | Cases |
|---|---|
| Payment | 15 |
| Order | 10 |
| Login / account | 8 |
| Shipping | 7 |
| API failure | 5 |
| Prompt injection | 5 |

**Each case contains:** ticket text, expected tools, expected evidence, expected diagnosis, expected action, and whether a source citation is required.

**Metrics:**

| Metric | Definition |
|---|---|
| Task completion rate | Correct diagnosis and correct action / total cases |
| Tool selection accuracy | Expected tools called / expected tools |
| Retrieval Recall@5 | Correct document appears in the top 5 |
| Groundedness | Share of claims supported by retrieved evidence or tool output |
| Injection resistance | Injection cases where the agent ignored the malicious instruction |
| Latency and cost | Average and p95 per run, from traces |

The evaluation runner is a script (`python -m evaluation.run`) and runs automatically in CI.

## 13. Testing Strategy

- **Unit tests (pytest):** each tool, SQL validator, PII masker, and graph node.
- **Integration tests:** agent + database, agent + RAG, and the full approval flow.
- **Evaluation tests:** the 50-scenario suite, as described above.

## 14. Deployment and CI/CD

- **Local:** `docker compose up` starts the frontend, backend, PostgreSQL (with pgvector), and the mock service.
- **Hosted:** Railway or Render, with a managed PostgreSQL database.
- **GitHub Actions pipeline:** lint → unit tests → integration tests → evaluation → Docker build → deploy.

## 15. Tech Stack

Python 3.12, FastAPI, Pydantic, SQLAlchemy, LangGraph, Anthropic Claude API, PostgreSQL + pgvector, Sentence Transformers (or an embeddings API), React 18 + TypeScript + Vite + Tailwind CSS, Docker Compose, GitHub Actions, pytest. Tracing with Langfuse or an internal `run_steps` table.

## 16. Repository Structure

```
ops-pilot-ai/
├── backend/
│   ├── api/
│   ├── agents/
│   ├── tools/
│   ├── rag/
│   ├── database/
│   ├── security/
│   └── evaluation/
├── mock_service/
├── frontend/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── evaluation/
├── data/
│   ├── documents/
│   └── evaluation/
├── .github/workflows/
├── docker-compose.yml
├── Dockerfile
├── README.md
├── PRD.md
└── architecture.md
```

## 17. Milestones

| Week | Deliverable |
|---|---|
| 1 | FastAPI, PostgreSQL, mock service, seed data, Docker Compose |
| 2 | RAG pipeline with citations and a Recall@5 test |
| 3 | LangGraph agent, tools, SQL safety, approval flow |
| 4 | 50-case evaluation set and runner; fix issues found |
| 5 | Auth, rate limiting, PII masking, injection tests, tracing, UI, metrics page |
| 6 | CI/CD, deployment, README, architecture diagram, demo video |

## 18. Success Criteria

- [ ] Full flow works end to end: ticket → diagnosis → approval → action → verification → report
- [ ] Agent only executes actions after approval (verified by tests)
- [ ] Evaluation suite of 50 cases runs automatically and results are documented honestly
- [ ] All 5 prompt-injection cases are handled safely
- [ ] SQL tool rejects every non-SELECT test query
- [ ] Every run has a complete trace with latency, tokens, and cost
- [ ] `docker compose up` works on a clean machine
- [ ] CI pipeline passes on the main branch
- [ ] README includes the architecture diagram, setup steps, results table, and known limitations
- [ ] 3-minute demo video

## 19. Risks and Limitations

| Risk | Mitigation |
|---|---|
| Scope too large for one person | Strict MVP list above; stretch goals only after everything else works |
| LLM gives inconsistent results | Structured outputs, temperature 0, and the evaluation suite to catch regressions |
| Evaluation data is small and synthetic | State this clearly in the README; do not claim production accuracy |
| Hallucinated evidence | Require citations and tool output for every claim; check groundedness |
| API cost during development | Cache embeddings, use a smaller model for development runs |

The system uses synthetic data and a mock internal service. Results show behavior on the test scenarios only and are not a claim about real production performance.

## 20. Website Specification (Fully Functional Web App)

The project ships as a complete website: a React frontend talking to the FastAPI backend. No page is a mockup; every page reads and writes real data.

### 20.1 Frontend Stack

React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query (data fetching), Recharts (metrics charts), Axios.

### 20.2 Pages

| Route | Page | Role | What it does |
|---|---|---|---|
| `/login` | Login | All | Email and password, receives JWT, redirects by role |
| `/` | Dashboard | All | Summary cards: total tickets, auto-resolved, escalated, success rate, avg resolution time, avg cost, avg latency; recent runs table |
| `/tickets` | Ticket List | All | Search, filter by status/priority, pagination |
| `/tickets/new` | New Ticket | Support, Admin | Form: customer ID, message, priority, product; submit starts an agent run |
| `/runs/:id` | Run Detail | All | Live agent timeline (each step, tool call, result), evidence list with source links, diagnosis, confidence, final report |
| `/approvals` | Approvals | Admin | Pending actions with evidence; Approve / Reject with a note |
| `/knowledge` | Knowledge Base | Admin | Upload documents, list indexed documents, test search box showing retrieved chunks and scores |
| `/evaluations` | Evaluations | Admin | Latest evaluation results: metric cards, per-category table, failed cases list, Run Evaluation button |
| `/traces/:runId` | Trace Viewer | Admin | Step-by-step trace with input, output, latency, tokens, cost, errors (PII masked) |
| `/audit` | Audit Log | Admin | Filterable log of tool calls and approval decisions |
| `/settings` | Settings | Admin | Manage users and roles, view API configuration status (secrets never shown) |

### 20.3 Key User Flows

1. **Investigate a ticket:** Support user creates a ticket → lands on Run Detail → watches steps appear in real time → sees diagnosis with evidence.
2. **Approve an action:** Run reaches `awaiting_approval` → Admin opens Approvals → reviews evidence and confidence → Approve → action executes → verification result and final report appear on Run Detail.
3. **Reject an action:** Admin rejects with a note → run ends and the report records the rejection.
4. **Add knowledge:** Admin uploads a Markdown/PDF file → backend chunks and embeds it → it appears in the document list and is searchable immediately.
5. **Run evaluation:** Admin clicks Run Evaluation → progress is shown → results table and charts update.

### 20.4 Real-Time Updates

- The Run Detail page streams agent steps using Server-Sent Events from `GET /api/agent/{run_id}/stream`.
- Fallback: polling every 2 seconds if the stream disconnects.

### 20.5 Additional API Endpoints for the Website

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tickets?status=&priority=&q=&page=` | Paginated ticket list |
| GET | `/api/agent/{run_id}/stream` | SSE stream of run steps |
| GET | `/api/approvals?status=pending` | Pending approvals |
| GET | `/api/documents` | List indexed documents |
| POST | `/api/evaluations/run` | Start an evaluation run |
| GET | `/api/audit?actor=&event=&page=` | Audit log |
| GET | `/api/users` / POST `/api/users` | Admin user management |
| GET | `/api/me` | Current user and role |

### 20.6 UI Requirements

- Responsive layout (desktop and mobile), sidebar navigation, light and dark mode.
- Loading, empty, and error states on every page.
- Status badges: `running`, `awaiting_approval`, `resolved`, `escalated`, `failed`.
- Role-based UI: menu items and buttons hidden when the user lacks permission (the backend still enforces it).
- Confirmation dialog before Approve / Reject.
- Toast notifications for success and errors.
- Basic accessibility: keyboard navigation, labels, sufficient contrast.

### 20.7 Frontend Structure

```
frontend/
├── src/
│   ├── api/            # Axios client, typed API functions
│   ├── components/     # Button, Badge, Table, Card, Timeline, Modal, Toast
│   ├── features/
│   │   ├── auth/
│   │   ├── tickets/
│   │   ├── runs/
│   │   ├── approvals/
│   │   ├── knowledge/
│   │   ├── evaluations/
│   │   └── audit/
│   ├── hooks/
│   ├── pages/
│   ├── routes/         # Protected routes by role
│   └── types/
├── index.html
├── package.json
└── vite.config.ts
```

### 20.8 Seed Data and Demo Accounts

- On first start, a seed script creates demo users (`admin@demo.com`, `support@demo.com`), about 200 orders/payments/webhook records, 20 knowledge documents, and 10 sample tickets so every page has content immediately.
- Demo passwords are set through environment variables, not hard-coded in the repository.

### 20.9 Website Acceptance Criteria

- [ ] A new user can log in and complete the full flow (create ticket → diagnosis → approval → verified action) using only the website
- [ ] Every page in 20.2 works with real backend data
- [ ] Agent steps appear live on Run Detail
- [ ] A Support user cannot see or call Admin pages and endpoints
- [ ] Document upload makes new content searchable without a restart
- [ ] The Evaluations page can start a run and display results
- [ ] The site works on desktop and mobile widths
- [ ] `docker compose up` serves the website at `http://localhost:3000` with seed data loaded
- [ ] The site is deployed at a public URL

### 20.10 Updated Milestones for the Website

| Week | Addition |
|---|---|
| 1 | Vite + React + Tailwind setup, login page, protected routes, layout |
| 3 | Ticket pages, Run Detail with live stream |
| 4 | Approvals page |
| 5 | Dashboard, Knowledge, Evaluations, Trace Viewer, Audit, Settings pages |
| 6 | Responsive polish, dark mode, end-to-end test of the main flow, deployment |

## 21. Stretch Goals (after MVP)

Hybrid retrieval (BM25 + vector) with a reranker, model routing by task difficulty, Grafana dashboards, long-term memory of past investigations, and AWS deployment.
