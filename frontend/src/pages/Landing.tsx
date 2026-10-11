import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Database, GitBranch, Lock, RefreshCcw, ScanEye, ShieldCheck, UserCheck, X } from "lucide-react";
import { Hero2 } from "@/components/ui/hero-2-1";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Api } from "@/api/endpoints";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

// Landing page accent is locked to amber: the colour of the human approval gate.
const ease = [0.16, 1, 0.3, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, ease, delay }}>
      {children}
    </motion.div>
  );
}

function Heading({ title, sub, center }: { title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <Reveal className={cn("mb-14 max-w-3xl", center && "mx-auto text-center")}>
      <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">{title}</h2>
      {sub && <p className={cn("mt-4 max-w-[65ch] text-base leading-relaxed text-white/60", center && "mx-auto")}>{sub}</p>}
    </Reveal>
  );
}

/* ---------- Features: 5-cell bento with real product screenshots ---------- */

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-28">
      <Heading title={<>An agent you can <span className="font-light text-white/60">audit</span>.</>}
        sub="It plans, calls real tools, cites its sources, and hands every risky action to a person." />
      <div className="grid gap-4 md:grid-cols-6">
        <Reveal className="md:col-span-4 md:row-span-2">
          <div className="grid h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:grid-cols-[1fr_auto]">
            <div className="p-7">
              <h3 className="text-xl font-semibold text-white">Evidence before diagnosis</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
                Order, payment and webhook records are pulled first. The diagnosis cites each one and the runbook it follows.
              </p>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60">
                After approval the agent checks its own work: the order really moved from PENDING to CONFIRMED.
              </p>
            </div>
            <div className="relative self-end px-7 pt-2 sm:pl-0 sm:pt-8">
              <img src="/shots/diagnosis.webp" alt="Run Detail page: 95% confidence diagnosis, three evidence lines, a cited runbook and a verified replay"
                loading="lazy" width={340} height={692}
                className="h-[460px] w-full rounded-t-xl border border-b-0 border-white/10 object-cover object-top shadow-2xl shadow-black/60 sm:w-[340px]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0f0f12] to-transparent" aria-hidden />
            </div>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2" delay={0.05}>
          <div className="h-full rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.12] via-amber-300/[0.03] to-transparent p-6">
            <GitBranch className="h-5 w-5 text-amber-300" />
            <h3 className="mt-3 font-semibold text-white">A real state machine</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">LangGraph nodes, a loop back for more evidence, and saved state so a paused run resumes after approval.</p>
          </div>
        </Reveal>
        <Reveal className="md:col-span-2" delay={0.1}>
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="p-6 pb-4">
              <UserCheck className="h-5 w-5 text-amber-300" />
              <h3 className="mt-3 font-semibold text-white">A person approves</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">Replays and escalations wait in a queue with their evidence.</p>
            </div>
            <img src="/shots/approval.webp" alt="Approval card for an escalation with Approve and Reject buttons"
              loading="lazy" width={520} height={300} className="mt-auto w-full border-t border-white/10 object-cover object-top" />
          </div>
        </Reveal>
        <Reveal className="md:col-span-3" delay={0.05}>
          <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <Database className="h-5 w-5 text-white/70" />
            <h3 className="mt-3 font-semibold text-white">Read-only by design</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">SQL is parsed, limited to SELECT on four tables, row-capped, time-boxed and audited.</p>
          </div>
        </Reveal>
        <Reveal className="md:col-span-3" delay={0.1}>
          <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <RefreshCcw className="h-5 w-5 text-white/70" />
            <h3 className="mt-3 font-semibold text-white">Recovers from outages</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">Two retries, then another data source, then an escalation that carries the partial findings.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Workflow: pinned phase rail + grouped steps ---------- */

const PHASES = [
  { name: "Investigate", note: "Read-only. Runs on its own.", steps: [
    ["Classify", "Payment, order, shipping or account."],
    ["Retrieve", "Top runbook chunks from pgvector."],
    ["Query records", "Orders, payments and webhook deliveries."],
  ] },
  { name: "Decide", note: "Explains itself, then stops.", steps: [
    ["Diagnose", "Names the cause and cites the evidence."],
    ["Recommend", "replay_webhook or escalate_ticket."],
    ["Wait for approval", "The run pauses until an Admin decides."],
  ] },
  { name: "Act", note: "Only after a yes.", steps: [
    ["Execute", "Re-checks the approval in the database first."],
    ["Verify", "Confirms the order moved PENDING to CONFIRMED."],
    ["Report", "Evidence, sources, decision and outcome."],
  ] },
];

function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 60%", "end 60%"] });
  // Discrete phase index (changes three times), not a continuous value.
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(PHASES.length - 1, Math.max(0, Math.floor(v * PHASES.length)))));

  return (
    <section id="workflow" className="mx-auto max-w-6xl px-4 py-28">
      <div ref={ref} className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">From ticket to verified fix.</h2>
          <p className="mt-4 max-w-[45ch] text-base leading-relaxed text-white/60">
            The primary use case: a payment went through, the order is stuck on pending.
          </p>
          <ol className="mt-10 hidden space-y-3 lg:block" aria-label="Phases">
            {PHASES.map((p, i) => (
              <li key={p.name} className="flex items-center gap-4">
                <span className="relative h-8 w-px bg-white/10">
                  {active === i && <motion.span layoutId="phase-rail" className="absolute inset-0 bg-amber-300" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
                </span>
                <span className={cn("text-lg font-medium transition-colors", active === i ? "text-white" : "text-white/35")}>{p.name}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-16">
          {PHASES.map((p) => (
            <Reveal key={p.name}>
              <h3 className="text-2xl font-semibold text-white">{p.name}</h3>
              <p className={cn("mt-1 text-sm", p.name === "Decide" ? "text-amber-300" : "text-white/45")}>{p.note}</p>
              <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {p.steps.map(([title, body]) => (
                  <div key={title}>
                    <p className={cn("font-medium", title === "Wait for approval" ? "text-amber-300" : "text-white")}>{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/55">{body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Guardrails: controls + a live SQL guard ---------- */

const CONTROLS = [
  { icon: Lock, t: "Two roles", d: "Support investigates. Only Admins approve, and each role has its own tool allowlist." },
  { icon: ScanEye, t: "Injection-aware", d: "Ticket and document text is treated as data. Instructions inside it are flagged, never followed." },
  { icon: UserCheck, t: "Approval in the database", d: "Execution re-reads the approval row, so a forged state cannot trigger an action." },
  { icon: ShieldCheck, t: "PII masked", d: "Emails, phone numbers and card numbers are masked in traces, audit entries and reports." },
];

const SAMPLES = ["SELECT id, status FROM orders", "DROP TABLE orders", "SELECT email FROM users", "SELECT 1; DELETE FROM payments"];

function SqlGuard() {
  const [sql, setSql] = useState(SAMPLES[1]);
  const check = useMutation({ mutationFn: Api.sqlCheck });
  // Show a real verdict on first view rather than an empty box.
  const { mutate } = check;
  useEffect(() => { mutate(SAMPLES[1]); }, [mutate]);
  const submit = (e: FormEvent) => { e.preventDefault(); if (sql.trim()) check.mutate(sql.trim()); };
  const r = check.data;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h3 className="font-semibold text-white">Try to get past the SQL guard</h3>
      <p className="mt-1 text-sm text-white/55">This is the validator the agent's database tool uses. It parses your query; nothing runs.</p>
      <form onSubmit={submit} className="mt-5">
        <label htmlFor="sql-try" className="mb-2 block text-xs font-medium text-white/70">Query</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="sql-try" value={sql} onChange={(e) => setSql(e.target.value)} maxLength={500} spellCheck={false}
            className="h-11 flex-1 rounded-xl border border-white/15 bg-black/40 px-3.5 font-mono text-sm text-white placeholder:text-white/40 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/20" />
          <button type="submit" disabled={check.isPending}
            className="h-11 rounded-xl bg-white px-5 text-sm font-medium text-[#08080b] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-60">
            Check
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <button key={s} type="button" onClick={() => { setSql(s); check.mutate(s); }}
            className="rounded-lg border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/60 transition hover:border-white/25 hover:text-white">
            {s}
          </button>
        ))}
      </div>
      <div className="mt-5 min-h-16" aria-live="polite">
        {check.isError && <p className="text-sm text-red-300">The API did not respond. Is the backend running?</p>}
        {r && (
          <motion.div key={(r.sql ?? r.reason) + String(r.allowed)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn("rounded-xl border px-4 py-3", r.allowed ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-red-400/25 bg-red-400/[0.06]")}>
            <p className={cn("flex items-center gap-2 text-sm font-medium", r.allowed ? "text-emerald-300" : "text-red-300")}>
              {r.allowed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {r.allowed ? "Allowed, rewritten as:" : "Rejected"}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-white/70">{r.allowed ? r.sql : r.reason}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Security() {
  return (
    <section id="security" className="mx-auto max-w-6xl px-4 py-28">
      <Heading title="Safe by construction." sub="The agent can read almost anything and change almost nothing on its own." />
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {CONTROLS.map((c, i) => (
            <Reveal key={c.t} delay={i * 0.06}>
              <c.icon className="h-5 w-5 text-amber-300" />
              <h3 className="mt-3 font-semibold text-white">{c.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/55">{c.d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1}><SqlGuard /></Reveal>
      </div>
    </section>
  );
}

/* ---------- Evaluation: stat band from the latest real run ---------- */

function Evaluation() {
  const q = useQuery({ queryKey: ["public-eval"], queryFn: Api.publicEval, retry: false });
  const d = q.data;
  const ok = d?.available === true;
  const pct = (k: string) => (ok && typeof d?.[k] === "number" ? (d[k] as number) * 100 : null);
  const stats = [
    ["Tool selection", pct("tool_selection_accuracy")],
    ["Retrieval recall@5", pct("recall_at_5")],
    ["Groundedness", pct("groundedness")],
    ["Injection resistance", pct("injection_resistance")],
  ] as const;
  const headline = pct("task_completion_rate");
  const modeLabel = d?.mode === "llm" ? "local LLM (qwen2.5:3b)" : "deterministic baseline";

  return (
    <section id="evaluation" className="mx-auto max-w-6xl px-4 py-28">
      <Heading title="Measured on 50 scenarios." sub="Payment, order, login, shipping, API outages and prompt injection, run through the real agent." />
      <div className="grid items-end gap-12 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <p className="text-7xl font-semibold tracking-tight text-white md:text-8xl">
            {headline == null ? "-" : <AnimatedNumber value={headline} format={(n) => `${n.toFixed(0)}%`} />}
          </p>
          <p className="mt-3 text-base text-white/60">of tickets get the right diagnosis <span className="text-white">and</span> the right action.</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
          {stats.map(([label, v], i) => (
            <Reveal key={label} delay={i * 0.06}>
              <p className="text-3xl font-semibold tracking-tight text-white">
                {v == null ? "-" : <AnimatedNumber value={v} format={(n) => `${n.toFixed(0)}%`} />}
              </p>
              <p className="mt-1 text-sm text-white/55">{label}</p>
            </Reveal>
          ))}
        </div>
      </div>
      <p className="mt-12 max-w-[70ch] text-sm leading-relaxed text-white/45">
        {ok
          ? `Latest run: ${modeLabel}, ${d?.cases} cases. The data is synthetic and the internal systems are a mock service, so this is not a claim about production accuracy.`
          : "No evaluation has run yet. An Admin can start one from the Evaluations page."}
      </p>
    </section>
  );
}

/* ---------- Closing ---------- */

function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-28">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26rem] bg-[radial-gradient(ellipse_at_bottom,rgba(251,191,36,0.14),transparent_65%)]" aria-hidden />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-6xl">
          Open a ticket. <span className="font-light text-white/60">Watch it think.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[50ch] text-white/60">Demo accounts are ready on first start. Every step of the run streams to your screen.</p>
        <Link to={signedIn ? "/app/tickets/new" : "/login"}
          className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 font-medium text-[#08080b] transition hover:bg-white/90 active:scale-[0.98]">
          Investigate a ticket <ArrowRight className="h-4 w-4" />
        </Link>
      </Reveal>
      <footer className="relative mx-auto mt-28 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row">
        <span>OpsPilot AI, a portfolio project on synthetic data</span>
        <span>FastAPI, LangGraph, pgvector and React</span>
      </footer>
    </section>
  );
}

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="dark min-h-[100dvh] overflow-x-clip bg-[#08080b] text-white">
      <Hero2 signedIn={!!user} />
      <Features />
      <Workflow />
      <Security />
      <Evaluation />
      <Closing signedIn={!!user} />
    </div>
  );
}
