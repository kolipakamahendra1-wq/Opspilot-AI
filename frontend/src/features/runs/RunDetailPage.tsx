import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Cpu, FileText, Radio, ShieldAlert, Wrench, XCircle,
} from "lucide-react";
import { Api } from "@/api/endpoints";
import { Card, CardHeader, Chip, ErrorState, LoadingState, StatusBadge } from "@/components/ui/primitives";
import { DecisionButtons } from "@/features/approvals/DecisionButtons";
import { useAuth } from "@/features/auth/AuthContext";
import { useRunStream } from "@/hooks/useRunStream";
import { cn, fmtCost, fmtMs, timeAgo } from "@/lib/utils";
import type { Run, Step } from "@/types";
import { Markdown } from "./Markdown";

const PIPELINE = ["CLASSIFY", "RETRIEVE", "CALL_TOOLS", "ANALYZE", "DECIDE", "AWAIT_APPROVAL", "EXECUTE", "VERIFY", "REPORT"];
const TERMINAL = ["resolved", "escalated", "failed", "rejected"];

function Pipeline({ steps, status }: { steps: Step[]; status: string }) {
  const seen = new Set(steps.map((s) => s.node));
  const reached = PIPELINE.reduce((acc, n, i) => (seen.has(n) ? i : acc), -1);
  const live = !TERMINAL.includes(status) && status !== "awaiting_approval";
  return (
    <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Agent progress">
      {PIPELINE.map((n, i) => {
        const done = seen.has(n);
        const active = live && i === reached + 1;
        const gate = n === "AWAIT_APPROVAL";
        return (
          <div key={n} className="flex min-w-fit items-center gap-1">
            <motion.div
              initial={false}
              animate={{ opacity: done || active ? 1 : 0.45 }}
              className={cn(
                "relative rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wide",
                done ? (gate ? "border-warm/40 bg-warm/10 text-warm" : "border-primary/30 bg-primary/10 text-primary") : "border-border text-muted-foreground",
              )}
            >
              {active && <motion.span layoutId="pipe-active" className="absolute inset-0 rounded-full border border-accent" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
              {active && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-accent" />}
              {n.replace("_", " ")}
            </motion.div>
            {i < PIPELINE.length - 1 && <span className={cn("h-px w-3", done ? "bg-primary/40" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function summarize(step: Step): string {
  const o = (step.output ?? {}) as Record<string, unknown>;
  if (step.error && !step.output) return step.error;
  switch (step.tool ?? step.node) {
    case "search_knowledge": return `${(o.results as unknown[])?.length ?? 0} chunks · top ${(o.results as { source: string }[])?.[0]?.source ?? "-"}`;
    case "query_orders_db": return `${o.row_count ?? 0} rows`;
    case "get_order": return `${o.order_id} · ${o.status}${o.shipping_status ? ` · ${o.shipping_status}` : ""}`;
    case "get_payment": return `${o.payment_id} · ${o.status} · ${o.txn_id}`;
    case "get_webhook_status": return `${o.txn_id} · ${o.status} · attempts ${o.attempts}`;
    case "replay_webhook": return `replayed=${o.replayed} · order ${o.order_status}`;
    case "escalate_ticket": return `ticket ${o.ticket_status}`;
    case "CLASSIFY": return `category=${o.category} (by ${o.by})${(o.injection_flags as string[])?.length ? " · ⚑ injection flagged" : ""}`;
    case "ANALYZE": return `${o.code} · confidence ${Number(o.confidence ?? 0).toFixed(2)} (by ${o.by})`;
    case "DECIDE": return o.action ? `recommend ${(o.action as { name: string }).name}` : "no action needed";
    case "AWAIT_APPROVAL": return "paused · waiting for an Admin";
    case "VERIFY": return o.verified ? `verified: ${o.actual}` : `not verified${o.actual ? `: ${o.actual}` : ""}`;
    case "REPORT": return `status=${o.status}`;
    default: return step.error ?? "";
  }
}

function TimelineItem({ step, index }: { step: Step; index: number }) {
  const [open, setOpen] = useState(false);
  const isTool = !!step.tool;
  const Icon = step.error && !step.output ? XCircle : isTool ? Wrench : step.node === "AWAIT_APPROVAL" ? ShieldAlert : Cpu;
  return (
    <motion.li layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className="relative pl-9">
      <span className={cn("absolute left-0 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border bg-card",
        step.error && !step.output ? "border-danger/40 text-danger" : step.node === "AWAIT_APPROVAL" ? "border-warm/40 text-warm" : isTool ? "border-accent/40 text-accent" : "border-primary/40 text-primary")}>
        <Icon className="h-3 w-3" />
      </span>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/60">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{step.node}</Chip>
          {step.tool && <span className="font-mono text-xs font-medium text-foreground">{step.tool}</span>}
          <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            {step.tokens > 0 && <span>{step.tokens} tok</span>}
            <span>{fmtMs(step.latency_ms)}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </span>
        </div>
        <p className={cn("mt-1 text-xs", step.error && !step.output ? "text-danger" : "text-muted-foreground")}>{summarize(step)}</p>
        {step.error && step.output && <p className="mt-0.5 text-[11px] text-warm">{step.error}</p>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="mx-3 mb-2 max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(step.output ?? { error: step.error }, null, 2)}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 30, c = 2 * Math.PI * r;
  const color = value >= 0.8 ? "var(--success)" : value >= 0.5 ? "var(--warm)" : "var(--danger)";
  return (
    <div className="relative h-20 w-20 shrink-0" aria-label={`Confidence ${Math.round(value * 100)}%`}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <motion.circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-semibold">{Math.round(value * 100)}%</span>
    </div>
  );
}

function DiagnosisCard({ run }: { run: Run }) {
  if (!run.diagnosis) {
    return (
      <Card className="p-5">
        <p className="text-sm font-medium">Diagnosis</p>
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="h-2.5 w-2.5 rounded-full bg-accent" /></span>
          Gathering evidence…
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Diagnosis" subtitle={`${run.category} · by ${run.diagnosed_by}`} />
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-4">
          <ConfidenceRing value={run.confidence ?? 0} />
          <p className="text-sm font-medium leading-snug">{run.diagnosis}</p>
        </div>
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">evidence</p>
          <ul className="space-y-1.5">
            {run.claims.filter((c) => c.source.startsWith("tool:")).map((c) => (
              <li key={c.text} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="font-mono text-xs">{c.text}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.source.slice(5)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">sources</p>
          {run.sources.length ? run.sources.map((s) => (
            <Link key={s} to={`/app/knowledge?q=${encodeURIComponent(s.split(":")[1].replace(/-/g, " "))}`}
              className="mb-1.5 flex items-center gap-2 text-sm text-primary hover:underline"><BookOpen className="h-3.5 w-3.5" />{s}</Link>
          )) : <p className="text-xs text-muted-foreground">No documentation cited.</p>}
          {!!run.retrieved.length && (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Retrieved {run.retrieved.length} chunks</summary>
              <ul className="mt-2 space-y-1">
                {run.retrieved.map((d) => (
                  <li key={d.source} className="flex justify-between gap-2 font-mono text-[11px]">
                    <span className={cn(d.flagged && "text-warm")}>{d.flagged && "⚑ "}{d.source}</span><span>{d.score.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </Card>
  );
}

function ActionCard({ run }: { run: Run }) {
  const { isAdmin } = useAuth();
  if (!run.diagnosis) return null;
  const v = run.verification as Record<string, unknown> | null;
  return (
    <Card>
      <CardHeader title="Action" subtitle={run.action ? "Requires Admin approval" : undefined} />
      <div className="space-y-4 p-5">
        {!run.action ? (
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> No state-changing action required.</p>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs">
              <span className="text-primary">{run.action.name}</span>
              <span className="text-muted-foreground">({Object.entries(run.action.args).map(([k, val]) => `${k}=${JSON.stringify(val)}`).join(", ").slice(0, 160)})</span>
            </div>
            {run.approval && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Approval</span>
                <StatusBadge status={run.approval.status} />
              </div>
            )}
            {run.approval?.note && <p className="text-xs text-muted-foreground">Note: “{run.approval.note}”</p>}
            {run.status === "awaiting_approval" && run.approval?.status === "pending" && (
              isAdmin ? <DecisionButtons approvalId={run.approval.id} action={run.approval.action} args={run.approval.args} />
                : <p className="flex items-center gap-2 rounded-lg border border-warm/30 bg-warm/10 px-3 py-2 text-xs text-warm"><ShieldAlert className="h-3.5 w-3.5" /> Waiting for an Admin to approve.</p>
            )}
            {v && (
              <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", v.verified ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
                {v.verified ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />}
                <span>{v.verified ? `Verified: ${v.check} is ${v.actual}${v.before ? ` (was ${v.before})` : ""}` : `Verification failed${v.error ? `: ${v.error}` : ""}`}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function RunDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<string | undefined>();
  const mode = useRunStream(id, status);
  const q = useQuery({
    queryKey: ["run", id],
    queryFn: async () => { const r = await Api.run(id!); setStatus(r.status); return r; },
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (!s || TERMINAL.includes(s)) return false;
      return mode === "stream" ? 10000 : 2000; // polling fallback
    },
  });

  if (q.isLoading) return <Card><LoadingState rows={8} /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const run = q.data;
  const steps = run.steps ?? [];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Link to="/app/tickets" className="hover:text-foreground">tickets</Link> / {run.ticket_id}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight sm:text-[28px]">
            <span className="font-mono">{run.run_id}</span> <StatusBadge status={run.status} className="text-xs" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Started {timeAgo(run.started_at)} · {steps.length} steps
            {run.totals && <> · {fmtMs(run.totals.latency_ms)} · {run.totals.tokens} tokens · {fmtCost(run.totals.cost)}</>}</p>
        </div>
        <div className="flex items-center gap-2">
          {mode !== "idle" && (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", mode === "stream" ? "border-success/30 text-success" : "border-warm/30 text-warm")}>
              <Radio className="h-3 w-3" /> {mode === "stream" ? "live stream" : "polling every 2s"}
            </span>
          )}
          {isAdmin && <Link to={`/app/traces/${run.run_id}`} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">Open trace →</Link>}
        </div>
      </div>

      {!!run.injection_flags.length && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warm/30 bg-warm/10 px-4 py-3 text-sm text-warm" role="status">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Instruction-like text was found in this ticket ({run.injection_flags.slice(0, 3).map((f) => `“${f}”`).join(", ")}). It was treated as data and not followed.</span>
        </div>
      )}

      <Card className="mb-4 p-4"><Pipeline steps={steps} status={run.status} /></Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Agent timeline" subtitle="Each node and tool call as it happens" />
            <ol className="relative space-y-1 p-3 before:absolute before:bottom-6 before:left-[23px] before:top-6 before:w-px before:bg-border">
              {steps.map((s, i) => <TimelineItem key={s.id} step={s} index={i} />)}
              {!TERMINAL.includes(run.status) && run.status !== "awaiting_approval" && (
                <li className="relative flex items-center gap-2 pl-9 text-xs text-muted-foreground">
                  <span className="absolute left-1.5 top-1 h-3 w-3 animate-ping rounded-full bg-accent/60" />
                  thinking…
                </li>
              )}
            </ol>
          </Card>
          {run.report && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader title={<span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Final report</span>} />
                <div className="p-5"><Markdown text={run.report} /></div>
              </Card>
            </motion.div>
          )}
        </div>
        <div className="space-y-4">
          <DiagnosisCard run={run} />
          <ActionCard run={run} />
        </div>
      </div>
    </>
  );
}
