// Builds assets/about-terminal.svg: an animated terminal that "types" the About Me section.
// Edit LINES below, then run from the repo root: node .github/scripts/build-about.mjs
//
// Every animation uses `backwards` fill, so a renderer without CSS animation simply shows the
// finished terminal; with animation, commands type out and their output fades in after.
import { mkdirSync, writeFileSync } from "node:fs";

const C = {
  prompt: "#7ee787", path: "#79c0ff", cmd: "#e6edf3", text: "#c9d1d9", dim: "#8b949e",
  key: "#ff7b72", str: "#a5d6ff", accent: "#d2a8ff", warm: "#ffa657",
};

// A line is either { cmd: "..." } (typed after a prompt) or an array of [text, colour] segments.
const LINES = [
  { cmd: "whoami" },
  [["Arpit Pandey", C.accent], [" — Full Stack & Systems Engineer", C.text]],
  { cmd: "cat about.md" },
  [["▸ ", C.warm], ["Builds platforms end to end: C++ cores → Next.js UIs", C.text]],
  [["▸ ", C.warm], ["Agentic & multimodal AI · multi-agent systems · RAG", C.text]],
  [["▸ ", C.warm], ["Simulation, digital twins & numerical computing", C.text]],
  [["▸ ", C.warm], ["Hackathon regular · DSA on LeetCode & HackerRank", C.text]],
  { cmd: "cat stack.json" },
  [["{ ", C.dim], ['"core"', C.key], [": [", C.dim], ['"C++"', C.str], [", ", C.dim], ['"Python"', C.str], [", ", C.dim], ['"TypeScript"', C.str], ["],", C.dim]],
  [["  ", C.dim], ['"ai"', C.key], [": [", C.dim], ['"PyTorch"', C.str], [", ", C.dim], ['"Gemini"', C.str], [", ", C.dim], ['"Ollama"', C.str], ["] }", C.dim]],
  { cmd: "echo $CONTACT" },
  [["arpitpandey0307@gmail.com", C.path]],
];

const W = 560, LH = 22, TOP = 58, LEFT = 20, CH = 8.4; // CH ≈ monospace char width at 14px
const H = TOP + (LINES.length + 1) * LH + 14;
const TYPE_RATE = 0.045; // seconds per typed char
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let t = 0.4;
const css = [];
const body = [];
const PROMPT = [["arpit", C.prompt], ["@", C.dim], ["github", C.prompt], [":", C.dim], ["~", C.path], ["$ ", C.dim]];
const PROMPT_LEN = "arpit@github:~$ ".length;
const tspans = (segs) => segs.map(([s, c]) => `<tspan fill="${c}">${esc(s)}</tspan>`).join("");

LINES.forEach((line, i) => {
  const y = TOP + i * LH;
  if (line.cmd) {
    const dur = Math.max(0.3, line.cmd.length * TYPE_RATE);
    const startX = LEFT + PROMPT_LEN * CH;
    // prompt appears, then a cover rect slides off the command in character-sized steps.
    css.push(`.l${i}{animation:show .01s ${t.toFixed(2)}s backwards}`);
    css.push(`.c${i}{animation:type ${dur.toFixed(2)}s steps(${line.cmd.length}) ${(t + 0.25).toFixed(2)}s backwards}`);
    body.push(`<g class="l${i}"><text x="${LEFT}" y="${y}">${tspans(PROMPT)}<tspan fill="${C.cmd}">${esc(line.cmd)}</tspan></text>` +
      `<rect class="cv c${i}" x="${startX}" y="${y - 15}" width="${W}" height="${LH}" fill="#0d1117" style="--w:${(line.cmd.length * CH + 2).toFixed(0)}px"/></g>`);
    t += 0.25 + dur + 0.25;
  } else {
    css.push(`.l${i}{animation:fade .35s ease-out ${t.toFixed(2)}s backwards}`);
    body.push(`<text class="l${i}" x="${LEFT}" y="${y}">${tspans(line)}</text>`);
    t += 0.18;
  }
});

// Final prompt with a blinking cursor (blinks forever; static renderers show a solid block).
const yEnd = TOP + LINES.length * LH;
css.push(`.end{animation:show .01s ${t.toFixed(2)}s backwards}`);
css.push(`.cur{animation:blink 1s steps(1) ${t.toFixed(2)}s infinite}`);
body.push(`<g class="end"><text x="${LEFT}" y="${yEnd}">${tspans(PROMPT)}</text>` +
  `<rect class="cur" x="${LEFT + PROMPT_LEN * CH}" y="${yEnd - 14}" width="9" height="18" fill="${C.prompt}"/></g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="About Arpit Pandey">
<style>
  text { font-family: "Fira Code", "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 14px; white-space: pre; }
  @keyframes show { from { opacity: 0 } }
  @keyframes fade { from { opacity: 0; transform: translateX(-6px) } }
  @keyframes type { from { transform: translateX(0) } to { transform: translateX(var(--w)) } }
  .cv { transform: translateX(${W}px); }
  @keyframes blink { 50% { opacity: 0 } }
  ${css.join("\n  ")}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
</style>
<defs><clipPath id="win"><rect width="${W}" height="${H}" rx="12"/></clipPath></defs>
<g clip-path="url(#win)">
  <rect width="${W}" height="${H}" fill="#0d1117"/>
  <rect width="${W}" height="34" fill="#161b22"/>
  <circle cx="20" cy="17" r="6" fill="#ff5f57"/><circle cx="40" cy="17" r="6" fill="#febc2e"/><circle cx="60" cy="17" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="22" text-anchor="middle" fill="${C.dim}" style="font-size:12px">arpit@github: ~ — zsh</text>
  ${body.join("\n  ")}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="#30363d"/>
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/about-terminal.svg", svg);
console.log(`assets/about-terminal.svg  ${W}x${H}, animation ${t.toFixed(1)}s`);
