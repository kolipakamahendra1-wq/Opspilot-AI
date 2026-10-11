import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import type { Role } from "@/types";

export function ProtectedRoute({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (role && user.role !== role) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <ShieldAlert className="h-6 w-6 text-warm" />
        <p className="text-sm font-medium">Admins only</p>
        <p className="text-xs text-muted-foreground">Your role ({user.role}) does not have access to this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
