import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  return v == null ? "-" : `${(v * 100).toFixed(digits)}%`;
}

export function fmtCost(v: number | null | undefined): string {
  if (v == null) return "-";
  return v === 0 ? "$0.00" : `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

export function errorMessage(e: unknown): string {
  const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
  const d = anyE?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return anyE?.message ?? "Something went wrong";
}
