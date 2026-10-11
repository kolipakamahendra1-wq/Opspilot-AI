import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, CheckCircle2, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Menu, Moon, Plus, ScrollText,
  Settings, Sun, X,
} from "lucide-react";
import { Api } from "@/api/endpoints";
import { useAuth } from "@/features/auth/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/tickets", label: "Tickets", icon: ClipboardList },
  { to: "/app/approvals", label: "Approvals", icon: CheckCircle2, admin: true, badge: true },
  { to: "/app/knowledge", label: "Knowledge", icon: BookOpen, admin: true },
  { to: "/app/evaluations", label: "Evaluations", icon: FlaskConical, admin: true },
  { to: "/app/audit", label: "Audit log", icon: ScrollText, admin: true },
  { to: "/app/settings", label: "Settings", icon: Settings, admin: true },
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="OpsPilot AI home">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
        <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
          <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="16" cy="16" r="4" fill="#8b5cf6" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">OpsPilot <span className="font-normal text-muted-foreground">AI</span></span>
    </Link>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const pending = useQuery({ queryKey: ["approvals", "pending"], queryFn: () => Api.approvals("pending"), enabled: isAdmin, refetchInterval: 10000 });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-3"><Brand /></div>
      <div className="px-3 pb-3">
        <Link to="/app/tickets/new" onClick={onNavigate}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background transition hover:bg-foreground/85">
          <Plus className="h-4 w-4" /> New ticket
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="App">
        {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
            className={({ isActive }) => cn(
              "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition",
              isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-2 h-5 w-0.5 rounded-full bg-primary" />}
                <n.icon className="h-4 w-4" />
                {n.label}
                {n.badge && !!pending.data?.length && (
                  <span className="ml-auto rounded-full bg-warm/15 px-1.5 text-[11px] font-semibold text-warm">{pending.data.length}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-500 text-xs font-semibold text-white">
            {user?.name?.[0] ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{user?.role}</p>
          </div>
          <button onClick={() => { logout(); navigate("/login"); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-sidebar lg:block"><SideNav /></aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-sidebar lg:hidden"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 400, damping: 40 }}>
              <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close menu"><X className="h-4 w-4" /></button>
              <SideNav onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              support incident investigation
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
