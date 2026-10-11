import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "@/api/client";

const TERMINAL = ["resolved", "escalated", "failed", "rejected"];

/**
 * Streams run steps over SSE (PRD §20.4). On disconnect it falls back to polling the run
 * every 2s via React Query until the stream reconnects.
 */
export function useRunStream(runId: string | undefined, status: string | undefined) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"stream" | "polling" | "idle">("idle");
  const retry = useRef(0);

  useEffect(() => {
    if (!runId || (status && TERMINAL.includes(status))) {
      setMode("idle");
      return;
    }
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const refresh = () => qc.invalidateQueries({ queryKey: ["run", runId] });
    const connect = () => {
      const token = tokenStore.get();
      if (!token) return;
      es = new EventSource(`/api/agent/${runId}/stream?token=${encodeURIComponent(token)}`);
      es.onopen = () => { retry.current = 0; setMode("stream"); };
      es.addEventListener("step", refresh);
      es.addEventListener("status", refresh);
      es.addEventListener("done", () => { refresh(); es?.close(); setMode("idle"); });
      es.onerror = () => {
        es?.close();
        if (closed) return;
        setMode("polling");
        retry.current += 1;
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry.current));
      };
    };
    connect();
    return () => { closed = true; es?.close(); if (timer) clearTimeout(timer); };
  }, [runId, status, qc]);

  return mode;
}
