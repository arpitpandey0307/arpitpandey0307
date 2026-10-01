// Generates assets/activity-graph-{dark,light}.svg from the GitHub contribution calendar.
// Replaces the hosted github-readme-activity-graph service, which was shut down (HTTP 402).
// Usage: GITHUB_TOKEN=... node .github/scripts/activity-graph.mjs [username] [days]

import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.argv[2] || process.env.GRAPH_USER || "arpitpandey0307";
const DAYS = Number(process.argv[3] || 31);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required");

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "activity-graph" },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);

const calendar = json.data.user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((w) => w.contributionDays).slice(-DAYS);
const counts = days.map((d) => d.contributionCount);
const periodTotal = counts.reduce((a, b) => a + b, 0);

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", title: "#e6edf3", text: "#8b949e", grid: "#21262d", line: "#58a6ff", fill: "#58a6ff", point: "#79c0ff" },
  light: { bg: "#ffffff", border: "#d0d7de", title: "#1f2328", text: "#656d76", grid: "#eaeef2", line: "#0969da", fill: "#0969da", point: "#0550ae" },
};

const W = 900, H = 320;
const pad = { top: 64, right: 28, bottom: 48, left: 52 };
const plotW = W - pad.left - pad.right;
const plotH = H - pad.top - pad.bottom;

// Round the y-axis max up to a value that divides cleanly into 4 gridlines.
const rawMax = Math.max(4, ...counts);
const step = Math.ceil(rawMax / 4);
const yMax = step * 4;

const x = (i) => pad.left + (days.length === 1 ? plotW / 2 : (i * plotW) / (days.length - 1));
const y = (v) => pad.top + plotH - (v / yMax) * plotH;
const fmt = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function render(t) {
  const pts = counts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(days.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = k * step;
    return `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="${t.grid}" stroke-width="1"/>` +
      `<text x="${pad.left - 10}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`;
  }).join("");

  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  const xLabels = days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1)
    ? `<text x="${x(i)}" y="${H - pad.bottom + 22}" text-anchor="middle" class="axis">${fmt(d.date)}</text>` : "").join("");

  const points = days.map((d, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(d.contributionCount).toFixed(1)}" r="3.5" fill="${t.point}" stroke="${t.bg}" stroke-width="1.5"><title>${esc(fmt(d.date))}: ${d.contributionCount} contributions</title></circle>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(USER)} contribution activity, last ${days.length} days">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .title { font-size: 18px; font-weight: 600; fill: ${t.title}; }
  .sub { font-size: 12px; fill: ${t.text}; }
  .axis { font-size: 11px; fill: ${t.text}; }
</style>
<defs>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${t.fill}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${t.fill}" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<text x="${pad.left}" y="32" class="title">${esc(USER)}'s Contribution Graph</text>
<text x="${pad.left}" y="50" class="sub">${periodTotal} contributions in the last ${days.length} days · ${calendar.totalContributions} in the last year · updated ${fmt(days[days.length - 1].date)}</text>
${grid}
${xLabels}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" fill="none" stroke="${t.line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${points}
<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="axis">Days</text>
<text x="16" y="${pad.top + plotH / 2}" text-anchor="middle" class="axis" transform="rotate(-90 16 ${pad.top + plotH / 2})">Contributions</text>
</svg>
`;
}

mkdirSync("assets", { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(`assets/activity-graph-${name}.svg`, render(theme));
}
console.log(`Wrote activity graphs for ${USER}: ${periodTotal} contributions over ${days.length} days`);
