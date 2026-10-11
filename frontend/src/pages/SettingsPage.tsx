import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, UserPlus } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Dialog } from "@/components/ui/dialog";
import { Button, Card, CardHeader, ErrorState, Input, Label, LoadingState, PageHeader, Select } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthContext";
import { cn, errorMessage } from "@/lib/utils";

function Dot({ ok }: { ok: boolean | null | undefined }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", ok == null ? "bg-muted-foreground" : ok ? "bg-success" : "bg-danger")} />;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: Api.users });
  const status = useQuery({ queryKey: ["settings-status"], queryFn: Api.settingsStatus });
  const [form, setForm] = useState({ email: "", name: "", role: "support", password: "" });
  const [confirmReset, setConfirmReset] = useState(false);

  const create = useMutation({
    mutationFn: () => Api.createUser(form),
    onSuccess: (u) => { toast.success(`Created ${u.email}`); setForm({ email: "", name: "", role: "support", password: "" }); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: (p: { id: number; role?: string; active?: boolean }) => Api.updateUser(p.id, p),
    onSuccess: () => { toast.success("User updated"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: Api.resetDemo,
    onSuccess: () => { toast.success("Demo data restored"); setConfirmReset(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  const s = status.data;

  return (
    <>
      <PageHeader eyebrow="administration" title="Settings" description="Users, roles and configuration status. Secrets are never displayed." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Users" subtitle="Support can investigate; Admins can also approve and view traces." />
            {users.isLoading ? <LoadingState /> : users.isError ? <ErrorState error={users.error} onRetry={() => users.refetch()} /> : (
              <ul className="divide-y divide-border">
                {users.data!.map((u) => (
                  <li key={u.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{u.name} {u.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select aria-label={`Role for ${u.email}`} value={u.role} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} className="h-8 w-28 text-xs">
                        <option value="support">support</option><option value="admin">admin</option>
                      </Select>
                      <Button size="sm" variant={u.active ? "outline" : "secondary"} disabled={u.id === me?.id} onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Add a user" />
            <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
              <div><Label htmlFor="u-name">Name</Label><Input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label htmlFor="u-email">Email</Label><Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label htmlFor="u-role">Role</Label><Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="support">support</option><option value="admin">admin</option></Select></div>
              <div><Label htmlFor="u-pw" hint="min 8 chars">Password</Label><Input id="u-pw" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={create.isPending}><UserPlus className="h-4 w-4" /> Create user</Button></div>
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Configuration status" />
            {status.isLoading ? <LoadingState /> : status.isError ? <ErrorState error={status.error} onRetry={() => status.refetch()} /> : s && (
              <dl className="divide-y divide-border text-sm">
                {[
                  ["LLM", `${s.llm.provider} · ${s.llm.model}`, s.llm.reachable],
                  ["Embeddings", `${s.embeddings.provider} · ${s.embeddings.model}`, null],
                  ["Mock internal service", s.mock_service.reachable ? "reachable" : "unreachable", s.mock_service.reachable],
                  ["JWT secret", s.security.jwt_secret_set ? "set" : "using dev default", s.security.jwt_secret_set],
                  ["LLM API key", s.llm.api_key_set ? "set" : "not needed (local)", null],
                  ["Rate limit", `${s.security.rate_limit_per_minute}/min per IP`, null],
                  ["Agent", `max ${s.agent.max_tool_steps} tool steps · ${s.agent.tool_timeout_s}s timeout`, null],
                ].map(([k, v, ok]) => (
                  <div key={k as string} className="flex items-center justify-between gap-3 px-5 py-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="flex items-center gap-2 text-right font-mono text-xs"><Dot ok={ok as boolean | null} />{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium">Demo data</p>
            <p className="mt-1 text-xs text-muted-foreground">Approving a webhook replay changes the seeded order. Reset to restore the original failure scenarios.</p>
            <Button variant="outline" className="mt-4" onClick={() => setConfirmReset(true)}><RotateCcw className="h-4 w-4" /> Reset demo data</Button>
          </Card>
        </div>
      </div>
      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data?"
        footer={<><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>Reset</Button></>}>
        <p className="text-sm text-muted-foreground">Customers, orders, payments and webhook events are restored to their seeded state. Tickets, runs and audit history are kept.</p>
      </Dialog>
    </>
  );
}
