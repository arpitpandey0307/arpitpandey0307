// composes skill rows (skillicons.dev tiles + Simple Icons tiles in the same style)
// into self-hosted SVGs under assets/, so the README doesn't depend on a live icon service.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "assets"; // run from the repo root: node .github/scripts/build-icons.mjs
const TILE_BG = "#242938";

// Simple Icons that skillicons.dev doesn't have: [slug, label, colour on dark tile]
const CUSTOM = {
  cuda: ["nvidia", "CUDA", "#76B900"],
  neo4j: ["neo4j", "Neo4j", "#4581C3"],
  onnx: ["onnx", "ONNX", "#FFFFFF"],
  gemini: ["googlegemini", "Gemini", "#8E75B2"],
  ollama: ["ollama", "Ollama", "#FFFFFF"],
  numpy: ["numpy", "NumPy", "#4DABCF"],
  pandas: ["pandas", "pandas", "#E70488"],
  jupyter: ["jupyter", "Jupyter", "#F37626"],
  streamlit: ["streamlit", "Streamlit", "#FF4B4B"],
  sqlalchemy: ["sqlalchemy", "SQLAlchemy", "#FF5A3C"],
  gsap: ["gsap", "GSAP", "#88CE02"],
  leaflet: ["leaflet", "Leaflet", "#5BB35B"],
  maplibre: ["maplibre", "MapLibre", "#5A9CFF"],
  render: ["render", "Render", "#FFFFFF"],
  railway: ["railway", "Railway", "#FFFFFF"],
  leetcode: ["leetcode", "LeetCode", "#FFA116"],
  hackerrank: ["hackerrank", "HackerRank", "#00EA64"],
};

const ROWS = {
  languages: ["py", "cpp", "c", "ts", "js", "java", "bash", "cuda"],
  ai: ["pytorch", "tensorflow", "sklearn", "opencv", "numpy", "pandas", "jupyter", "onnx", "gemini", "ollama", "streamlit"],
  backend: ["nodejs", "express", "fastapi", "flask", "sqlalchemy"],
  frontend: ["react", "nextjs", "tailwind", "vite", "html", "css", "threejs", "gsap", "p5js", "maplibre", "leaflet"],
  databases: ["postgres", "mongodb", "mysql", "redis", "prisma", "neo4j", "firebase", "supabase"],
  cloud: ["docker", "gcp", "githubactions", "vercel", "render", "railway", "git", "github", "linux", "cmake", "postman", "vscode"],
  learning: ["kubernetes", "aws", "terraform"],
};

const PER_LINE = 12;
const STEP = 300;   // 256px tile + 44px gap, the skillicons grid

const tileCache = {};

async function customTile(key) {
  const [slug, label, color] = CUSTOM[key];
  const svg = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`)).text();
  const d = svg.match(/ d="([^"]+)"/)[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><title>${label}</title>` +
    `<rect width="256" height="256" rx="60" fill="${TILE_BG}"/>` +
    `<g transform="translate(50 50) scale(6.5)"><path fill="${color}" d="${d}"/></g></svg>`;
}

async function skillTile(id) {
  const svg = await (await fetch(`https://skillicons.dev/icons?i=${id}`)).text();
  // The response wraps one 256x256 tile in an outer <svg>; keep the inner one.
  const inner = svg.slice(svg.indexOf("<svg", 10), svg.lastIndexOf("</g>"));
  if (!inner.includes("<rect")) throw new Error(`skillicons has no icon "${id}"`);
  // Namespace gradient/clip ids so tiles don't collide when combined.
  return inner.replace(/id="([^"]+)"/g, `id="${id}_$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}_$1)`)
    .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${id}_$1"`).replace(/ href="#([^"]+)"/g, ` href="#${id}_$1"`);
}

const tile = async (id) => (tileCache[id] ??= CUSTOM[id] ? await customTile(id) : await skillTile(id));

function compose(tiles, { animate = true } = {}) {
  const cols = Math.min(PER_LINE, tiles.length);
  const rows = Math.ceil(tiles.length / PER_LINE);
  const w = cols * STEP - 44, h = rows * STEP - 44;
  const body = tiles.map((t, i) => {
    const x = (i % PER_LINE) * STEP, y = Math.floor(i / PER_LINE) * STEP;
    return `<g transform="translate(${x} ${y})"><g class="t" style="animation-delay:${(i * 0.08).toFixed(2)}s">${t}</g></g>`;
  }).join("\n");
  // backwards fill: renderers without CSS animation just show the final, fully visible state.
  const style = animate ? `<style>.t{transform-origin:128px 128px;animation:pop .5s cubic-bezier(.3,1.6,.5,1) backwards}@keyframes pop{from{opacity:0;transform:scale(.4)}}@media (prefers-reduced-motion:reduce){.t{animation:none}}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${(w / 256) * 48}" height="${(h / 256) * 48}" viewBox="0 0 ${w} ${h}" fill="none">${style}\n${body}\n</svg>\n`;
}

mkdirSync(`${OUT}/skills`, { recursive: true });
mkdirSync(`${OUT}/icons`, { recursive: true });

for (const [name, ids] of Object.entries(ROWS)) {
  const tiles = [];
  for (const id of ids) tiles.push(await tile(id));
  writeFileSync(`${OUT}/skills/${name}.svg`, compose(tiles));
  console.log(`skills/${name}.svg  ${ids.length} icons`);
}

// Single tiles for the "Connect" row, so each can carry its own link.
for (const id of ["leetcode", "hackerrank"]) {
  writeFileSync(`${OUT}/icons/${id}.svg`, await customTile(id));
  console.log(`icons/${id}.svg`);
}

// Glowing section dividers: a gradient line over a blurred copy of itself, with the gradient
// sliding along it (SMIL, so it animates inside <img>; static renderers show the still line).
const DIVIDERS = {
  rainbow: ["#FF0055", "#FF8A00", "#FFE600", "#00E676", "#00B0FF", "#7C4DFF", "#FF00E5"],
  aqua: ["#00F5FF", "#00A3FF", "#7B61FF"],
  fire: ["#FF1744", "#FF9100", "#FFEA00"],
  neon: ["#FF00E5", "#7B61FF", "#00F5FF"],
  matrix: ["#00E676", "#76FF03", "#00BFA5"],
  sunset: ["#FF6B6B", "#FFB86C", "#FF79C6"],
};
mkdirSync(`${OUT}/dividers`, { recursive: true });
for (const [name, colors] of Object.entries(DIVIDERS)) {
  const loop = [...colors, colors[0]];
  const stops = loop.map((c, i) => `<stop offset="${(i / (loop.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join("");
  writeFileSync(`${OUT}/dividers/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="24" viewBox="0 0 1000 24" preserveAspectRatio="none">
<defs>
  <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0" spreadMethod="repeat">${stops}
    <animate attributeName="x1" from="0" to="1000" dur="6s" repeatCount="indefinite"/>
    <animate attributeName="x2" from="1000" to="2000" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
  <filter id="glow" x="-5%" y="-300%" width="110%" height="700%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect x="0" y="9" width="1000" height="6" rx="3" fill="url(#g)" filter="url(#glow)" opacity="0.9"/>
<rect x="0" y="10.5" width="1000" height="3" rx="1.5" fill="url(#g)"/>
</svg>
`);
  console.log(`dividers/${name}.svg`);
}
