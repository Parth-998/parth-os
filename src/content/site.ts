// Everything you'd change about the site lives here.
// Edit, save, push to GitHub, and Vercel redeploys.

export type Status = "live" | "building" | "done" | "ended";

export interface Project {
  slug: string;
  title: string;
  /** One honest line. */
  line: string;
  role: string;
  stack: string;
  status: Status;
  year?: string;
  links: { label: string; href: string }[];
  /** Short paragraphs for the case study view. */
  caseStudy: string[];
}

export interface Job {
  title: string;
  org: string;
  when: string;
  line: string;
}

export const site = {
  name: "Parth Awana",
  handle: "parth",
  initials: "PA",
  line: "cs + ai student building toward fintech.",
  timezone: "America/Chicago",
  timezoneLabel: "CST",
  /** Login clock. "24h" is what Linux lock screens (hyprlock, GDM) show by default; "12h" shows "7:31 PM". */
  clock: "12h" as "24h" | "12h",

  /** Default theme preset (see themes.ts), and the one the sun/moon toggle switches to. */
  theme: "monochrome",
  lightTheme: "paper",

  about: [
    "based in chicago",
    "cs + ai at indiana university",
    "entrepreneurship minor",
    "class of 2028",
    "into fintech, trading tools and markets",
  ],

  entry: {
    /** Boot length in ms for a first visit; returning visitors get half. `dmesg` in the terminal rereads it. */
    bootMs: 900,
    username: "parth",
    passwordLength: 10,
  },

  music: {
    /** Plays in rotation (shuffled each visit). Files live in /public/music. To add a song you like,
     *  drop the mp3 in public/music and add a line here with its real title and artist. */
    tracks: [
      { src: "music/track.mp3", title: "late shift", artist: "parth-os radio" },
      { src: "music/north-side.mp3", title: "north side", artist: "parth-os radio" },
      { src: "music/lake-effect.mp3", title: "lake effect", artist: "parth-os radio" },
      { src: "music/after-hours.mp3", title: "after hours", artist: "parth-os radio" },
    ] as { src: string; title: string; artist: string }[],
    /** Unlocked when a visitor finds all 10 secrets (cat .secrets): it appears in the music app and plays
     *  from soundcloud. Set to null to have no bonus track. */
    bonus: { title: "satisfaction", artist: "ap on the beat", soundcloud: "https://soundcloud.com/ap_on_the_beat/satisfaction" } as { title: string; artist: string; soundcloud: string } | null,
    volume: 0.35,
    fadeInMs: 2000,
  },

  /** ~/pictures: opens in the image viewer (nsxiv). Put the files in public/pictures/<folder>/ and list
   *  them here: { src: "pictures/me/chicago-2025.jpg", caption: "lake shore drive" }. Empty folders show as empty. */
  pictures: {
    me: [],
    projects: [],
    setup: [],
    chicago: [],
  } as Record<string, { src: string; caption?: string }[]>,

  /** Things you're into, shown on the about workspace. Edit freely; `line` is optional. */
  interests: [
    { label: "markets", line: "crypto, perps, building trading tools" },
    { label: "music production" },
    { label: "gaming", line: "plus peripherals and setups" },
    { label: "tech", line: "new ai models, phones, laptops, pc parts" },
    { label: "sports cars" },
    { label: "fashion" },
    { label: "fitness" },
    { label: "pickleball" },
  ] as { label: string; line?: string }[],

  background: {
    /** sharks | rain | waves | apartment */
    style: "sharks" as "sharks" | "rain" | "waves" | "apartment",
    /** 0–1. How strongly the background reacts to the cursor. */
    interaction: 1,
    /** 0–1. Brightness of the art under the windows. */
    contrast: 1,
  },

  /** Shown in the terminal window on the home workspace. */
  motd: {
    lastLogin: "fri oct 30 06:14",
    tip: "type 'help' to look around, or 'bg' to change the background.",
  },

  workspaces: [
    { id: "home", label: "home", path: "~" },
    { id: "projects", label: "projects", path: "~/projects" },
    { id: "about", label: "about", path: "~/about" },
    { id: "activity", label: "activity", path: "~/activity" },
    { id: "contact", label: "contact", path: "~/contact" },
  ],

  projects: [
    {
      slug: "stocktracker",
      title: "stocktracker",
      line: "an all-in-one research platform: fundamentals, technicals and ai research on one site.",
      role: "solo build",
      stack: "python, django, javascript",
      status: "building",
      year: "2026",
      links: [],
      caseStudy: [
        "the goal is one place to research anything you'd trade: a screener, tradingview-level charts, and the company's real numbers (income statements, balance sheets, quarterly earnings, filings and call transcripts) side by side, instead of ten tabs.",
        "the edge is ai built in: agents that research a company for you, a chart you can ask questions (highlight a move, ask why it happened, get sourced news back), and a screener you can describe in plain english.",
        "it's a research tool, not a broker: it gathers and explains public data, and you make the call.",
        "built so far in django: the screener with stackable filters and a live count, hover previews fed by a cached json endpoint, and a detail page per stock. next up are historical prices and charts.",
      ],
    },
    {
      slug: "wallet-edge",
      title: "wallet edge",
      line: "find your edge as a crypto trader: where you make money, where you lose it.",
      role: "solo build",
      stack: "javascript, solana",
      status: "building",
      year: "2026",
      links: [],
      caseStudy: [
        "takes the daily wallet pnl view traders know from axiom and goes further: your results over 24h, 3d, 7d, 2w, 1m, 3m and 6m, plus the stats that explain them.",
        "the point is to show your edge: which plays make you money, where you keep losing it, and what to change.",
        "you can look up any wallet and pin it, then compare your wallet against theirs side by side. solana first.",
      ],
    },
    {
      slug: "blackjack",
      title: "blackjack sim",
      line: "a monte carlo simulator testing hi-lo card counting against flat betting.",
      role: "solo build",
      stack: "python, matplotlib",
      status: "done",
      year: "2025",
      links: [{ label: "github", href: "https://github.com/Parth-998/Blackjack-Sim" }],
      caseStudy: [
        "a monte carlo simulator that pits hi-lo card counting against flat betting: 100 trials of 10,000 hands each, over 2 million hands in total.",
        "it plays full blackjack rules: a 6-deck shoe, dealer behavior, basic strategy, and bet sizing that scales with the true count.",
        "the histograms of each strategy's results tell the story: even with a roughly 1% theoretical edge, flat betting still beat counting in 46% of simulations. variance is that strong.",
      ],
    },
    {
      slug: "backtester",
      title: "crypto backtester",
      line: "a backtesting engine in c that replays price data through a buy-the-dip strategy.",
      role: "school project",
      stack: "c, unix, git",
      status: "done",
      year: "2026",
      links: [{ label: "github", href: "https://github.com/Parth-998/Crypto-Backtester" }],
      caseStudy: [
        "a multi-file backtesting engine written in c: it loads ohlc price data from csv and simulates a configurable buy-the-dip strategy over it.",
        "it's split into a data loader, a strategy engine and a command-line front end, with dynamic memory management and input validation throughout.",
        "you set the starting cash and the dip threshold with flags, and can save each report to a file.",
        "every run writes a trade log and a performance report, to the terminal and to a file.",
      ],
    },
    {
      slug: "azuro",
      title: "azuro",
      line: "an ai tools startup for real estate that i co-founded.",
      role: "co-founder",
      stack: "ai, nlp, real estate",
      status: "ended",
      year: "2023",
      links: [],
      caseStudy: [
        "azuro built ai chatbots and workflow automations for real estate companies, using natural language processing to handle lead qualification and customer inquiries.",
        "i led product development and iterated on the chatbot flows from user testing to make them easier to use and better at conversation.",
        "i also ran outbound sales: cold outreach and discovery calls with real estate firms, which fed straight back into what we built.",
        "we recruited and managed a small sales team to scale outreach. that taught me hiring, delegation, and what early go-to-market actually looks like.",
      ],
    },
    {
      slug: "ecommerce",
      title: "ecommerce store",
      line: "a dropshipping store i ran with a friend. our best product did $1.5k in 7 days.",
      role: "co-founder",
      stack: "shopify, meta ads, tiktok",
      status: "ended",
      year: "2025–26",
      links: [],
      caseStudy: [
        "a friend and i ran a dropshipping store and tested around 10 products. our best one did $1.5k in sales in its first 7 days.",
        "we found products with kalodata and tiktok research, sourced them from alibaba and aliexpress, and talked to suppliers ourselves.",
        "ads ran on meta's ads manager at roughly $100–200 a day, and we scaled spend onto whatever was winning.",
        "we both did a bit of everything, but i ended up owning the front end: building the shopify store, the ads and product research. my partner took over inventory and fulfillment.",
      ],
    },
    {
      slug: "this-site",
      title: "this site",
      line: "a linux-style desktop you log into, with live ascii wallpapers behind it.",
      role: "design + build",
      stack: "next.js, react, typescript, canvas",
      status: "live",
      year: "2026",
      links: [{ label: "github", href: "https://github.com/Parth-998/parth-os" }],
      caseStudy: [
        "boot screen, login, then five workspaces with a waybar-style top bar. windows snap to a grid: drag, resize, swap and fullscreen them with hyprland-style alt keybinds.",
        "four wallpapers drawn in ascii on a canvas, all interactive: sharks hunting a school of fish (adapted from drewdi's mit-licensed ascii-sharks), a man with an umbrella under a street lamp in the rain, the sea at night, and the chicago skyline lit by the real time of day.",
        "a paper-trading game on live hyperliquid prices for btc, eth and sol: spot or perps up to 10x, take profit and stop loss, liquidations, and progress saved in your browser.",
        "a working terminal (help, fetch, cd, cat, grep and more) with ten secrets hidden around the machine. `ls -a` is a good place to start.",
        "apps that open in floating windows: code (the site's own source in vs code's editor, with real type checking), notes, a yazi file manager, btop, and a tidal-style music app that plays soundcloud through its official player.",
      ],
    },
  ] satisfies Project[],

  experience: [
    { title: "trader", org: "crypto", when: "2021 – now", line: "meme coins and perps, on and off. grew an x following past 1,000, including a few notable kols." },
    { title: "co-founder", org: "ecommerce store", when: "aug 2025 – feb 2026", line: "co-founded a shopify dropshipping store with a partner." },
    { title: "ecommerce team member", org: "whole foods market", when: "jul – aug 2025", line: "fulfilled 15–20 online orders a shift at 98%+ accuracy." },
    { title: "appointment setter", org: "american income life", when: "feb – aug 2024", line: "part-time outbound prospecting: qualified leads, booked consultations for senior agents, kept the crm current." },
    { title: "co-founder", org: "azuro", when: "jun – nov 2023", line: "ai tools for real estate." },
    { title: "reseller", org: "sneakers", when: "", line: "where the business itch started." },
  ] satisfies Job[],

  education: { school: "indiana university, luddy school", degree: "b.s. computer science, ai concentration", minor: "entrepreneurship", when: "class of 2028", gpa: "3.3" },

  stack: {
    strongest: ["python", "java"],
    using: ["javascript", "typescript", "django", "html / css", "c"],
  },

  /** Your GitHub username; the activity workspace fills itself from it in a later build. */
  github: "Parth-998",

  contact: {
    email: "parthawana21@gmail.com",
    links: [
      { label: "github", href: "https://github.com/Parth-998" },
      { label: "linkedin", href: "https://www.linkedin.com/in/parth-awana/" },
      { label: "soundcloud", href: "https://soundcloud.com/ap_on_the_beat" },
    ],
    resume: "resume.pdf", // web copy: phone and address removed
  },

  credits: [{ label: "ascii-sharks by drewdi (mit)", href: "https://github.com/stackedlol/ascii-sharks" }],
};

export type Site = typeof site;
