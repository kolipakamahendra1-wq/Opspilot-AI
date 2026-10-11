export type Role = "support" | "admin";
export type RunStatus = "running" | "awaiting_approval" | "resolved" | "escalated" | "failed" | "rejected";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Ticket {
  ticket_id: string;
  customer_id: string;
  message: string;
  priority: "low" | "medium" | "high" | "urgent";
  product: string | null;
  status: string;
  created_at: string;
  last_run_id?: string | null;
  run_id?: string;
  runs?: { run_id: string; status: RunStatus; started_at: string }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface Step {
  id: number;
  node: string;
  tool: string | null;
  latency_ms: number;
  tokens: number;
  cost: number;
  error: string | null;
  created_at: string;
  output: Record<string, unknown> | null;
  input?: Record<string, unknown> | null;
}

export interface Claim {
  text: string;
  source: string;
}

export interface Approval {
  id: number;
  status: string;
  action: string;
  args: Record<string, unknown>;
  note: string | null;
  decided_at?: string | null;
}

export interface Run {
  run_id: string;
  ticket_id: string;
  status: RunStatus;
  category: string | null;
  diagnosis: string | null;
  diagnosis_code: string | null;
  confidence: number | null;
  recommended_action: string | null;
  evidence: string[];
  claims: Claim[];
  sources: string[];
  retrieved: { source: string; score: number; flagged: boolean }[];
  injection_flags: string[];
  classified_by: string | null;
  diagnosed_by: string | null;
  action: { name: string; args: Record<string, unknown> } | null;
  verification: Record<string, unknown> | null;
  report: string | null;
  approval: Approval | null;
  started_at: string;
  finished_at: string | null;
  steps?: Step[];
  totals?: { latency_ms: number; tokens: number; cost: number };
}

export interface RunSummary {
  run_id: string;
  ticket_id: string;
  customer_id: string;
  status: RunStatus;
  category: string | null;
  diagnosis: string | null;
  confidence: number | null;
  recommended_action: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface PendingApproval {
  id: number;
  action: string;
  args: Record<string, unknown>;
  status: string;
  note: string | null;
  created_at: string;
  ticket: Ticket;
  run: Run;
}

export interface Metrics {
  total_tickets: number;
  total_runs: number;
  auto_resolved: number;
  escalated: number;
  awaiting_approval: number;
  success_rate: number;
  avg_resolution_s: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  avg_tokens: number;
  avg_cost: number;
  status_counts: Record<string, number>;
  category_counts: Record<string, number>;
  runs_by_day: { day: string; runs: number; resolved: number; escalated: number }[];
  tools: { tool: string; calls: number; avg_latency_ms: number }[];
}

export interface DocumentRow {
  id: number;
  source: string;
  title: string;
  chunks: number;
  embed_model: string;
  created_at: string;
}

export interface SearchHit {
  source: string;
  text: string;
  score: number;
}

export interface EvalCase {
  id: string;
  category: string;
  customer_id: string;
  ticket_text: string;
  expected_diagnosis: string;
  actual_diagnosis: string | null;
  expected_action: string;
  actual_action: string;
  predicted_category: string | null;
  correct: boolean;
  recall_at_5: boolean;
  tools_called: string[];
  seconds: number;
  tokens: number;
  run_id: string;
  injection_resisted?: boolean;
}

export interface EvalSummary {
  cases: number;
  task_completion_rate: number;
  tool_selection_accuracy: number;
  recall_at_5: number;
  groundedness: number;
  citation_rate: number;
  evidence_rate: number;
  injection_resistance: number | null;
  avg_latency_ms: number;
  p95_latency_ms: number;
  avg_tokens: number;
  per_category: { category: string; cases: number; correct: number; accuracy: number; recall_at_5: number }[];
  failed_cases: string[];
  error?: string;
}

export interface Evaluation {
  id: number;
  status: "running" | "completed" | "failed";
  mode: "rules" | "llm";
  progress: number;
  total: number;
  summary: EvalSummary;
  started_at: string;
  finished_at: string | null;
  cases?: EvalCase[];
}

export interface AuditEntry {
  id: number;
  actor: string;
  event: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface TraceResponse {
  run_id: string;
  ticket_id: string;
  status: RunStatus;
  steps: Step[];
  totals: { steps: number; latency_ms: number; tokens: number; cost: number; errors: number };
}

export interface SettingsStatus {
  llm: { provider: string; model: string; reachable: boolean | null; api_key_set: boolean };
  embeddings: { provider: string; model: string };
  mock_service: { reachable: boolean };
  security: { jwt_secret_set: boolean; rate_limit_per_minute: number };
  agent: { max_tool_steps: number; tool_timeout_s: number };
}
