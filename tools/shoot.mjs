// Capture the dashboard's screenshots with headless Chromium over the DevTools protocol (Node 22, no deps).
//   node tools/shoot.mjs <out dir with dashboard/ + data.js> <dest dir>
// Each shot is a URL hash the page reads; the page itself renders, nothing is drawn here.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const [outDir = 'out', dest = 'screenshots'] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
const W = 1440, H = +(process.env.H ?? 1060);
const SHOTS = [
  ['1-board.png', '', H],
  ['2-detail.png', 'p=gauntlet', 840],
  ['3-filtered.png', 'win=Fresh&mom=1&sort=d7&dir=-1', H],
];
const extra = process.env.SHOTS ? JSON.parse(process.env.SHOTS) : null;

const port = 9333 + Math.floor(Math.random() * 500);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${W},${H}`, '--user-data-dir=' + resolve(process.env.TMPDIR ?? '/tmp', 'chrome-shoot'), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + m.params.exceptionDetails.exception?.description?.slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + JSON.stringify(m.params.args).slice(0, 200));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const page = 'file://' + resolve(outDir, 'dashboard/index.html');
mkdirSync(dest, { recursive: true });
const probe = `(() => {
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('svg') || el.offsetParent === null) return;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis' && !el.matches('.detail,.tablewrap,html,body')) bad.push(el.className || el.tagName);
  });
  const d = document.getElementById('detail');
  return JSON.stringify({ docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    rowsVisible: [...document.querySelectorAll('.board tbody tr')].filter((r) => r.getBoundingClientRect().bottom < innerHeight).length,
    detailH: d.hidden ? 0 : d.scrollHeight, overflow: [...new Set(bad)].slice(0, 8),
    wide: [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent !== null).slice(0, 6).map((e) => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right)),
    ...(window.PROBE ? window.PROBE() : {}) });
})()`;
for (const [name, hash, h = H] of extra ?? SHOTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: page + (hash ? '#' + hash : '') });
  await sleep(900);
  if (process.env.PROBE_JS) await send('Runtime.evaluate', { expression: (await import('node:fs')).readFileSync(process.env.PROBE_JS, 'utf8') });
  const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: h, scale: 1 } });
  writeFileSync(join(dest, name), Buffer.from(shot.result.data, 'base64'));
  console.log(name, r.result?.result?.value ?? JSON.stringify(r).slice(0, 200));
}
if (logs.length) console.log(logs.join('\n'));
ws.close(); proc.kill();
