import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Dialog } from "@/components/ui/dialog";
import { Button, Label, Textarea } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/utils";

/** Approve / Reject with a confirmation dialog and an optional note (PRD §20.6). */
export function DecisionButtons({ approvalId, action, args, size = "md" }: {
  approvalId: number; action: string; args: Record<string, unknown>; size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const decide = useMutation({
    mutationFn: (d: "approve" | "reject") => Api.decide(approvalId, d, note || undefined),
    onSuccess: (r, d) => {
      toast.success(d === "approve" ? `Approved. Executing ${action}…` : "Rejected. The run will close with a report.");
      setPending(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["run", r.run_id] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <div className="flex gap-2">
        <Button size={size} onClick={() => setPending("approve")} className="bg-success text-white hover:bg-success/85"><Check className="h-4 w-4" /> Approve</Button>
        <Button size={size} variant="outline" onClick={() => setPending("reject")} className="text-danger hover:bg-danger/10"><X className="h-4 w-4" /> Reject</Button>
      </div>
      <Dialog open={!!pending} onClose={() => setPending(null)} title={pending === "approve" ? "Approve this action?" : "Reject this action?"}
        footer={<>
          <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
          <Button variant={pending === "reject" ? "danger" : "primary"} loading={decide.isPending} onClick={() => pending && decide.mutate(pending)}>
            {pending === "approve" ? "Approve & execute" : "Reject"}
          </Button>
        </>}>
        <p className="text-sm text-muted-foreground">
          {pending === "approve"
            ? "The agent will run this action now, then verify that it worked."
            : "The action will not run. The investigation ends with a report that records your decision."}
        </p>
        <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3 font-mono text-xs">
          <span className="text-primary">{action}</span>({Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ").slice(0, 220)})
        </div>
        <div className="mt-4">
          <Label htmlFor={`note-${approvalId}`} hint="optional">Note</Label>
          <Textarea id={`note-${approvalId}`} className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you making this decision?" />
        </div>
      </Dialog>
    </>
  );
}
