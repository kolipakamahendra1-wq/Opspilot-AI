import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Api } from "@/api/endpoints";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button, Card, CardHeader, Chip, EmptyState, ErrorState, LoadingState, PageHeader, Select } from "@/components/ui/primitives";
import { cn, errorMessage, fmtMs, timeAgo } from "@/lib/utils";

const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)" };
const METRICS: { key: "task_completion_rate" | "tool_selection_accuracy" | "recall_at_5" | "groundedness" | "injection_resistance"; label: string; color: string }[] = [
  { key: "task_completion_rate", label: "Task completion", color: "#a78bfa" },
  { key: "tool_selection_accuracy", label: "Tool selection", color: "#818cf8" },
  { key: "recall_at_5", label: "Recall@5", color: "#38bdf8" },
  { key: "groundedness", label: "Groundedness", color: "#34d399" },
  { key: "injection_resistance", label: "Injection resistance", color: "#fbbf24" },
];

export default function EvaluationsPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"rules" | "llm">("rules");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const q = useQuery({
    queryKey: ["evaluations"], queryFn: Api.evaluations,
    refetchInterval: (query) => query.state.data?.latest?.status === "running" ? 1500 : false,
  });
  const start = useMutation({
    mutationFn: () => Api.runEvaluation(mode, mode === "llm" ? 10 : undefined),
    onSuccess: () => { toast.success(mode === "llm" ? "Live LLM evaluation started (first 10 cases)" : "Evaluation started"); qc.invalidateQueries({ queryKey: ["evaluations"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const latest = q.data?.latest;
  const running = latest?.status === "running";
  const s = latest?.status === "completed" ? latest.summary : null;
  const cases = (latest?.cases ?? []).filter((c) => !onlyFailed || !c.correct);

  return (
    <>
      <PageHeader eyebrow="50-scenario suite" title="Evaluations" description="Runs every case through the real agent (tools, database, mock services) and scores it. Actions are never executed."
        action={
          <div className="flex items-center gap-2">
            <Select aria-label="Evaluation mode" value={mode} onChange={(e) => setMode(e.target.value as "rules" | "llm")} className="h-10 w-60">
              <option value="rules">Deterministic (50 cases)</option>
              <option value="llm">Live LLM (10 cases)</option>
            </Select>
            <Button onClick={() => start.mutate()} loading={start.isPending} disabled={running}><Play className="h-4 w-4" /> Run evaluation</Button>
          </div>
        } />

      {q.isLoading ? <Card><LoadingState /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : !latest ? (
        <Card><EmptyState title="No evaluations yet" hint="Run the suite to see task completion, tool accuracy, retrieval recall, groundedness and injection resistance." /></Card>
      ) : (
        <>
          {running && (
            <Card className="mb-4 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Running {latest.mode} evaluation…</span>
                <span className="font-mono text-xs text-muted-foreground">{latest.progress} / {latest.total || "…"}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 via-sky-400 to-amber-300"
                  animate={{ width: `${latest.total ? (latest.progress / latest.total) * 100 : 3}%` }} transition={{ ease: "easeOut" }} />
              </div>
            </Card>
          )}
          {latest.status === "failed" && <Card className="mb-4 border-danger/30 p-4 text-sm text-danger">Evaluation failed: {latest.summary?.error}</Card>}

          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {METRICS.map((m, i) => {
                  const v = s[m.key];
                  return (
                    <motion.div key={m.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Card className="flex items-center gap-3 p-4">
                        <div className="h-16 w-16 shrink-0">
                          <ResponsiveContainer>
                            <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v: (v ?? 0) * 100, fill: m.color }]} startAngle={90} endAngle={-270}>
                              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                              <RadialBar dataKey="v" cornerRadius={8} background={{ fill: "var(--muted)" }} animationDuration={1300} />
                            </RadialBarChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <p className="text-xl font-semibold">{v == null ? "-" : <AnimatedNumber value={v * 100} format={(n) => `${n.toFixed(0)}%`} />}</p>
                          <p className="text-[11px] leading-tight text-muted-foreground">{m.label}</p>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
                <Card className="p-4">
                  <p className="text-xl font-semibold">{fmtMs(s.avg_latency_ms)}</p>
                  <p className="text-[11px] text-muted-foreground">avg latency · p95 {fmtMs(s.p95_latency_ms)}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{latest.mode} mode · {s.cases} cases · {timeAgo(latest.finished_at)}</p>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Accuracy by category" />
                  <div className="h-64 px-2 py-4">
                    <ResponsiveContainer>
                      <BarChart data={s.per_category.map((c) => ({ ...c, accuracy: c.accuracy * 100, recall: c.recall_at_5 * 100 }))} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
                        <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(0)}%`} />
                        <Bar dataKey="accuracy" name="Accuracy" fill="#a78bfa" radius={[6, 6, 0, 0]} animationDuration={1200} />
                        <Bar dataKey="recall" name="Recall@5" fill="#38bdf8" radius={[6, 6, 0, 0]} animationDuration={1400} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Per-category results" />
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-5 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Correct</th><th className="px-3 py-2 font-medium">Accuracy</th><th className="px-5 py-2 text-right font-medium">Recall@5</th></tr></thead>
                    <tbody>
                      {s.per_category.map((c) => (
                        <tr key={c.category} className="border-t border-border">
                          <td className="px-5 py-2.5 capitalize">{c.category.replace("_", " ")}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{c.correct}/{c.cases}</td>
                          <td className="px-3 py-2.5">{(c.accuracy * 100).toFixed(0)}%</td>
                          <td className="px-5 py-2.5 text-right">{(c.recall_at_5 * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </>
          )}

          {!!latest.cases?.length && (
            <Card className="mt-4">
              <CardHeader title="Cases" subtitle={s ? `${s.failed_cases.length} failed` : `${latest.cases.length} scored so far`}
                action={<label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} className="accent-[var(--primary)]" /> Failed only</label>} />
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card"><tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Case</th><th className="px-3 py-2 font-medium">Ticket</th><th className="px-3 py-2 font-medium">Expected</th><th className="px-3 py-2 font-medium">Actual</th><th className="px-5 py-2 text-right font-medium">Run</th>
                  </tr></thead>
                  <tbody>
                    {cases.map((c) => (
                      <tr key={c.id} className={cn("border-t border-border align-top", !c.correct && "bg-danger/5")}>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className="flex items-center gap-1.5 font-mono text-xs">{c.correct ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}{c.id}</span>
                          <span className="mt-1 block text-[11px] capitalize text-muted-foreground">{c.category.replace("_", " ")}</span>
                        </td>
                        <td className="max-w-xs px-3 py-3 text-xs text-muted-foreground"><span className="line-clamp-2">{c.ticket_text}</span></td>
                        <td className="px-3 py-3"><Chip>{c.expected_diagnosis}</Chip><p className="mt-1 font-mono text-[11px] text-muted-foreground">{c.expected_action}</p></td>
                        <td className="px-3 py-3"><Chip className={cn(!c.correct && "border-danger/30 text-danger")}>{c.actual_diagnosis ?? "-"}</Chip><p className="mt-1 font-mono text-[11px] text-muted-foreground">{c.actual_action} · {c.predicted_category}</p></td>
                        <td className="px-5 py-3 text-right"><Link to={`/app/traces/${c.run_id}`} className="font-mono text-xs text-primary hover:underline">trace</Link><p className="text-[11px] text-muted-foreground">{c.seconds}s</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
