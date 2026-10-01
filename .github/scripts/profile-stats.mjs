// Generates every stats image in the README from the GitHub GraphQL API, in dark and light themes:
//   assets/activity-graph-*.svg  contributions per day, last 31 days
//   assets/stats-*.svg           contributions, commits, PRs, issues, repos, stars
//   assets/languages-*.svg       top languages across public, non-fork repos
//   assets/streak-*.svg          yearly total, current streak, longest streak
// Run by .github/workflows/profile-stats.yml on a schedule, so nothing here needs manual updates.
// Locally: GITHUB_TOKEN=... node .github/scripts/profile-stats.mjs [username]

import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.argv[2] || process.env.GRAPH_USER || "arpitpandey0307";
const DAYS = 31;
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required");

// Languages that are markup, notebooks or build files rather than what the code is written in.
const HIDDEN_LANGS = new Set(["Jupyter Notebook", "HTML", "CSS", "Dockerfile", "CMake", "Mako", "Shell",
  "Batchfile", "PowerShell", "Makefile", "Procfile", "Mathematical Programming System"]);

const query = `query($login: String!) {
  user(login: $login) {
    name
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes { stargazerCount languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
const u = json.data.user;
const cc = u.contributionsCollection;
const calendar = cc.contributionCalendar;
const allDays = calendar.weeks.flatMap((w) => w.contributionDays);

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", title: "#e6edf3", text: "#8b949e", value: "#e6edf3", grid: "#21262d", line: "#58a6ff", point: "#79c0ff", accent: "#7B61FF", accent2: "#00F5FF", fire: "#FF9100", track: "#21262d" },
  light: { bg: "#ffffff", border: "#d0d7de", title: "#1f2328", text: "#656d76", value: "#1f2328", grid: "#eaeef2", line: "#0969da", point: "#0550ae", accent: "#6639ba", accent2: "#0969da", fire: "#d4570a", track: "#eaeef2" },
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (date, opts = { month: "short", day: "numeric" }) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const num = (n) => n.toLocaleString("en-US");
const card = (t, w, h, inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<style>
  text { font-family: ${FONT}; }
  .title { font-size: 18px; font-weight: 600; fill: ${t.title}; }
  .sub { font-size: 12px; fill: ${t.text}; }
  .axis { font-size: 11px; fill: ${t.text}; }
  .label { font-size: 14px; fill: ${t.text}; }
  .value { font-size: 14px; font-weight: 700; fill: ${t.value}; }
  .fade { animation: fade .6s ease-out backwards; }
  @keyframes fade { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
${inner}
</svg>
`;

// ---------- activity graph ----------
function activityGraph(t) {
  const days = allDays.slice(-DAYS);
  const counts = days.map((d) => d.contributionCount);
  const W = 900, H = 320, pad = { top: 64, right: 28, bottom: 48, left: 52 };
  const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
  const step = Math.ceil(Math.max(4, ...counts) / 4), yMax = step * 4;
  const x = (i) => pad.left + (i * plotW) / (days.length - 1);
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const pts = counts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(days.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const grid = [0, 1, 2, 3, 4].map((k) => `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(k * step)}" y2="${y(k * step)}" stroke="${t.grid}"/>` +
    `<text x="${pad.left - 10}" y="${y(k * step) + 4}" text-anchor="end" class="axis">${k * step}</text>`).join("");
  const every = Math.ceil(days.length / 8);
  const xLabels = days.map((d, i) => (i % every === 0 || i === days.length - 1)
    ? `<text x="${x(i)}" y="${H - pad.bottom + 22}" text-anchor="middle" class="axis">${fmt(d.date)}</text>` : "").join("");
  const points = days.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.contributionCount).toFixed(1)}" r="3.5" fill="${t.point}" stroke="${t.bg}" stroke-width="1.5"><title>${esc(fmt(d.date))}: ${d.contributionCount} contributions</title></circle>`).join("");
  const total = counts.reduce((a, b) => a + b, 0);
  return card(t, W, H, `<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.line}" stop-opacity="0.35"/><stop offset="100%" stop-color="${t.line}" stop-opacity="0"/></linearGradient></defs>
<text x="${pad.left}" y="32" class="title">${esc(USER)}'s Contribution Graph</text>
<text x="${pad.left}" y="50" class="sub">${total} contributions in the last ${days.length} days · ${num(calendar.totalContributions)} in the last year · updated ${fmt(days.at(-1).date)}</text>
${grid}${xLabels}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" fill="none" stroke="${t.line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${points}
<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="axis">Days</text>
<text x="16" y="${pad.top + plotH / 2}" text-anchor="middle" class="axis" transform="rotate(-90 16 ${pad.top + plotH / 2})">Contributions</text>`, `${USER} contribution activity`);
}

// ---------- stats card ----------
function statsCard(t) {
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const rows = [
    ["⭐", "Stars earned", stars],
    ["📝", "Commits (last year)", cc.totalCommitContributions],
    ["🔒", "Private contributions", cc.restrictedContributionsCount],
    ["🔀", "Pull requests", u.pullRequests.totalCount],
    ["🐞", "Issues", u.issues.totalCount],
    ["📦", "Public repositories", u.repositories.totalCount],
  ];
  const W = 450, H = 210;
  const body = rows.map(([icon, label, value], i) => {
    const y = 72 + i * 23;
    return `<g class="fade" style="animation-delay:${(i * 0.1).toFixed(1)}s"><text x="25" y="${y}" style="font-size:13px">${icon}</text>` +
      `<text x="50" y="${y}" class="label">${label}:</text><text x="245" y="${y}" class="value">${num(value)}</text></g>`;
  }).join("");
  // Ring: yearly contributions.
  const cx = 365, cy = 118, r = 46, C = 2 * Math.PI * r;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="8"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
<text x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:24px;font-weight:700" fill="${t.value}">${num(calendar.totalContributions)}</text>
<text x="${cx}" y="${cy + 22}" text-anchor="middle" class="axis">contributions</text>`;
  return card(t, W, H, `<defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${t.accent2}"/><stop offset="100%" stop-color="${t.accent}"/></linearGradient></defs>
<text x="25" y="36" class="title">${esc(u.name || USER)}'s GitHub Stats</text>
${body}${ring}`, `${USER} GitHub stats`);
}

// ---------- languages card ----------
function languagesCard(t) {
  const totals = new Map();
  for (const repo of u.repositories.nodes) for (const { size, node } of repo.languages.edges) {
    if (HIDDEN_LANGS.has(node.name)) continue;
    const cur = totals.get(node.name) || { size: 0, color: node.color || "#8b949e" };
    cur.size += size; totals.set(node.name, cur);
  }
  const top = [...totals.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const sum = top.reduce((a, [, v]) => a + v.size, 0) || 1;
  const W = 350, H = 210, barX = 25, barW = W - 50;
  let off = 0;
  const bar = top.map(([, v]) => { const w = (v.size / sum) * barW; const s = `<rect x="${(barX + off).toFixed(1)}" y="56" width="${w.toFixed(1)}" height="10" fill="${v.color}"/>`; off += w; return s; }).join("");
  const legend = top.map(([name, v], i) => {
    const x = 25 + (i % 2) * 160, y = 96 + Math.floor(i / 2) * 32;
    return `<g class="fade" style="animation-delay:${(i * 0.1).toFixed(1)}s"><circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${v.color}"/>` +
      `<text x="${x + 16}" y="${y}" class="label" style="font-size:13px">${esc(name)} <tspan class="axis">${((v.size / sum) * 100).toFixed(1)}%</tspan></text></g>`;
  }).join("");
  return card(t, W, H, `<defs><clipPath id="bar"><rect x="${barX}" y="56" width="${barW}" height="10" rx="5"/></clipPath></defs>
<text x="25" y="36" class="title">Most Used Languages</text>
<g clip-path="url(#bar)">${bar}</g>
${legend}`, `${USER} top languages`);
}

// ---------- streak card ----------
function streakCard(t) {
  const counts = allDays.map((d) => d.contributionCount);
  // Current streak counts back from today; a quiet today doesn't break it until the day is over.
  let i = counts.length - 1;
  if (counts[i] === 0) i--;
  let current = 0, curStart = null;
  for (; i >= 0 && counts[i] > 0; i--) { current++; curStart = allDays[i].date; }
  let longest = 0, run = 0, runStart = 0, best = [0, 0];
  counts.forEach((c, k) => {
    if (c > 0) { if (run === 0) runStart = k; run++; if (run > longest) { longest = run; best = [runStart, k]; } }
    else run = 0;
  });
  const range = (a, b) => a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
  const today = allDays.at(-1).date;
  const cols = [
    [num(calendar.totalContributions), "Total Contributions", `${fmt(allDays[0].date, { month: "short", day: "numeric", year: "numeric" })} – Present`, t.accent2],
    [current, "Current Streak", current ? range(curStart, counts.at(-1) ? today : allDays.at(-2).date) : "Start one today!", t.fire],
    [longest, "Longest Streak", longest ? range(allDays[best[0]].date, allDays[best[1]].date) : "—", t.accent],
  ];
  const W = 900, H = 170, colW = W / 3;
  const body = cols.map(([value, label, sub, color], k) => {
    const cx = colW * k + colW / 2;
    const ring = k === 1 ? `<circle cx="${cx}" cy="62" r="36" fill="none" stroke="${color}" stroke-width="5"/><text x="${cx}" y="34" text-anchor="middle" style="font-size:20px">🔥</text>` : "";
    return `<g class="fade" style="animation-delay:${(k * 0.15).toFixed(2)}s">${ring}
<text x="${cx}" y="${k === 1 ? 73 : 70}" text-anchor="middle" style="font-size:30px;font-weight:700" fill="${color}">${value}</text>
<text x="${cx}" y="128" text-anchor="middle" class="label" style="font-weight:600" fill="${t.value}">${label}</text>
<text x="${cx}" y="150" text-anchor="middle" class="axis">${esc(sub)}</text></g>` +
      (k < 2 ? `<line x1="${colW * (k + 1)}" x2="${colW * (k + 1)}" y1="28" y2="142" stroke="${t.border}"/>` : "");
  }).join("");
  return card(t, W, H, body, `${USER} contribution streak`);
}

mkdirSync("assets", { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(`assets/activity-graph-${name}.svg`, activityGraph(t));
  writeFileSync(`assets/stats-${name}.svg`, statsCard(t));
  writeFileSync(`assets/languages-${name}.svg`, languagesCard(t));
  writeFileSync(`assets/streak-${name}.svg`, streakCard(t));
}
console.log(`Wrote stats for ${USER}: ${calendar.totalContributions} contributions this year, last day ${allDays.at(-1).date}`);
