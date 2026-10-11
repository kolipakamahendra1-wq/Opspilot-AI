import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const TicketsPage = lazy(() => import("@/features/tickets/TicketsPage"));
const NewTicketPage = lazy(() => import("@/features/tickets/NewTicketPage"));
const TicketDetailPage = lazy(() => import("@/features/tickets/TicketDetailPage"));
const RunDetailPage = lazy(() => import("@/features/runs/RunDetailPage"));
const TracePage = lazy(() => import("@/features/runs/TracePage"));
const ApprovalsPage = lazy(() => import("@/features/approvals/ApprovalsPage"));
const KnowledgePage = lazy(() => import("@/features/knowledge/KnowledgePage"));
const EvaluationsPage = lazy(() => import("@/features/evaluations/EvaluationsPage"));
const AuditPage = lazy(() => import("@/features/audit/AuditPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const admin = (el: JSX.Element) => <ProtectedRoute role="admin">{el}</ProtectedRoute>;

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/new" element={<NewTicketPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="runs/:id" element={<RunDetailPage />} />
          <Route path="approvals" element={admin(<ApprovalsPage />)} />
          <Route path="knowledge" element={admin(<KnowledgePage />)} />
          <Route path="evaluations" element={admin(<EvaluationsPage />)} />
          <Route path="traces/:runId" element={admin(<TracePage />)} />
          <Route path="audit" element={admin(<AuditPage />)} />
          <Route path="settings" element={admin(<SettingsPage />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
