import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Api } from "@/api/endpoints";
import { Card, Chip, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { cn, fmtCost, fmtMs } from "@/lib/utils";

export default function TracePage() {
  const { runId } = useParams();
  const q = useQuery({ queryKey: ["trace", runId], queryFn: () => Api.trace(runId!), enabled: !!runId });
  if (q.isLoading) return <Card><LoadingState rows={8} /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const t = q.data;
  const max = Math.max(1, ...t.steps.map((s) => s.latency_ms));

  return (
    <>
      <PageHeader eyebrow={`trace · ${t.ticket_id}`} title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{t.run_id}</span><StatusBadge status={t.status} /></span>}
        description="Every step with its input, output, latency, tokens and cost. PII is masked."
        action={<Link to={`/app/runs/${t.run_id}`} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted">Run view →</Link>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Steps", t.totals.steps], ["Latency", fmtMs(t.totals.latency_ms)], ["Tokens", t.totals.tokens], ["Cost", fmtCost(t.totals.cost)], ["Errors", t.totals.errors]].map(([k, v]) => (
          <Card key={k} className="p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></Card>
        ))}
      </div>
      <Card>
        <ol className="divide-y divide-border">
          {t.steps.map((s, i) => (
            <li key={s.id}>
              <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[28px_1fr] items-center gap-3 px-5 py-3 hover:bg-muted/50 md:grid-cols-[28px_200px_1fr_90px_70px]">
                  <span className="font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex items-center gap-2"><Chip>{s.node}</Chip>{s.tool && <span className="font-mono text-xs">{s.tool}</span>}</span>
                  <span className="hidden h-1.5 overflow-hidden rounded-full bg-muted md:block">
                    <motion.span className={cn("block h-full rounded-full", s.error && !s.output ? "bg-danger" : s.tool ? "bg-accent" : "bg-primary")}
                      initial={{ width: 0 }} animate={{ width: `${(s.latency_ms / max) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.03 }} />
                  </span>
                  <span className="hidden text-right font-mono text-xs md:block">{fmtMs(s.latency_ms)}</span>
                  <span className="hidden text-right font-mono text-[11px] text-muted-foreground md:block">{s.tokens ? `${s.tokens} tok` : "-"}</span>
                </summary>
                <div className="grid gap-3 px-5 pb-4 md:grid-cols-2">
                  {s.error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger md:col-span-2">{s.error}</p>}
                  <div><p className="mb-1 text-[11px] text-muted-foreground">input</p><pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px]">{JSON.stringify(s.input ?? null, null, 2)}</pre></div>
                  <div><p className="mb-1 text-[11px] text-muted-foreground">output</p><pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px]">{JSON.stringify(s.output ?? null, null, 2)}</pre></div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
