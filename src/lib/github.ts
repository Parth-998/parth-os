"use client";
import { useEffect, useState } from "react";

/**
 * Public GitHub data, fetched in the visitor's browser (no token; GitHub allows 60 requests an hour
 * per visitor, and this uses at most 4). Cached for 10 minutes per visit.
 */
export interface Repo {
  name: string;
  description: string | null;
  language: string | null;
  url: string;
  created: string;
  pushed: string;
  stars: number;
}
export interface Commit {
  sha: string;
  repo: string;
  message: string;
  date: string;
  url: string;
}
export type GithubState = { status: "loading" | "ok" | "error"; repos: Repo[]; commits: Commit[] };

const TTL = 10 * 60 * 1000;
const api = (path: string) =>
  fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" } }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

async function load(user: string): Promise<Omit<GithubState, "status">> {
  type RawRepo = { name: string; description: string | null; language: string | null; html_url: string; created_at: string; pushed_at: string; fork: boolean; stargazers_count: number };
  const raw: RawRepo[] = await api(`/users/${user}/repos?sort=created&direction=desc&per_page=30`);
  const own = raw.filter((r) => !r.fork);
  const repos = own.slice(0, 6).map((r) => ({ name: r.name, description: r.description, language: r.language, url: r.html_url, created: r.created_at, pushed: r.pushed_at, stars: r.stargazers_count }));
  // commits from the three most recently pushed repos, merged newest first
  const active = [...own].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at)).slice(0, 3);
  type RawCommit = { sha: string; html_url: string; commit: { message: string; author: { date: string } } };
  const lists = await Promise.all(
    active.map((r) =>
      api(`/repos/${user}/${r.name}/commits?per_page=8`)
        .then((cs: RawCommit[]) => cs.map((c) => ({ sha: c.sha.slice(0, 7), repo: r.name, message: c.commit.message.split("\n")[0], date: c.commit.author.date, url: c.html_url })))
        .catch(() => [] as Commit[]),
    ),
  );
  const commits = lists.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return { repos, commits };
}

export function useGithub(user: string): GithubState {
  const [state, setState] = useState<GithubState>({ status: "loading", repos: [], commits: [] });
  useEffect(() => {
    if (!user) {
      setState({ status: "error", repos: [], commits: [] });
      return;
    }
    const key = `gh:${user}`;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < TTL) {
        setState({ status: "ok", repos: hit.repos, commits: hit.commits });
        return;
      }
    } catch {
      /* no storage: just fetch */
    }
    let live = true;
    load(user)
      .then((d) => {
        if (!live) return;
        setState({ status: "ok", ...d });
        try {
          sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), ...d }));
        } catch {
          /* fine */
        }
      })
      .catch(() => live && setState({ status: "error", repos: [], commits: [] }));
    return () => {
      live = false;
    };
  }, [user]);
  return state;
}

/** "3d ago", "2mo ago" */
export function ago(iso: string) {
  const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
  const units: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return "just now";
}
