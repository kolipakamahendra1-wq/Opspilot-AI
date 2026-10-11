import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, PriorityDot, StatusBadge } from "@/components/ui/primitives";
import { errorMessage, timeAgo } from "@/lib/utils";

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => Api.ticket(id!), enabled: !!id });
  const start = useMutation({
    mutationFn: () => Api.startRun(id!),
    onSuccess: (r) => navigate(`/app/runs/${r.run_id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Card><LoadingState /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const t = q.data;

  return (
    <>
      <PageHeader eyebrow={t.customer_id} title={<span className="font-mono">{t.ticket_id}</span>}
        action={<Button onClick={() => start.mutate()} loading={start.isPending}><Play className="h-4 w-4" /> Start investigation</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3"><StatusBadge status={t.status} /><PriorityDot priority={t.priority} />
            {t.product && <span className="text-xs text-muted-foreground">{t.product}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{timeAgo(t.created_at)}</span></div>
          <p className="mt-5 text-lg leading-relaxed">“{t.message}”</p>
        </Card>
        <Card>
          <CardHeader title="Investigations" />
          {!t.runs?.length ? <EmptyState title="Not investigated yet" hint="Start an investigation to run the agent on this ticket." /> : (
            <ul className="divide-y divide-border">
              {t.runs.map((r) => (
                <li key={r.run_id}><Link to={`/app/runs/${r.run_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50">
                  <span className="font-mono text-xs">{r.run_id}</span><StatusBadge status={r.status} /><span className="text-xs text-muted-foreground">{timeAgo(r.started_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
