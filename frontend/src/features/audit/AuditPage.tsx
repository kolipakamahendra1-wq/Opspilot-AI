import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Button, Card, Chip, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select } from "@/components/ui/primitives";

export default function AuditPage() {
  const [actor, setActor] = useState("");
  const [event, setEvent] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["audit", actor, event, page],
    queryFn: () => Api.audit({ actor: actor || undefined, event: event || undefined, page }),
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  return (
    <>
      <PageHeader eyebrow="compliance" title="Audit log" description="Every tool call, approval decision, login and upload. PII is masked." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Input aria-label="Filter by actor" placeholder="Filter by actor" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} className="sm:max-w-xs" />
          <Select aria-label="Filter by event" value={event} onChange={(e) => { setEvent(e.target.value); setPage(1); }} className="sm:w-56">
            <option value="">All events</option>
            {d?.events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </Select>
        </div>
        {q.isLoading ? <LoadingState rows={8} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d?.items.length ? <EmptyState title="No audit entries" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-5 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">Actor</th><th className="px-3 py-2 font-medium">Event</th><th className="px-5 py-2 font-medium">Detail</th></tr></thead>
                <tbody>
                  {d.items.map((a) => (
                    <tr key={a.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs">{a.actor}</td>
                      <td className="px-3 py-2.5"><Chip className={a.event.includes("failed") || a.detail?.ok === false ? "border-danger/30 text-danger" : a.event === "approval_decision" ? "border-warm/30 text-warm" : ""}>{a.event}</Chip></td>
                      <td className="max-w-xl px-5 py-2.5"><code className="line-clamp-2 break-all font-mono text-[11px] text-muted-foreground">{JSON.stringify(a.detail)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span>{d.total} entries · page {d.page} of {d.pages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={page >= d.pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
