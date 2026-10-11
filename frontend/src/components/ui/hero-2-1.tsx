"use client";

import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const AgentGraph3D = lazy(() => import("@/components/ui/agent-graph-3d"));

const NAV = [
  { label: "Product", href: "#features", children: [
    { label: "Agent workflow", href: "#workflow" },
    { label: "Evidence & citations", href: "#features" },
    { label: "Human approval", href: "#security" },
  ] },
  { label: "How it works", href: "#workflow" },
  { label: "Security", href: "#security" },
  { label: "Evaluation", href: "#evaluation" },
];

const ease = [0.16, 1, 0.3, 1] as const;

const Hero2 = ({ signedIn = false }: { signedIn?: boolean }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const primaryHref = signedIn ? "/app" : "/login";

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#08080b]">
      {/* Gradient background with grain effect */}
      <div className="absolute -right-60 -top-10 z-0 flex flex-col items-end blur-xl" aria-hidden>
        <div className="z-1 h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-purple-600 to-sky-600 blur-[6rem]" />
        <div className="z-1 h-[10rem] w-[90rem] rounded-full bg-gradient-to-b from-pink-900 to-yellow-400 blur-[6rem]" />
        <div className="z-1 h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-yellow-600 to-sky-500 blur-[6rem]" />
      </div>
      <div className="bg-noise pointer-events-none absolute inset-0 z-0 opacity-30" aria-hidden />

      {/* Content container */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container mx-auto mt-6 flex items-center justify-between px-4 py-4" aria-label="Main">
          <Link to="/" className="flex items-center" aria-label="OpsPilot AI home">
            <Logo />
            <span className="ml-2 text-xl font-bold tracking-tight text-white">OpsPilot<span className="font-normal text-white/60"> AI</span></span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center space-x-6 md:flex">
            <div className="flex items-center space-x-6">
              {NAV.map((n) => <NavItem key={n.label} {...n} />)}
            </div>
            <div className="flex items-center space-x-3">
              <Link to={primaryHref} className="inline-flex h-12 items-center rounded-full bg-white px-8 text-base font-medium text-black transition hover:bg-white/90">
                {signedIn ? "Open app" : "Login"}
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-expanded={mobileMenuOpen}>
            <span className="sr-only">Toggle menu</span>
            {mobileMenuOpen ? <X className="h-6 w-6 text-white" /> : <Menu className="h-6 w-6 text-white" />}
          </button>
        </nav>

        {/* Mobile Navigation Menu with animation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 flex flex-col bg-[#08080b]/95 p-4 md:hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Logo />
                  <span className="ml-2 text-xl font-bold text-white">OpsPilot AI</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="mt-8 flex flex-col space-y-6">
                {NAV.map((n) => <MobileNavItem key={n.label} label={n.label} href={n.href} onNavigate={() => setMobileMenuOpen(false)} />)}
                <div className="pt-4">
                  <Link to="/login" className="flex h-12 w-full items-center justify-center rounded-full border border-gray-700 text-white">
                    Log in
                  </Link>
                </div>
                <Link to={primaryHref} className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90">
                  Investigate a ticket
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Badge */}
        <motion.a
          href="#workflow"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
          className="mx-auto mt-6 flex max-w-fit items-center justify-center space-x-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm transition hover:bg-white/15"
        >
          <span className="text-sm font-medium text-white">Evidence first. Approval before every action.</span>
          <ArrowRight className="h-4 w-4 text-white" />
        </motion.a>

        {/* Hero section */}
        <div className="container mx-auto mt-12 px-4 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease, delay: 0.05 }}
            className="text-balance mx-auto max-w-5xl text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-[4.25rem]"
          >
            Support incidents, <span className="font-light text-white/70">investigated</span> like an engineer would.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-gray-300"
          >
            It reads the ticket, checks runbooks and live systems, and cites the evidence. Nothing changes until a human approves.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.32 }}
            className="mt-10 flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
          >
            <Link to={primaryHref} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-base font-medium text-black transition hover:bg-white/90">
              Investigate a ticket <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#evaluation" className="inline-flex h-12 items-center rounded-full border border-gray-600 px-8 text-base font-medium text-white transition hover:bg-white/10">
              See the results
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.1, ease, delay: 0.45 }}
            className="relative mx-auto my-20 w-full max-w-6xl"
          >
            <div className="bg-grainy absolute inset-0 rounded bg-white opacity-20 shadow-lg blur-[10rem]" aria-hidden />

            {/* Hero visual: the artwork plate with the live 3D agent graph on top */}
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-purple-950/40">
              <img
                src="/luminous-inquiry.png"
                alt="Plate: the nine states of an OpsPilot investigation drawn as a star chart"
                className="absolute inset-0 h-full w-full scale-105 object-cover opacity-20 blur-[1px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" aria-hidden />
              <Suspense fallback={null}>
                <AgentGraph3D className="absolute inset-0" />
              </Suspense>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
        <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="16" r="4" fill="#7c3aed" />
      </svg>
    </div>
  );
}

function NavItem({ label, href, children }: { label: string; href: string; children?: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <a href={href} onFocus={() => setOpen(true)} className="flex items-center text-sm text-gray-300 transition hover:text-white">
        <span>{label}</span>
        {children && <ChevronDown className="ml-1 h-4 w-4" aria-hidden />}
      </a>
      <AnimatePresence>
        {children && open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-20 w-56 -translate-x-1/2 pt-3"
          >
            <div className="rounded-xl border border-white/10 bg-black/80 p-1.5 backdrop-blur-xl">
              {children.map((c) => (
                <a key={c.label} href={c.href} onBlur={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white">
                  {c.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileNavItem({ label, href, onNavigate }: { label: string; href: string; onNavigate: () => void }) {
  return (
    <a href={href} onClick={onNavigate} className="flex items-center justify-between border-b border-gray-800 pb-2 text-lg text-white">
      <span>{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </a>
  );
}

export { Hero2 };
