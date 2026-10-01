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
// Neon line chart. Animations are layered so a static renderer still shows the finished chart:
// CSS ones use `backwards` fill (start hidden, end at the natural visible state), and SMIL-only
// extras (comet, light sweep, pulses) start invisible or off-canvas.
const NEON = {
  dark: { bg1: "#0b0f1a", bg2: "#140b26", dot: "#1f2a44", line: ["#00F5FF", "#7B61FF", "#FF00E5"], area: "#7B61FF", chipBg: "#161b2e", chipText: "#e6edf3", glow: 0.9 },
  light: { bg1: "#ffffff", bg2: "#f3f0ff", dot: "#e4e2f5", line: ["#0099b8", "#6639ba", "#c4007a"], area: "#6639ba", chipBg: "#f1f0fa", chipText: "#1f2328", glow: 0.35 },
};

// Catmull-Rom → cubic Bézier, with control points clamped so the curve never dips below zero.
function smoothPath(pts, floorY) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const k = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, Math.min(floorY, p1[1] + (p2[1] - p0[1]) * k)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, Math.min(floorY, p2[1] - (p3[1] - p1[1]) * k)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function activityGraph(t, themeName) {
  const n = NEON[themeName];
  const days = allDays.slice(-DAYS);
  const counts = days.map((d) => d.contributionCount);
  const W = 900, H = 360, pad = { top: 104, right: 34, bottom: 46, left: 54 };
  const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
  const step = Math.ceil(Math.max(4, ...counts) / 4), yMax = step * 4;
  const x = (i) => pad.left + (i * plotW) / (days.length - 1);
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const base = y(0);
  const pts = counts.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts, base);
  const area = `${line} L${x(days.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  const total = counts.reduce((a, b) => a + b, 0);
  const peakI = counts.indexOf(Math.max(...counts));
  const active = counts.filter((c) => c > 0).length;
  const chips = [
    ["⚡", `${total}`, "contributions"],
    ["🏆", `${counts[peakI]}`, `best day · ${fmt(days[peakI].date)}`],
    ["📈", (total / days.length).toFixed(1), "avg / day"],
    ["🔥", `${active}/${days.length}`, "active days"],
  ];
  let cx = pad.left;
  const chipSvg = chips.map(([icon, val, label], i) => {
    const w = 30 + (val.length + label.length) * 7.2 + 18;
    const s = `<g class="pop" style="animation-delay:${(0.2 + i * 0.12).toFixed(2)}s"><rect x="${cx}" y="56" width="${w.toFixed(0)}" height="28" rx="14" fill="${n.chipBg}" stroke="url(#lineGrad)" stroke-opacity="0.6"/>` +
      `<text x="${cx + 12}" y="75" style="font-size:13px">${icon}</text><text x="${cx + 32}" y="75" style="font-size:13px;font-weight:700" fill="${n.chipText}">${esc(val)} <tspan style="font-weight:400" fill="${t.text}">${esc(label)}</tspan></text></g>`;
    cx += w + 10;
    return s;
  }).join("");

  const grid = [0, 1, 2, 3, 4].map((k) => `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(k * step)}" y2="${y(k * step)}" stroke="${t.grid}" stroke-dasharray="${k ? "3 6" : "0"}"/>` +
    `<text x="${pad.left - 12}" y="${y(k * step) + 4}" text-anchor="end" class="axis">${k * step}</text>`).join("");
  const every = Math.ceil(days.length / 8);
  const xLabels = days.map((d, i) => (i % every === 0 || i === days.length - 1)
    ? `<text x="${x(i)}" y="${H - pad.bottom + 24}" text-anchor="middle" class="axis">${fmt(d.date)}</text>` : "").join("");

  const DRAW = 2.2; // seconds for the line to draw itself
  const points = days.map((d, i) => {
    const v = d.contributionCount, [px, py] = pts[i];
    const delay = (DRAW * i / (days.length - 1)).toFixed(2);
    return v === 0
      ? `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2" fill="${t.text}" opacity="0.5" class="pop" style="animation-delay:${delay}s"><title>${esc(fmt(d.date))}: 0 contributions</title></circle>`
      : `<g class="pop" style="animation-delay:${delay}s"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${n.bg1}" stroke="url(#lineGrad)" stroke-width="2.5"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2" fill="${themeName === "dark" ? "#fff" : n.line[1]}"/><title>${esc(fmt(d.date))}: ${v} contributions</title></g>`;
  }).join("");

  const [peakX, peakY] = pts[peakI];
  const tagW = 92, tagX = Math.min(Math.max(peakX - tagW / 2, pad.left), W - pad.right - tagW);
  const peak = `<g class="pop" style="animation-delay:${(DRAW + 0.2).toFixed(2)}s">
  <circle cx="${peakX}" cy="${peakY}" r="8" fill="none" stroke="${n.line[2]}" stroke-width="2" opacity="0">
    <animate attributeName="r" values="6;22" dur="1.8s" begin="${DRAW}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0" dur="1.8s" begin="${DRAW}s" repeatCount="indefinite"/>
  </circle>
  <rect x="${tagX}" y="${peakY - 38}" width="${tagW}" height="22" rx="11" fill="${n.line[2]}"/>
  <text x="${tagX + tagW / 2}" y="${peakY - 23}" text-anchor="middle" style="font-size:12px;font-weight:700" fill="#fff">🔥 peak · ${counts[peakI]}</text>
</g>`;

  const [endX, endY] = pts.at(-1);
  const today = `<circle cx="${endX}" cy="${endY}" r="4" fill="${n.line[0]}" opacity="0">
  <animate attributeName="r" values="4;14" dur="1.4s" begin="${DRAW}s" repeatCount="indefinite"/>
  <animate attributeName="opacity" values="0.8;0" dur="1.4s" begin="${DRAW}s" repeatCount="indefinite"/>
</circle>`;

  const style = `<style>
  text { font-family: ${FONT}; }
  .title { font-size: 20px; font-weight: 700; }
  .axis { font-size: 11px; fill: ${t.text}; }
  .draw { stroke-dasharray: 1; animation: draw ${DRAW}s cubic-bezier(.6,.1,.3,1) backwards; }
  @keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  .areaIn { animation: areaIn 1.2s ease-out ${(DRAW * 0.6).toFixed(2)}s backwards; }
  @keyframes areaIn { from { opacity: 0; } }
  .pop { transform-box: fill-box; transform-origin: center; animation: pop .45s cubic-bezier(.3,1.7,.5,1) backwards; }
  @keyframes pop { from { opacity: 0; transform: scale(0.2); } }
  @media (prefers-reduced-motion: reduce) { .draw, .areaIn, .pop { animation: none; } }
</style>`;

  const defs = `<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${n.bg1}"/><stop offset="100%" stop-color="${n.bg2}"/></linearGradient>
  <linearGradient id="lineGrad" gradientUnits="userSpaceOnUse" x1="${pad.left}" y1="0" x2="${W - pad.right}" y2="0">
    <stop offset="0%" stop-color="${n.line[0]}"/><stop offset="50%" stop-color="${n.line[1]}"/><stop offset="100%" stop-color="${n.line[2]}"/>
  </linearGradient>
  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${n.area}" stop-opacity="0.45"/><stop offset="100%" stop-color="${n.area}" stop-opacity="0"/></linearGradient>
  <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity="${themeName === "dark" ? 0.10 : 0.35}"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="${n.dot}"/></pattern>
  <filter id="glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="comet" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>
  <clipPath id="plot"><rect x="${pad.left}" y="${pad.top - 30}" width="${plotW}" height="${plotH + 30}"/></clipPath>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="14"/></clipPath>
</defs>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(USER)} contribution activity, last ${days.length} days">
${style}
${defs}
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.6"/>
  <text x="${pad.left}" y="38" class="title" fill="url(#lineGrad)">${esc(USER)}'s Contribution Graph</text>
  <text x="${W - pad.right}" y="38" text-anchor="end" class="axis">last ${days.length} days · ${num(calendar.totalContributions)} this year · updated ${fmt(days.at(-1).date)}</text>
  ${chipSvg}
  ${grid}${xLabels}
  <path d="${area}" fill="url(#areaGrad)" class="areaIn"/>
  <g clip-path="url(#plot)">
    <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="7" opacity="${n.glow}" filter="url(#glow)" pathLength="1" class="draw"/>
    <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" pathLength="1" class="draw"/>
    <rect x="-200" y="${pad.top - 30}" width="140" height="${plotH + 30}" fill="url(#sweep)">
      <animate attributeName="x" values="${pad.left - 160};${W}" dur="4.5s" begin="${DRAW}s" repeatCount="indefinite"/>
    </rect>
  </g>
  ${points}
  ${today}
  ${peak}
  <g opacity="0">
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="5s" begin="${DRAW}s" repeatCount="indefinite"/>
    <animateMotion dur="5s" begin="${DRAW}s" repeatCount="indefinite" path="${line}"/>
    <circle r="9" fill="${n.line[0]}" filter="url(#comet)"/>
    <circle r="3.5" fill="#fff"/>
  </g>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="url(#lineGrad)" stroke-opacity="0.45"/>
</svg>
`;
}

// ---------- stats card ----------
// Stats and languages cards share one size and sit side by side at ~49% width each,
// so their text renders at roughly its authored size instead of being scaled down.
const SIDE_W = 440, SIDE_H = 250;
const bigStyle = `<style>
  .title { font-size: 22px; font-weight: 700; }
  .label { font-size: 16px; }
  .value { font-size: 17px; font-weight: 700; }
  .pct { font-size: 14px; }
</style>`;

function statsCard(t) {
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const rows = [
    ["⭐", "Stars earned", stars],
    ["📝", "Commits (year)", cc.totalCommitContributions],
    ["🔒", "Private contribs", cc.restrictedContributionsCount],
    ["🔀", "Pull requests", u.pullRequests.totalCount],
    ["🐞", "Issues", u.issues.totalCount],
    ["📦", "Public repos", u.repositories.totalCount],
  ];
  const body = rows.map(([icon, label, value], i) => {
    const y = 84 + i * 29;
    return `<g class="fade" style="animation-delay:${(i * 0.1).toFixed(1)}s"><text x="24" y="${y}" style="font-size:16px">${icon}</text>` +
      `<text x="52" y="${y}" class="label">${label}</text><text x="238" y="${y}" class="value" text-anchor="end">${num(value)}</text></g>`;
  }).join("");
  const cx = 340, cy = 140, r = 62, C = 2 * Math.PI * r;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="10"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" class="ringIn"/>
<text x="${cx}" y="${cy + 6}" text-anchor="middle" style="font-size:34px;font-weight:800" fill="${t.value}">${num(calendar.totalContributions)}</text>
<text x="${cx}" y="${cy + 30}" text-anchor="middle" class="label" style="font-size:13px" fill="${t.text}">contributions</text>`;
  return card(t, SIDE_W, SIDE_H, `${bigStyle}<style>.ringIn{stroke-dashoffset:0;animation:ring 1.6s cubic-bezier(.6,.1,.3,1) backwards}@keyframes ring{from{stroke-dashoffset:${C.toFixed(1)}}}@media (prefers-reduced-motion:reduce){.ringIn{animation:none}}</style>
<defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${t.accent2}"/><stop offset="100%" stop-color="${t.accent}"/></linearGradient></defs>
<text x="24" y="42" class="title" fill="${t.title}">${esc(u.name || USER)}'s GitHub Stats</text>
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
  const barX = 24, barW = SIDE_W - 48;
  let off = 0;
  const bar = top.map(([, v]) => { const w = (v.size / sum) * barW; const s = `<rect x="${(barX + off).toFixed(1)}" y="64" width="${(w + 0.5).toFixed(1)}" height="14" fill="${v.color}"/>`; off += w; return s; }).join("");
  const legend = top.map(([name, v], i) => {
    const x = 24 + (i % 2) * 205, y = 122 + Math.floor(i / 2) * 42;
    return `<g class="fade" style="animation-delay:${(i * 0.1).toFixed(1)}s"><circle cx="${x + 7}" cy="${y - 5}" r="7" fill="${v.color}"/>` +
      `<text x="${x + 22}" y="${y}" class="label" fill="${t.value}">${esc(name)} <tspan class="pct" fill="${t.text}">${((v.size / sum) * 100).toFixed(1)}%</tspan></text></g>`;
  }).join("");
  return card(t, SIDE_W, SIDE_H, `${bigStyle}<style>.barIn{transform-origin:${barX}px 0;animation:grow 1.2s cubic-bezier(.6,.1,.3,1) backwards}@keyframes grow{from{transform:scaleX(0)}}@media (prefers-reduced-motion:reduce){.barIn{animation:none}}</style>
<defs><clipPath id="bar"><rect x="${barX}" y="64" width="${barW}" height="14" rx="7"/></clipPath></defs>
<text x="24" y="42" class="title" fill="${t.title}">Most Used Languages</text>
<g clip-path="url(#bar)"><g class="barIn">${bar}</g></g>
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
  const W = 900, H = 200, colW = W / 3;
  const body = cols.map(([value, label, sub, color], k) => {
    const cx = colW * k + colW / 2;
    const ring = k === 1 ? `<circle cx="${cx}" cy="70" r="44" fill="none" stroke="${color}" stroke-width="6"/><text x="${cx}" y="34" text-anchor="middle" style="font-size:24px">🔥</text>` : "";
    return `<g class="fade" style="animation-delay:${(k * 0.15).toFixed(2)}s">${ring}
<text x="${cx}" y="84" text-anchor="middle" style="font-size:40px;font-weight:800" fill="${color}">${value}</text>
<text x="${cx}" y="148" text-anchor="middle" class="label" style="font-size:19px;font-weight:700" fill="${t.value}">${label}</text>
<text x="${cx}" y="174" text-anchor="middle" class="axis" style="font-size:14px">${esc(sub)}</text></g>` +
      (k < 2 ? `<line x1="${colW * (k + 1)}" x2="${colW * (k + 1)}" y1="30" y2="172" stroke="${t.border}"/>` : "");
  }).join("");
  return card(t, W, H, body, `${USER} contribution streak`);
}

mkdirSync("assets", { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(`assets/activity-graph-${name}.svg`, activityGraph(t, name));
  writeFileSync(`assets/stats-${name}.svg`, statsCard(t));
  writeFileSync(`assets/languages-${name}.svg`, languagesCard(t));
  writeFileSync(`assets/streak-${name}.svg`, streakCard(t));
}
console.log(`Wrote stats for ${USER}: ${calendar.totalContributions} contributions this year, last day ${allDays.at(-1).date}`);
