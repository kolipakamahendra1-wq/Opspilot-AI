import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button, Input, Label } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthContext";
import { errorMessage } from "@/lib/utils";

const DEMO = [
  { email: "admin@demo.com", role: "Admin", hint: "approves actions, sees traces & metrics" },
  { email: "support@demo.com", role: "Support", hint: "creates tickets, follows runs" },
];

export default function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={params.get("next") || "/app"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back, ${u.name.split(" ")[0]}`);
      navigate(params.get("next") || (u.role === "admin" ? "/app" : "/app/tickets"), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-black lg:block">
        <img src="/luminous-inquiry.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="text-4xl font-semibold leading-tight tracking-tight">Evidence before action.</p>
          <p className="mt-3 max-w-md text-sm text-white/60">Every recommendation comes with tool output and a cited runbook. Nothing changes until a person says yes.</p>
        </div>
      </div>

      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to site
        </Link>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="m-auto w-full max-w-sm py-12">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">to the OpsPilot investigation console</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>Sign in</Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">demo accounts</p>
            <div className="space-y-2">
              {DEMO.map((d) => (
                <button key={d.email} type="button" onClick={() => { setEmail(d.email); document.getElementById("password")?.focus(); }}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-3.5 py-2.5 text-left transition hover:border-primary/40 hover:bg-muted">
                  <span>
                    <span className="block text-sm font-medium">{d.role}</span>
                    <span className="block text-xs text-muted-foreground">{d.hint}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{d.email}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Passwords come from <code className="font-mono">ADMIN_PASSWORD</code> / <code className="font-mono">SUPPORT_PASSWORD</code> in your <code className="font-mono">.env</code>.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
