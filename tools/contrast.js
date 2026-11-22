window.PROBE = () => {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => { const a = top[3] === undefined ? 1 : top[3]; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)); };
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 4 && c[3] === 0) continue; stack.push(c); if (c.length === 3 || c[3] === 1) break; }
    let base = [9, 14, 26];
    for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  const det = document.getElementById('detail');
  const els = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null && !e.closest('svg') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((e) => det.hidden ? true : e.closest('#detail')).filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  const low = {};
  els.forEach((e) => {
    const cs = getComputedStyle(e), fg = rgb(cs.color), bg = bgOf(e);
    const fgc = blend(fg, bg), L1 = lum(fgc), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const op = +cs.opacity;
    if (cr < 4.5 || op < 1) { const k = (e.className || e.tagName) + ' "' + e.textContent.trim().slice(0, 18) + '"'; low[k] = Math.round(cr * 10) / 10; }
  });
  return { lowContrast: Object.entries(low).slice(0, 14) };
};
