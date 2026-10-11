import { useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { FileUp, Search } from "lucide-react";
import { Api } from "@/api/endpoints";
import { Button, Card, CardHeader, Chip, EmptyState, ErrorState, Input, LoadingState, PageHeader } from "@/components/ui/primitives";
import { cn, errorMessage, timeAgo } from "@/lib/utils";

export default function KnowledgePage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = useQuery({ queryKey: ["documents"], queryFn: Api.documents });
  const search = useMutation({ mutationFn: (q: string) => Api.search(q, 5), onError: (e) => toast.error(errorMessage(e)) });
  const upload = useMutation({
    mutationFn: Api.upload,
    onSuccess: (d) => { toast.success(`Indexed ${d.source}. It is searchable now.`); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onFiles = (files: FileList | null) => { if (files?.[0]) upload.mutate(files[0]); };
  const submit = (e: FormEvent) => { e.preventDefault(); if (query.trim().length >= 2) search.mutate(query.trim()); };

  return (
    <>
      <PageHeader eyebrow="rag · pgvector" title="Knowledge base" description="Runbooks and guides the agent searches. Uploads are chunked, embedded and searchable at once." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Card>
            <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
              className={cn("m-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition",
                drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40")}>
              <motion.div animate={upload.isPending ? { rotate: 360 } : { rotate: 0 }} transition={upload.isPending ? { repeat: Infinity, duration: 1.2, ease: "linear" } : {}}>
                <FileUp className="h-6 w-6 text-primary" />
              </motion.div>
              <span className="text-sm font-medium">{upload.isPending ? "Chunking & embedding…" : "Drop a Markdown, text or PDF file"}</span>
              <span className="text-xs text-muted-foreground">or click to browse · max 2 MB · name it <code className="font-mono">runbook__my-topic.md</code> to set its source</span>
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.pdf" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </Card>
          <Card>
            <CardHeader title="Indexed documents" subtitle={docs.data ? `${docs.data.length} documents · ${docs.data.reduce((a, d) => a + d.chunks, 0)} chunks` : undefined} />
            {docs.isLoading ? <LoadingState /> : docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> :
              !docs.data?.length ? <EmptyState title="No documents indexed" /> : (
                <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
                  {docs.data.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.title}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{d.source}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Chip>{d.chunks} chunks</Chip>
                        <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(d.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Test search" subtitle="See what the agent would retrieve for a query" />
          <form onSubmit={submit} className="flex gap-2 p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="payment succeeded but order pending" className="pl-9" />
            </div>
            <Button type="submit" loading={search.isPending}>Search</Button>
          </form>
          {search.data && (
            <ol className="space-y-3 px-4 pb-4">
              {search.data.results.map((r, i) => (
                <motion.li key={r.source + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-medium text-primary">{i + 1}. {r.source}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">score {r.score.toFixed(3)}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-400" initial={{ width: 0 }} animate={{ width: `${Math.max(0, r.score) * 100}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <p className="mt-3 line-clamp-5 whitespace-pre-line text-xs text-muted-foreground">{r.text}</p>
                </motion.li>
              ))}
            </ol>
          )}
          {!search.data && <EmptyState title="Run a query" hint="Results show the top 5 chunks with cosine similarity scores." />}
        </Card>
      </div>
    </>
  );
}
