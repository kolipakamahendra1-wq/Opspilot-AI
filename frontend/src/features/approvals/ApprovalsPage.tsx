import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Api } from "@/api/endpoints";
import { Card, Chip, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";
import { DecisionButtons } from "./DecisionButtons";

const TABS = ["pending", "approved", "rejected"] as const;

export default function ApprovalsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const q = useQuery({ queryKey: ["approvals", tab], queryFn: () => Api.approvals(tab), refetchInterval: tab === "pending" ? 5000 : false });

  return (
    <>
      <PageHeader eyebrow="human in the loop" title="Approvals"
        description="Actions the agent wants to take. Nothing runs until you approve it." />
      <div className="mb-4 inline-flex rounded-full border border-border p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("relative rounded-full px-4 py-1.5 text-sm capitalize transition", tab === t ? "text-background" : "text-muted-foreground hover:text-foreground")}>
            {tab === t && <motion.span layoutId="appr-tab" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: "spring", stiffness: 400, damping: 35 }} />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      {q.isLoading ? <Card><LoadingState /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> :
        !q.data?.length ? <Card><EmptyState title={tab === "pending" ? "Nothing waiting for approval" : `No ${tab} actions`}
          hint={tab === "pending" ? "When the agent recommends replaying a webhook or escalating a ticket, it shows up here." : undefined} /></Card> : (
          <div className="grid gap-4 xl:grid-cols-2">
            <AnimatePresence initial={false}>
              {q.data.map((a) => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                  <Card className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-primary">{a.action}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <Link to={`/app/runs/${a.run.run_id}`} className="font-mono hover:text-foreground">{a.run.run_id}</Link> · {a.ticket.ticket_id} · {a.ticket.customer_id} · {timeAgo(a.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold leading-none">{Math.round((a.run.confidence ?? 0) * 100)}%</p>
                        <p className="text-[11px] text-muted-foreground">confidence</p>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 px-5 py-4">
                      <p className="text-sm text-muted-foreground">“{a.ticket.message}”</p>
                      <p className="text-sm font-medium">{a.run.diagnosis}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.run.evidence.map((e) => <Chip key={e}>{e}</Chip>)}
                      </div>
                      {!!a.run.sources.length && <p className="text-xs text-muted-foreground">Sources: {a.run.sources.join(", ")}</p>}
                      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        args: {JSON.stringify(a.args).slice(0, 200)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                      {a.status === "pending" ? <DecisionButtons approvalId={a.id} action={a.action} args={a.args} size="sm" /> : (
                        <div className="flex items-center gap-2"><StatusBadge status={a.status} />{a.note && <span className="text-xs text-muted-foreground">“{a.note}”</span>}</div>
                      )}
                      <Link to={`/app/runs/${a.run.run_id}`} className="text-xs text-muted-foreground hover:text-foreground">Details →</Link>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
    </>
  );
}
