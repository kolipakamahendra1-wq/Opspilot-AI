import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, PriorityDot, Select, StatusBadge } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";

const STATUSES = ["", "open", "investigating", "awaiting_approval", "resolved", "escalated"];
const PRIORITIES = ["", "urgent", "high", "medium", "low"];

export default function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const status = params.get("status") || "";
  const priority = params.get("priority") || "";
  const [q, setQ] = useState(params.get("q") || "");

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get("q") || "") !== q) set("q", q); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useQuery({
    queryKey: ["tickets", page, status, priority, params.get("q")],
    queryFn: () => Api.tickets({ page, status: status || undefined, priority: priority || undefined, q: params.get("q") || undefined, page_size: 10 }),
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });
  const data = query.data;

  return (
    <>
      <PageHeader eyebrow="support queue" title="Tickets" description="Every ticket and the latest investigation for it."
        action={<Link to="/app/tickets/new"><Button><Plus className="h-4 w-4" /> New ticket</Button></Link>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search tickets" placeholder="Search by ticket, customer or message" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => set("status", e.target.value)} className="md:w-48">
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}
          </Select>
          <Select aria-label="Filter by priority" value={priority} onChange={(e) => set("priority", e.target.value)} className="md:w-40">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p || "All priorities"}</option>)}
          </Select>
        </div>

        {query.isLoading ? <LoadingState rows={6} /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> :
          !data?.items.length ? <EmptyState title="No tickets match" hint="Try clearing the filters, or create a new ticket." /> : (
            <>
              <ul className="divide-y divide-border">
                {data.items.map((t) => (
                  <li key={t.ticket_id}>
                    <Link to={t.last_run_id ? `/app/runs/${t.last_run_id}` : `/app/tickets/${t.ticket_id}`}
                      className="grid gap-2 px-5 py-4 transition hover:bg-muted/50 md:grid-cols-[150px_1fr_140px_100px_80px] md:items-center md:gap-4">
                      <div>
                        <p className="font-mono text-xs font-medium">{t.ticket_id}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{t.customer_id}</p>
                      </div>
                      <p className="line-clamp-2 text-sm">{t.message}</p>
                      <div><StatusBadge status={t.status} /></div>
                      <PriorityDot priority={t.priority} />
                      <p className="text-xs text-muted-foreground md:text-right">{timeAgo(t.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                <span>{data.total} tickets · page {data.page} of {data.pages}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set("page", String(page - 1))} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => set("page", String(page + 1))} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
      </Card>
    </>
  );
}
