import { api } from "./client";
import type {
  AuditEntry, DocumentRow, Evaluation, Metrics, Paged, PendingApproval, Run, RunSummary,
  SearchHit, SettingsStatus, Ticket, TraceResponse, User,
} from "@/types";

const get = <T,>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data);
const post = <T,>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data);

export const Api = {
  login: (email: string, password: string) =>
    post<{ access_token: string; user: User }>("/api/auth/login", { email, password }),
  me: () => get<User>("/api/me"),

  tickets: (p: { status?: string; priority?: string; q?: string; page?: number; page_size?: number }) =>
    get<Paged<Ticket>>("/api/tickets", p),
  ticket: (id: string) => get<Ticket>(`/api/tickets/${id}`),
  createTicket: (body: { customer_id: string; message: string; priority: string; product?: string }) =>
    post<Ticket>("/api/tickets", body),

  runs: (limit = 10) => get<RunSummary[]>("/api/runs", { limit }),
  run: (id: string) => get<Run>(`/api/agent/${id}`),
  startRun: (ticket_id: string) => post<{ run_id: string; status: string }>("/api/agent/run", { ticket_id }),

  approvals: (status = "pending") => get<PendingApproval[]>("/api/approvals", { status }),
  decide: (id: number, decision: "approve" | "reject", note?: string) =>
    post<{ run_id: string }>(`/api/approval/${id}`, { decision, note }),

  trace: (runId: string) => get<TraceResponse>(`/api/traces/${runId}`),
  metrics: () => get<Metrics>("/api/metrics"),

  documents: () => get<DocumentRow[]>("/api/documents"),
  search: (query: string, k = 5) => post<{ results: SearchHit[] }>("/api/knowledge/search", { query, k }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ source: string; title: string }>("/api/documents/upload", fd).then((r) => r.data);
  },

  evaluations: () => get<{ latest: Evaluation | null; history: Evaluation[] }>("/api/evaluations"),
  publicEval: () => get<Record<string, number | string | boolean | null>>("/api/evaluations/public-summary"),
  sqlCheck: (sql: string) => post<{ allowed: boolean; sql?: string; reason?: string }>("/api/public/sql-check", { sql }),
  runEvaluation: (mode: "rules" | "llm", limit?: number) =>
    post<{ evaluation_id: number }>("/api/evaluations/run", { mode, limit }),

  audit: (p: { actor?: string; event?: string; page?: number }) =>
    get<Paged<AuditEntry> & { events: string[] }>("/api/audit", p),

  users: () => get<User[]>("/api/users"),
  createUser: (body: { email: string; name: string; role: string; password: string }) => post<User>("/api/users", body),
  updateUser: (id: number, body: { role?: string; active?: boolean }) =>
    api.patch<User>(`/api/users/${id}`, body).then((r) => r.data),
  settingsStatus: () => get<SettingsStatus>("/api/settings/status"),
  resetDemo: () => post<{ ok: boolean }>("/api/settings/reset-demo"),
};
