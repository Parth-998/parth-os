"use client";
import { useState } from "react";
import { site, type Project, type Status } from "@/content/site";
import Window from "./Window";
import Terminal, { type TermActions } from "./Terminal";
import TradingSim from "./TradingSim";
import { useCompact } from "@/lib/hooks";
import { ago, useGithub, type GithubState } from "@/lib/github";
import type { Motion, Palette } from "@/lib/ascii";

const PA = String.raw` ____   _
|  _ \ / \
| |_) / _ \
|  __/ ___ \
|_| /_/   \_\ `;

const realLinks = (links: { label: string; href: string }[]) => links.filter((l) => l.href && l.href !== "#");

function StatusMark({ status, year }: { status: Status; year?: string }) {
  const mark = status === "live" ? "●" : status === "building" ? "◐" : status === "done" ? "✓" : "○";
  return (
    <span>
      {mark} {status}
      {year ? ` · ${year}` : ""}
    </span>
  );
}

/* ── 1 home ─────────────────────────────────────────────── */
export function Home({ lastLogin, actions }: { lastLogin: string | null; actions: TermActions }) {
  return (
    <div className="tile home-tile" data-rows="resizable">
      <div className="home-name self-end">
        <h1 className="text-[clamp(40px,6vw,72px)] leading-[0.95] font-light tracking-[-0.03em] text-balance">{site.name}</h1>
        <p className="mono mt-3 text-[13px]" style={{ color: "var(--muted)" }}>
          {site.line}
        </p>
      </div>

      <Window path="~/whoami" index={0} className="home-about">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <pre className="mono text-[12px] leading-[1.25]" aria-label={site.initials}>
            {PA}
          </pre>
          <ul className="mono min-w-0 flex-1 space-y-1 text-[13px]">
            <li style={{ color: "var(--fg)" }}>{site.name}</li>
            {site.about.map((l) => (
              <li key={l} style={{ color: "var(--muted)" }}>
                {l}
              </li>
            ))}
          </ul>
        </div>
      </Window>

      <Window path="~" right="zsh" index={1} className="home-term flex flex-col" flexible>
        <Terminal actions={actions} lastLogin={lastLogin} />
      </Window>
    </div>
  );
}

/* ── 2 projects ─────────────────────────────────────────── */
export function Projects({ onOpen }: { onOpen: (p: Project) => void }) {
  return (
    <div className="tile projects-tile">
      {site.projects.map((p, i) => (
        <Window key={p.slug} path={`~/projects/${p.slug}`} index={i} className="project flex flex-col">
          <div className="flex items-baseline gap-3">
            <span className="label tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="text-[20px] leading-tight tracking-[-0.01em]">{p.title}</h2>
          </div>
          <p className="mt-2 mb-5 max-w-[52ch] text-[14px]" style={{ color: "var(--muted)" }}>
            {p.line}
          </p>
          <dl className="hair mono mt-auto grid grid-cols-3 gap-3 border-y py-3 text-[12px]">
            <div className="min-w-0">
              <dt className="label">role</dt>
              <dd className="mt-0.5">{p.role}</dd>
            </div>
            <div className="min-w-0">
              <dt className="label">stack</dt>
              <dd className="mt-0.5">{p.stack}</dd>
            </div>
            <div className="min-w-0">
              <dt className="label">status</dt>
              <dd className="mt-0.5">
                <StatusMark status={p.status} year={p.year} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-4 pt-4">
            <button type="button" className="link" onClick={() => onOpen(p)}>
              case study ↗
            </button>
            {realLinks(p.links).map((l) => (
              <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
                {l.label} ↗
              </a>
            ))}
          </div>
        </Window>
      ))}
    </div>
  );
}

export function CaseStudy({ project, onClose }: { project: Project; onClose: () => void }) {
  const i = site.projects.findIndex((p) => p.slug === project.slug);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "var(--scrim)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="win pop max-h-[86dvh] w-full max-w-[680px] overflow-y-auto" role="dialog" aria-modal="true" aria-label={project.title}>
        <div className="win-path">
          <span>~/projects/{project.slug}/readme</span>
          <button type="button" className="link" onClick={onClose} autoFocus>
            close
          </button>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="label tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <h2 className="text-[28px] leading-tight tracking-[-0.02em]">{project.title}</h2>
        </div>
        <p className="mt-2 text-[15px]" style={{ color: "var(--muted)" }}>
          {project.line}
        </p>
        <dl className="hair mono mt-5 grid grid-cols-3 gap-3 border-y py-3 text-[12px]">
          <div>
            <dt className="label">role</dt>
            <dd className="mt-0.5">{project.role}</dd>
          </div>
          <div>
            <dt className="label">stack</dt>
            <dd className="mt-0.5">{project.stack}</dd>
          </div>
          <div>
            <dt className="label">status</dt>
            <dd className="mt-0.5">
              <StatusMark status={project.status} year={project.year} />
            </dd>
          </div>
        </dl>
        <div className="mt-5 max-w-[62ch] space-y-3 text-[15px]">
          {project.caseStudy.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
        {realLinks(project.links).length > 0 && (
          <div className="mt-6 flex gap-4">
            {realLinks(project.links).map((l) => (
              <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
                {l.label} ↗
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── 3 about ────────────────────────────────────────────── */
export function About() {
  const e = site.education;
  return (
    <div className="tile about-tile">
      <Window path="~/about/interests" index={0} className="about-interests">
        <h2 className="win-h">interests</h2>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
          {site.interests.map((i) => (
            <li key={i.label} className="min-w-0">
              <span style={{ color: "var(--fg)" }}>{i.label}</span>
              {i.line && (
                <span className="block text-[11.5px]" style={{ color: "var(--faint)" }}>
                  {i.line}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Window>
      <Window path="~/about/timeline" index={1} className="about-time">
        <h2 className="win-h">timeline</h2>
        <ol className="mt-2">
          {site.experience.map((j) => (
            <li key={j.org} className="hair grid grid-cols-[1fr_auto] gap-x-6 border-t py-2.5 first:border-t-0">
              <div className="min-w-0 text-[13px]">
                <p style={{ color: "var(--fg)" }}>
                  {j.title}, {j.org}
                </p>
                <p style={{ color: "var(--muted)" }}>{j.line}</p>
              </div>
              <span className="label pt-0.5">{j.when}</span>
            </li>
          ))}
        </ol>
      </Window>
      <Window path="~/about/school" index={2} className="about-school">
        <h2 className="win-h">school</h2>
        <div className="mt-3 space-y-0.5 text-[13px]">
          <p style={{ color: "var(--fg)" }}>{e.school}</p>
          <p style={{ color: "var(--muted)" }}>{e.degree}</p>
          <p style={{ color: "var(--muted)" }}>minor in {e.minor}</p>
          <p className="label pt-1">
            {e.when} · gpa {e.gpa}
          </p>
        </div>
      </Window>
      <Window path="~/about/stack" index={3} className="about-stack">
        <h2 className="win-h">stack</h2>
        <div className="mt-3 space-y-2 text-[13px]">
          <div>
            <p className="label">strongest</p>
            <p style={{ color: "var(--fg)" }}>{site.stack.strongest.join(", ")}</p>
          </div>
          <div>
            <p className="label">also using</p>
            <p style={{ color: "var(--fg)" }}>{site.stack.using.join(", ")}</p>
          </div>
        </div>
      </Window>
    </div>
  );
}

/* ── 4 activity ─────────────────────────────────────────── */
function GhStatus({ gh }: { gh: GithubState }) {
  if (gh.status === "ok" && (gh.repos.length || gh.commits.length)) return null;
  const msg = gh.status === "loading" ? `fetching github.com/${site.github} ...` : gh.status === "error" ? "couldn't reach github right now." : "nothing public yet.";
  return (
    <p className="mt-2 text-[13px]" style={{ color: "var(--muted)" }}>
      {msg}
    </p>
  );
}

export function Activity({ palette, motion }: { palette: Palette; motion: Motion }) {
  const gh = useGithub(site.github);
  const compact = useCompact();
  return (
    <div className="tile small-tile activity-tile">
      {compact ? (
        <Window path="~/activity/paper-trading" right="paper money" index={0}>
          <p className="sim-phone mono">
            paper trading on live BTC, ETH and SOL prices: spot and perps up to 10x, take profit, stop loss, liquidations.
            <br />
            it needs a mouse and room for the chart, so it&apos;s on the laptop version.
          </p>
        </Window>
      ) : (
        <Window path="~/activity/paper-trading" right="paper money" index={0} className="activity-sim flex flex-col" flexible>
          <TradingSim palette={palette} motion={motion} />
        </Window>
      )}
      <Window path="~/activity/repos" right="github" index={1} className="activity-half">
        <h2 className="win-h">newest repos</h2>
        <GhStatus gh={gh} />
        <ul className="mt-2 space-y-2.5 text-[13px]">
          {gh.repos.map((r) => (
            <li key={r.name} className="min-w-0">
              <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--fg)" }}>
                {r.name}
              </a>
              <span className="label ml-2">{[r.language, ago(r.created)].filter(Boolean).join(" · ")}</span>
              {r.description && (
                <p className="truncate text-[12px]" style={{ color: "var(--muted)" }}>
                  {r.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Window>
      <Window path="~/activity/log" right="git log" index={2} className="activity-half">
        <h2 className="win-h">commit log</h2>
        <GhStatus gh={gh} />
        <ul className="mono mt-2 space-y-1.5 text-[12px]">
          {gh.commits.map((c) => (
            <li key={c.repo + c.sha} className="grid min-w-0 grid-cols-[auto_1fr_auto] items-baseline gap-x-3">
              <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--faint)" }}>
                {c.sha}
              </a>
              <span className="truncate" style={{ color: "var(--fg)" }}>
                <span style={{ color: "var(--muted)" }}>{c.repo}</span> {c.message}
              </span>
              <span style={{ color: "var(--faint)" }}>{ago(c.date)}</span>
            </li>
          ))}
        </ul>
      </Window>
    </div>
  );
}

/* ── 5 contact ──────────────────────────────────────────── */
export function Contact() {
  const [copied, setCopied] = useState(false);
  const c = site.contact;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const el = document.getElementById("contact-email");
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
  };
  // order of importance: github, linkedin, resume, then the rest
  const real = realLinks(c.links);
  const resume = c.resume ? [{ label: "resume", href: c.resume }] : [];
  const li = real.findIndex((l) => l.label === "linkedin");
  const links = li >= 0 ? [...real.slice(0, li + 1), ...resume, ...real.slice(li + 1)] : [...real, ...resume];
  return (
    <div className="tile small-tile contact-tile">
      <Window path="~/contact" index={0}>
        <h2 className="win-h">say hi</h2>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p id="contact-email" className="text-[clamp(17px,2vw,22px)] break-all select-all" style={{ color: "var(--fg)" }}>
            {c.email}
          </p>
          <button type="button" className="link" onClick={copy}>
            {copied ? "copied" : "copy email"}
          </button>
        </div>
        <div className="hair mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3">
          {links.map((l) => (
            <a key={l.label} className="link" href={l.href} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
          <span className="label ml-auto">
            background:{" "}
            {site.credits.map((cr) => (
              <a key={cr.href} className="underline underline-offset-2" href={cr.href} target="_blank" rel="noreferrer">
                {cr.label}
              </a>
            ))}
          </span>
        </div>
      </Window>
    </div>
  );
}
