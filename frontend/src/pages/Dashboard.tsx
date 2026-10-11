import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Activity, CheckCircle2, Clock, Coins, Gauge, Inbox, TrendingUp, TriangleAlert } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Api } from "@/api/endpoints";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthContext";
import { fmtCost, fmtMs, timeAgo } from "@/lib/utils";

const CAT_COLORS: Record<string, string> = {
  payment: "#a78bfa", order: "#38bdf8", shipping: "#34d399", account: "#fbbf24", other: "#94a3b8",
};

function Kpi({ icon: Icon, label, value, format, sub, i }: {
  icon: typeof Activity; label: string; value: number; format?: (n: number) => string; sub?: string; i: number;
}) {
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <Card className="relative h-full overflow-hidden p-5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs">{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
          <AnimatedNumber value={value} format={format} />
        </p>
        {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
      </Card>
    </motion.div>
  );
}

const tooltipStyle = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)",
};

export default function Dashboard() {
  const { user } = useAuth();
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: Api.metrics, refetchInterval: 15000 });
  const runs = useQuery({ queryKey: ["runs", 8], queryFn: () => Api.runs(8), refetchInterval: 8000 });
  const m = metrics.data;
  const cats = m ? Object.entries(m.category_counts).map(([name, value]) => ({ name, value })) : [];

  return (
    <>
      <PageHeader eyebrow={`good to see you, ${user?.name.split(" ")[0].toLowerCase()}`} title="Dashboard"
        description="How the agent is doing across every investigation." />

      {metrics.isError ? <Card><ErrorState error={metrics.error} onRetry={() => metrics.refetch()} /></Card> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {!m ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[108px]" />) : <>
            <Kpi i={0} icon={Inbox} label="Total tickets" value={m.total_tickets} />
            <Kpi i={1} icon={CheckCircle2} label="Auto-resolved" value={m.auto_resolved} sub="no action needed" />
            <Kpi i={2} icon={TriangleAlert} label="Escalated" value={m.escalated} sub={`${m.awaiting_approval} awaiting approval`} />
            <Kpi i={3} icon={TrendingUp} label="Success rate" value={m.success_rate * 100} format={(n) => `${n.toFixed(0)}%`} />
            <Kpi i={4} icon={Clock} label="Avg resolution" value={m.avg_resolution_s} format={(n) => `${n.toFixed(1)}s`} />
            <Kpi i={5} icon={Coins} label="Avg cost / run" value={m.avg_cost} format={(n) => fmtCost(n)} sub="local model" />
            <Kpi i={6} icon={Gauge} label="Avg latency" value={m.avg_latency_ms} format={(n) => fmtMs(n)} sub={`p95 ${fmtMs(m.p95_latency_ms)}`} />
          </>}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Investigations over time" subtitle="Runs started per day, last 14 days" />
          <div className="h-64 px-2 pb-3 pt-4">
            {!m ? <Skeleton className="mx-4 h-52" /> : m.runs_by_day.length === 0 ? <EmptyState title="No runs yet" hint="Create a ticket to start the first investigation." /> : (
              <ResponsiveContainer>
                <AreaChart data={m.runs_by_day} margin={{ left: -18, right: 12 }}>
                  <defs>
                    <linearGradient id="g-runs" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-res" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="runs" stroke="#a78bfa" strokeWidth={2} fill="url(#g-runs)" animationDuration={1200} />
                  <Area type="monotone" dataKey="resolved" stroke="#38bdf8" strokeWidth={2} fill="url(#g-res)" animationDuration={1400} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="By category" subtitle="How tickets were classified" />
          <div className="h-64 px-2 pb-3 pt-4">
            {!m ? <Skeleton className="mx-4 h-52" /> : cats.length === 0 ? <EmptyState title="No data yet" /> : (
              <ResponsiveContainer>
                <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={70} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} animationDuration={1200}>
                    {cats.map((c) => <Cell key={c.name} fill={CAT_COLORS[c.name] ?? "#94a3b8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent runs" action={<Link to="/app/tickets" className="text-xs text-muted-foreground hover:text-foreground">All tickets →</Link>} />
        {runs.isLoading ? <LoadingState /> : runs.isError ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} /> :
          !runs.data?.length ? <EmptyState title="No investigations yet" hint="Create a ticket and the agent will start immediately."
            action={<Link to="/app/tickets/new" className="text-sm font-medium text-primary">Create a ticket →</Link>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Run</th><th className="px-3 py-2.5 font-medium">Ticket</th>
                    <th className="px-3 py-2.5 font-medium">Diagnosis</th><th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.run_id} className="border-t border-border transition hover:bg-muted/50">
                      <td className="px-5 py-3"><Link to={`/app/runs/${r.run_id}`} className="font-mono text-xs font-medium hover:text-primary">{r.run_id}</Link></td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{r.ticket_id}</td>
                      <td className="max-w-[340px] truncate px-3 py-3">{r.diagnosis ?? <span className="text-muted-foreground">investigating…</span>}</td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-muted-foreground">{timeAgo(r.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
