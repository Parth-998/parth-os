"use client";
/** notes: a list on the left, the note on the right, in the style of obsidian. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NOTES } from "@/content/notes";

export default function Notes({ slug, onRoute }: { slug?: string; onRoute: (r?: string) => void }) {
  const [cur, setCur] = useState(() => NOTES.find((n) => n.slug === slug)?.slug ?? NOTES[0]?.slug);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (slug && NOTES.some((n) => n.slug === slug)) setCur(slug);
  }, [slug]);
  useEffect(() => onRoute(cur), [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NOTES.filter((n) => n.title.includes(s) || n.body.toLowerCase().includes(s)) : NOTES;
  }, [q]);
  const note = NOTES.find((n) => n.slug === cur);
  return (
    <div className="notes">
      <nav className="notes-list" aria-label="notes">
        <input id="notes-search" className="app-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search notes" aria-label="search notes" spellCheck={false} />
        {list.map((n) => (
          <button key={n.slug} type="button" className={n.slug === cur ? "on" : ""} onClick={() => setCur(n.slug)}>
            <span className="notes-t">{n.title}</span>
            <span className="notes-d">
              {n.date}
              {n.draft ? " · draft" : ""}
            </span>
          </button>
        ))}
        {!list.length && <p className="app-empty">no notes match "{q}"</p>}
      </nav>
      <article className="notes-doc">{note ? <Markdown src={note.body} /> : <p className="app-empty">pick a note</p>}</article>
    </div>
  );
}

/** Just enough markdown for the notes: headings, paragraphs, lists, code, bold, links. */
export function Markdown({ src }: { src: string }) {
  const blocks: ReactNode[] = [];
  const lines = src.trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (l.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      blocks.push(<pre key={i}>{code.join("\n")}</pre>);
    } else if (/^#{1,3} /.test(l)) {
      const lvl = l.match(/^#+/)![0].length;
      const text = inline(l.replace(/^#+ /, ""));
      blocks.push(lvl === 1 ? <h1 key={i}>{text}</h1> : lvl === 2 ? <h2 key={i}>{text}</h2> : <h3 key={i}>{text}</h3>);
    } else if (/^- /.test(l)) {
      const items: string[] = [];
      for (; i < lines.length && /^- /.test(lines[i]); i++) items.push(lines[i].slice(2));
      i--;
      blocks.push(
        <ul key={i}>
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </ul>,
      );
    } else {
      const para: string[] = [l];
      for (i++; i < lines.length && lines[i].trim() && !/^(#|- |```)/.test(lines[i]); i++) para.push(lines[i]);
      i--;
      // a first line of only "·"-separated words reads as the note's meta line
      blocks.push(
        <p key={i} className={blocks.length === 1 && /·/.test(para[0]) && para.length === 1 ? "notes-meta" : undefined}>
          {inline(para.join(" "))}
        </p>,
      );
    }
  }
  return <>{blocks}</>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:[^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<code key={m.index}>{m[1]}</code>);
    else if (m[2]) out.push(<strong key={m.index}>{m[2]}</strong>);
    else
      out.push(
        <a key={m.index} href={m[4]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
