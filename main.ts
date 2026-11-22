// Token Radar v2 — make.fun token-radar-01 entry (Node 22.18+, standard library only).
//
// Reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>), runs the value model in
// dashboard/model.js — the same file the page runs, so the board.json the gate reads and the rows the
// screenshots show come from one function — and writes to /output (or MAKEFUN_OUTPUT_DIR / --output):
//   board.json    the ranked rows: slug, name, rank, implied_value_usd, farm_steps (+ the model's inputs)
//   data.js       the raw snapshot for the page, which recomputes the board in the browser
//   dashboard/    the page;  screenshots/  the three captures;  dossier.json  what the judge reads
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const model = createRequire(import.meta.url)('./dashboard/model.js');

type Protocol = {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null;
};
type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] };
type Row = { slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[] };

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(msg: string): never {
  process.stderr.write(`token radar v2: ${msg}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|dir>`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const raw = readFileSync(inputFile, 'utf8');
const snap = JSON.parse(raw) as Snapshot;
if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) fail('snapshot has no protocols or watchlist');
for (const p of snap.protocols) {
  if (typeof p.slug !== 'string' || typeof p.tvl_usd !== 'number' || !Array.isArray(p.chains)) fail(`malformed protocol ${JSON.stringify(p).slice(0, 80)}`);
}

const radar = model.buildRadar(snap);
const rows: Row[] = model.boardRows(radar);

/** The gate's board rules, checked before anything is written. */
function boardIssue(rows: Row[]): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, need 100 to 4000`;
  const known = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (!known.has(r.slug) || seen.has(r.slug)) return `row ${i}: slug ${r.slug} unknown or repeated`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${i}: rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `row ${i}: value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `row ${i}: value rises with rank`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${i}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `row ${i}: step of ${s.trim().length} chars`;
  }
  for (const w of snap.watchlist) if (!seen.has(w)) return `watchlist slug ${w} missing`;
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) return 'all implied values equal';
  return null;
}
const issue = boardIssue(rows);
if (issue) fail(`the board would fail the gate: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, 'board.json'),
  `${JSON.stringify({
    as_of: snap.as_of,
    source: snap.source,
    model: 'implied = TVL × peer mcap/TVL multiple(category) × (1+Δ7d)^1.5 × track(months tokenless) × reach(chains)',
    peer_multiple_global: radar.peers.global,
    rows,
  })}\n`,
);
// The page reads the snapshot as it is and runs dashboard/model.js on it.
writeFileSync(join(out, 'data.js'), `window.SNAPSHOT = ${raw.trim()};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pages = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images: hand in 3 or 4`);

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const top = rows[0]!;
process.stdout.write(
  `token radar v2: ${snap.protocols.length} protocols → ${rows.length} pre-token rows (${snap.watchlist.length} watchlist, all covered), ` +
    `${radar.trading.length} trading comps, ${radar.derived.length} derived set aside; #1 ${top.name} ${model.usd(top.implied_value_usd)}\n` +
    `token radar v2: wrote board.json, data.js, dashboard/ (${pages.length} files), screenshots/ (${shots.length}), dossier.json to ${out}\n`,
);
