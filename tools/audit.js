window.PROBE = () => {
  const leaves = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null && !e.closest('svg') && e.children.length === 0 && e.textContent.trim() && !e.closest('[hidden]'));
  const vis = leaves.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; });
  const det = document.getElementById('detail');
  const pool = det.hidden ? vis.filter((e) => !e.closest('#detail')) : vis.filter((e) => e.closest('#detail'));
  const over = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i].getBoundingClientRect(), b = pool[j].getBoundingClientRect();
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix > 2 && iy > 2 && !pool[i].contains(pool[j]) && !pool[j].contains(pool[i])) over.push(pool[i].textContent.slice(0, 20) + ' / ' + pool[j].textContent.slice(0, 20));
  }
  const trunc = pool.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => e.textContent.slice(0, 30));
  const tiny = [...new Set(pool.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 10.5).map((e) => e.className || e.tagName))];
  return { overlaps: over.slice(0, 10), nOverlap: over.length, truncated: trunc.slice(0, 8), tiny };
};
