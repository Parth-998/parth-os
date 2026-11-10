import { site } from "@/content/site";

/** The text files in ~ (the terminal's cat and the file manager both read these). */
export const HOME_FILES: Record<string, () => string[]> = {
  "about.txt": () => [site.name, ...site.about],
  "interests.txt": () => site.interests.map((i) => `${i.label}: ${i.line}`),
  "contact.txt": () => [`email: ${site.contact.email}`, ...site.contact.links.filter((l) => l.href !== "#").map((l) => `${l.label}: ${l.href}`)],
  "music.txt": () => ["the songs on this site (original, made for it):", ...site.music.tracks.map((t) => `${t.title} · ${t.artist}`)],
};
