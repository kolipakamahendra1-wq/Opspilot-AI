import type { ReactNode } from "react";

/** Tiny renderer for the agent's report format: headings, bullets, **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`} className="my-2 space-y-1 pl-4">{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("- ")) { list.push(<li key={i} className="list-disc marker:text-muted-foreground">{inline(line.slice(2))}</li>); return; }
    flush();
    if (line.startsWith("# ")) out.push(<h3 key={i} className="mb-2 text-base font-semibold">{inline(line.slice(2))}</h3>);
    else if (line.startsWith("## ")) out.push(<h4 key={i} className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{line.slice(3)}</h4>);
    else if (line.trim()) out.push(<p key={i} className="my-1">{inline(line)}</p>);
  });
  flush();
  return <div className="text-sm leading-relaxed text-muted-foreground">{out}</div>;
}
