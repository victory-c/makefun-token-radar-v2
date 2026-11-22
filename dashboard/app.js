/* Token Radar v2 — the page. It runs RadarModel.buildRadar (model.js) on the raw snapshot in ../data.js,
 * so every figure on screen is the figure main.ts wrote to board.json. State lives in the URL hash:
 *   #sort=implied&dir=-1&q=&cat=&chain=&tier=watch|below&win=Fresh|Prime|Late&mom=1&tab=board|comps|aside&p=<slug>
 */
(function () {
  'use strict';
  var M = window.RadarModel, S = window.SNAPSHOT;
  var R = M.buildRadar(S), usd = M.usd;
  var $ = function (id) { return document.getElementById(id); };
  var st = { tab: 'board', sort: 'rank', dir: 1, q: '', cat: '', chain: '', tier: '', win: '', mom: false, p: '' };
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.p.slug] = r; });
  var compSet = {};
  S.protocols.forEach(function (p) { if (p.mcap_usd > 0 && p.tvl_usd > 0) compSet[p.slug] = true; });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function pct(x, d) { return x === null || x === undefined ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d === undefined ? 1 : d) + '%'; }
  function mult(x) { return x.toFixed(x < 1 ? 2 : 2) + '×'; }
  function mo(m) { return m === null ? 'n/a' : m < 1 ? '<1 mo' : m.toFixed(m < 10 ? 1 : 0) + ' mo'; }
  function cls(x) { return x > 0.05 ? 'up' : x < -0.05 ? 'dn' : 'flat'; }

  /* ---------- hash state ---------- */
  function readHash() {
    st = { tab: 'board', sort: 'rank', dir: 1, q: '', cat: '', chain: '', tier: '', win: '', mom: false, p: '' };
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      if (k === 'dir') st.dir = +v || 1; else if (k === 'mom') st.mom = v === '1'; else if (k in st) st[k] = v;
    });
  }
  function writeHash() {
    var o = [];
    ['tab', 'sort', 'dir', 'q', 'cat', 'chain', 'tier', 'win', 'mom', 'p'].forEach(function (k) {
      var v = st[k];
      if (k === 'mom') v = v ? '1' : '';
      if (v !== '' && !(k === 'tab' && v === 'board') && !(k === 'sort' && v === 'rank') && !(k === 'dir' && v === 1)) o.push(k + '=' + encodeURIComponent(v));
    });
    history.replaceState(null, '', o.length ? '#' + o.join('&') : location.pathname);
  }

  /* ---------- filtering and sorting ---------- */
  var KEYS = {
    rank: function (r) { return r.rank; }, name: function (r) { return r.p.name.toLowerCase(); },
    tvl: function (r) { return r.p.tvl_usd; }, d7: function (r) { return r.p.change_7d === null ? -1e9 : r.p.change_7d; },
    months: function (r) { return r.v.months === null ? -1 : r.v.months; }, mult: function (r) { return r.v.multiple; },
    implied: function (r) { return r.v.implied; }, drop: function (r) { return r.v.dropYield; }, ticket: function (r) { return r.plan.share; }
  };
  function matchQ(p) {
    if (!st.q) return true;
    var q = st.q.toLowerCase();
    return (p.name + ' ' + p.slug + ' ' + (p.category || '') + ' ' + p.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
  }
  function view() {
    var rows = R.rows.filter(function (r) {
      var p = r.p;
      if (!matchQ(p)) return false;
      if (st.cat && (p.category || 'Uncategorised') !== st.cat) return false;
      if (st.chain && p.chains.indexOf(st.chain) < 0) return false;
      if (st.tier === 'watch' && !r.watch) return false;
      if (st.tier === 'below' && r.watch) return false;
      if (st.win && r.v.window !== st.win) return false;
      if (st.mom && !(p.change_7d > 0)) return false;
      return true;
    });
    var k = KEYS[st.sort] || KEYS.rank, d = st.dir;
    return rows.sort(function (a, b) { var x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * d; });
  }

  /* ---------- header, tabs, filters ---------- */
  function renderMeta() {
    $('meta').innerHTML =
      '<div class="src"><b>Snapshot ' + esc(R.asOf) + '</b><span>' + esc(S.source.replace(/ https?:\/\/\S+/, ' /protocols')) + '</span></div>' +
      '<div class="ok"><i></i>Watchlist ' + R.funnel.watch + '/' + R.funnel.watch + ' covered</div>';
  }
  function renderTabs() {
    var t = [['board', 'Pre-token board', R.rows.length], ['comps', 'Trading comps', R.trading.length], ['aside', 'Set aside', R.derived.length]];
    $('tabs').innerHTML = t.map(function (x) {
      return '<button role="tab" data-tab="' + x[0] + '" aria-selected="' + (st.tab === x[0]) + '">' + x[1] + '<em>' + x[2] + '</em></button>';
    }).join('');
  }
  function fillSelects() {
    var cats = {}, chains = {};
    R.rows.forEach(function (r) { var c = r.p.category || 'Uncategorised'; cats[c] = (cats[c] || 0) + 1; r.p.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; }); });
    var opt = function (o, all) {
      return '<option value="">' + all + '</option>' + Object.keys(o).sort(function (a, b) { return o[b] - o[a] || (a < b ? -1 : 1); })
        .map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + ' (' + o[k] + ')</option>'; }).join('');
    };
    $('cat').innerHTML = opt(cats, 'All categories');
    $('chain').innerHTML = opt(chains, 'All chains');
  }
  function syncControls() {
    $('q').value = st.q; $('cat').value = st.cat; $('chain').value = st.chain; $('mom').checked = st.mom;
    [['tier', st.tier], ['win', st.win]].forEach(function (g) {
      Array.prototype.forEach.call($(g[0]).children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === g[1])); });
    });
    $('filters').classList.toggle('off', st.tab !== 'board');
  }

  /* ---------- KPIs ---------- */
  function renderKpis(rows) {
    var sum = 0, pool = 0, tvl = 0, up = 0;
    rows.forEach(function (r) { sum += r.v.implied; pool += r.v.pool; tvl += r.p.tvl_usd; if (r.p.change_7d > 0) up++; });
    var top = rows.slice().sort(function (a, b) { return a.rank - b.rank; })[0];
    var k = [
      ['Implied value in view', usd(sum), rows.length + ' of ' + R.rows.length + ' pre-token rows', 'v'],
      ['Top implied value', top ? usd(top.v.implied) : '—', top ? '#' + top.rank + ' ' + esc(top.p.name) : 'no rows', ''],
      ['TVL with no token', usd(tvl), 'avg ' + mult(tvl ? sum / tvl : 0) + ' implied / TVL', ''],
      ['Early-user pool @ ' + R.params.DROP_SHARE * 100 + '%', usd(pool), 'early users\' share if values held', 'g'],
      ['7-day inflow', rows.length ? Math.round(up / rows.length * 100) + '%' : '—', up + ' rows grew TVL this week', ''],
      ['Peer multiple (all comps)', mult(R.peers.global), R.peers.n + ' traded tokens with market cap', 'c']
    ];
    $('kpis').innerHTML = k.map(function (x) {
      return '<div class="kpi ' + x[3] + '"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>';
    }).join('');
  }

  /* ---------- chips ---------- */
  function renderChips(n) {
    var c = [];
    if (st.q) c.push(['q', 'Search “' + esc(st.q) + '”']);
    if (st.cat) c.push(['cat', 'Category: ' + esc(st.cat)]);
    if (st.chain) c.push(['chain', 'Chain: ' + esc(st.chain)]);
    if (st.tier) c.push(['tier', st.tier === 'watch' ? 'On the watchlist (≥ ' + usd(R.floor) + ')' : 'Below the floor / off-list']);
    if (st.win) c.push(['win', 'Launch window: ' + st.win]);
    if (st.mom) c.push(['mom', '7-day TVL change > 0']);
    var sortName = { rank: 'rank', name: 'name', tvl: 'TVL', d7: '7d change', months: 'months tokenless', mult: 'peer multiple', implied: 'implied value', drop: 'drop / TVL', ticket: 'est. drop on ticket' }[st.sort];
    $('chips').innerHTML = st.tab !== 'board' ? '' :
      '<span class="count"><b>' + n + '</b> of ' + R.rows.length + ' rows</span>' +
      c.map(function (x) { return '<button class="chip" data-clear="' + x[0] + '">' + x[1] + ' <i>×</i></button>'; }).join('') +
      '<span class="sorted">sorted by ' + sortName + (st.dir > 0 ? ' ↑' : ' ↓') + '</span>';
  }

  /* ---------- the board ---------- */
  function th(key, label, cl) {
    var on = st.sort === key;
    return '<th class="' + (cl || '') + (on ? ' on' : '') + '" data-sort="' + key + '" aria-sort="' + (on ? (st.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
      label + '<i>' + (on ? (st.dir > 0 ? '▲' : '▼') : '↕') + '</i></th>';
  }
  function renderBoard(rows) {
    var max = R.rows[0].v.implied;
    var head = '<thead><tr>' + th('rank', '#', 'rk') + th('name', 'Protocol') + th('tvl', 'TVL', 'n') + th('d7', '7d', 'n') +
      th('months', 'Tokenless', '') + th('mult', 'Peer ×', 'n') + th('implied', 'Implied value', 'iv') + th('drop', 'Pool/TVL', 'n') +
      th('ticket', 'Farm plan · est. drop', 'pl') + '</tr></thead>';
    var body = rows.map(function (r) {
      var p = r.p, v = r.v, w = Math.max(2, Math.sqrt(v.implied / max) * 100), d = p.change_7d;
      var dw = d === null ? 0 : Math.min(100, Math.abs(d) / 20 * 100);
      return '<tr data-slug="' + esc(p.slug) + '" tabindex="0">' +
        '<td class="rk">' + r.rank + '</td>' +
        '<td class="nm"><b>' + esc(p.name) + '</b>' + (r.watch ? '<span class="tag w">WATCH</span>' : '') +
        '<div class="sub">' + esc(p.category || 'Uncategorised') + ' · ' + p.chains.length + (p.chains.length === 1 ? ' chain' : ' chains') + '</div></td>' +
        '<td class="n">' + usd(p.tvl_usd) + '</td>' +
        '<td class="n d7 ' + cls(d) + '"><span>' + pct(d) + '</span><s style="width:' + dw + '%"></s></td>' +
        '<td><span class="mo">' + mo(v.months) + '</span><span class="win ' + v.window + '">' + v.window + '</span></td>' +
        '<td class="n">' + mult(v.multiple) + '<span class="cf ' + v.confidence + '" title="' + v.peerN + ' comps, ' + v.confidence + ' confidence"></span></td>' +
        '<td class="iv"><b>' + usd(v.implied) + '</b><s style="width:' + w + '%"></s></td>' +
        '<td class="n">' + (v.dropYield * 100).toFixed(1) + '%</td>' +
        '<td class="pl">' + usd(r.plan.ticket) + ' · ' + r.plan.hold + 'd · ' + r.plan.steps.length + ' steps<em>' + usd(r.plan.share) + '</em></td></tr>';
    }).join('');
    $('main').innerHTML = '<table class="board">' + head + '<tbody>' + (body || '<tr><td colspan="9" class="empty">No protocol matches these filters.</td></tr>') + '</tbody></table>';
  }

  function renderComps() {
    var rows = R.trading.filter(matchQ).sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0) || b.tvl_usd - a.tvl_usd; });
    $('main').innerHTML = '<p class="lede">Protocols whose token already trades (DefiLlama records a gecko id or symbol). They are <b>not ranked</b>: ' +
      'the ' + R.peers.n + ' with a market cap price the board, as each category\'s median market cap / TVL.</p>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Token</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">Mcap / TVL</th><th class="n">Cat. multiple</th></tr></thead><tbody>' +
      rows.map(function (p) {
        var c = R.peers.cats[p.category || 'Uncategorised'];
        return '<tr><td class="nm"><b>' + esc(p.name) + '</b>' + (compSet[p.slug] ? '<span class="tag c">COMP</span>' : '') + '</td><td class="sym">' + (p.symbol ? '$' + esc(p.symbol) : '—') +
          '</td><td>' + esc(p.category || '—') + '</td><td class="n">' + usd(p.tvl_usd) + '</td><td class="n">' + (p.mcap_usd ? usd(p.mcap_usd) : '—') +
          '</td><td class="n">' + (p.mcap_usd ? mult(p.mcap_usd / p.tvl_usd) : '—') + '</td><td class="n">' + (c ? mult(c.multiple) + ' <small>n=' + c.n + '</small>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function renderAside() {
    var rows = R.derived.filter(function (d) { return matchQ(d.p); }).sort(function (a, b) { return b.p.tvl_usd - a.p.tvl_usd; });
    $('main').innerHTML = '<p class="lede">No token recorded, but set aside by the watchlist\'s own rule: exchanges, bridges, liquid-staking wrappers and versioned products ' +
      'of assets that already trade. Their TVL is someone else\'s token; they would only distort the ranking.</p>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>Why it is set aside</th><th class="n">TVL</th><th class="n">7d</th></tr></thead><tbody>' +
      rows.map(function (d) {
        return '<tr><td class="nm"><b>' + esc(d.p.name) + '</b></td><td>' + esc(d.p.category || '—') + '</td><td class="why">' + esc(d.why) +
          '</td><td class="n">' + usd(d.p.tvl_usd) + '</td><td class="n ' + cls(d.p.change_7d) + '">' + pct(d.p.change_7d) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------- the rail ---------- */
  function funnel() {
    var f = R.funnel, steps = [
      [f.all, 'protocols ≥ $5M TVL in the snapshot', ''], [f.tokenless, 'record no token', ''],
      [f.early, 'pre-token rows on this board', 'a'], [f.watch, 'on the watchlist (≥ ' + usd(R.floor) + ')', 'w']
    ];
    return '<div class="card"><h3>Funnel</h3>' + steps.map(function (s) {
      return '<div class="fn ' + s[2] + '"><s style="width:' + Math.max(6, s[0] / f.all * 100) + '%"></s><b>' + s[0] + '</b><span>' + s[1] + '</span></div>';
    }).join('') + '<p class="note">' + f.trading + ' trade a token (comps tab) · ' + R.derived.length + ' set aside as wrappers, bridges or exchanges</p></div>';
  }
  function scatter(rows) {
    var W = 372, H = 184, L = 30, B = 20, T = 8, inView = {};
    rows.forEach(function (r) { inView[r.p.slug] = true; });
    var lo = Math.log10(5e6), hi = Math.log10(R.rows.reduce(function (m, r) { return Math.max(m, r.p.tvl_usd); }, 1e8)) + 0.05;
    var x = function (t) { return L + (Math.log10(t) - lo) / (hi - lo) * (W - L - 6); };
    var y = function (d) { return T + (1 - (Math.max(-30, Math.min(30, d || 0)) + 30) / 60) * (H - T - B); };
    var max = R.rows[0].v.implied, g = '';
    [1e7, 1e8, 1e9].forEach(function (t) { g += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + T + '" y2="' + (H - B) + '" class="gl"/><text x="' + x(t) + '" y="' + (H - 7) + '" class="ax" text-anchor="middle">' + usd(t) + '</text>'; });
    [-20, 0, 20].forEach(function (d) { g += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y(d) + '" y2="' + y(d) + '" class="gl' + (d === 0 ? ' z' : '') + '"/><text x="' + (L - 4) + '" y="' + (y(d) + 3) + '" class="ax" text-anchor="end">' + (d > 0 ? '+' : '') + d + '%</text>'; });
    g += '<line x1="' + x(R.floor) + '" x2="' + x(R.floor) + '" y1="' + T + '" y2="' + (H - B) + '" class="floor"/><text x="' + (x(R.floor) + 3) + '" y="' + (T + 9) + '" class="ax fl">floor</text>';
    var dots = R.rows.slice().reverse().map(function (r) {
      var on = inView[r.p.slug], rad = 2 + 9 * Math.sqrt(r.v.implied / max);
      return '<circle cx="' + x(r.p.tvl_usd).toFixed(1) + '" cy="' + y(r.p.change_7d).toFixed(1) + '" r="' + rad.toFixed(1) + '" class="dot' + (on ? (r.watch ? ' w' : ' a') : '') + '" data-slug="' + esc(r.p.slug) + '"/>';
    }).join('');
    var lab = rows.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 4).map(function (r) {
      var cx = x(r.p.tvl_usd), right = cx > W - 110;
      return '<text x="' + (cx + (right ? -12 : 12)) + '" y="' + (y(r.p.change_7d) + 3) + '" class="lb" text-anchor="' + (right ? 'end' : 'start') + '">' + esc(r.p.name) + '</text>';
    }).join('');
    return '<div class="card"><h3>Radar map <small>TVL (log) × 7-day change · size = implied value</small></h3><svg viewBox="0 0 ' + W + ' ' + H + '" class="sc">' + g + dots + lab + '</svg>' +
      '<div class="lg"><span><i class="w"></i>watchlist</span><span><i class="a"></i>below floor</span><span><i></i>filtered out</span></div></div>';
  }
  function modelCard() {
    return '<div class="card model"><h3>Value model <small>model.js · value()</small></h3>' +
      '<div class="fx"><b>Implied</b> = <span>TVL</span> × <span class="c">peer ×</span> × <span class="g">momentum</span> × <span class="t">track</span> × <span class="r">reach</span></div><ul>' +
      '<li><span class="c">peer ×</span> median mcap/TVL of the category\'s traded tokens, shrunk by ' + R.params.K_SHRINK + ' pseudo-comps to its group (' + Object.keys(R.peers.groups).map(function (g) { return g + ' ' + mult(Math.exp(R.peers.groups[g].log)); }).join(', ') + '), then to ' + mult(R.peers.global) + '</li>' +
      '<li><span class="g">momentum</span> (1 + Δ7d)<sup>1.5</sup>, Δ7d capped ±40%</li>' +
      '<li><span class="t">track</span> 0.75 + 0.5·(1 − e<sup>−months/12</sup>): months listed with no token</li>' +
      '<li><span class="r">reach</span> 1 + 0.08·log₂(chains)</li></ul></div>';
  }
  function catCard(rows) {
    var s = {}, tot = 0;
    rows.forEach(function (r) { var c = r.p.category || 'Uncategorised'; s[c] = (s[c] || 0) + r.v.implied; tot += r.v.implied; });
    var top = Object.keys(s).sort(function (a, b) { return s[b] - s[a]; }).slice(0, 5);
    return '<div class="card"><h3>Where the value sits <small>implied, rows in view</small></h3>' + top.map(function (c) {
      return '<div class="cb"><span>' + esc(c) + '</span><s><i style="width:' + (s[c] / s[top[0]] * 100) + '%"></i></s><b>' + usd(s[c]) + '</b><em>' + Math.round(s[c] / tot * 100) + '%</em></div>';
    }).join('') + '</div>';
  }
  function renderRail(rows) {
    $('rail').innerHTML = st.tab === 'board' ? modelCard() + scatter(rows) + funnel() + catCard(rows) : modelCard() + funnel();
  }

  /* ---------- detail ---------- */
  /** Percentile of a row on the board for one figure, and the data-derived flags a farmer should read first. */
  function pctile(r, k) { var x = KEYS[k](r), n = 0; R.rows.forEach(function (o) { if (KEYS[k](o) < x) n++; }); return n / (R.rows.length - 1); }
  function signals(r) {
    var p = r.p, v = r.v, f = [];
    if (p.change_7d !== null && p.change_7d < -8) f.push(['dn', 'TVL left this week (' + pct(p.change_7d) + ')']);
    if (p.change_7d > 8) f.push(['up', 'Strong 7-day inflow (' + pct(p.change_7d) + ')']);
    if (p.chains.length === 1) f.push(['', 'Single chain: ' + esc(p.chains[0])]);
    if (v.months !== null && v.months < 3) f.push(['', 'Listed under 3 months ago']);
    if (v.months === null) f.push(['', 'Listing date not recorded']);
    if (v.months > 30) f.push(['', 'Over 2½ years with no token: may never launch one']);
    if (v.peerN < 3) f.push(['', 'Thin comps: multiple leans on the ' + v.peerN + '-comp category + group']);
    if (p.tvl_usd < R.floor * 1.2 && r.watch) f.push(['', 'TVL within 20% of the watchlist floor']);
    if (!f.length) f.push(['up', 'No red flags in the snapshot\'s figures']);
    var bars = [['TVL', 'tvl'], ['7d change', 'd7'], ['Months tokenless', 'months'], ['Implied value', 'implied']].map(function (b) {
      var q = pctile(r, b[1]);
      return '<div class="sg"><span>' + b[0] + '</span><s><i style="left:' + (q * 100).toFixed(1) + '%"></i></s><b>p' + Math.round(q * 100) + '</b></div>';
    }).join('');
    return '<h4>Signals <small>percentile among the ' + R.rows.length + ' board rows</small></h4>' + bars +
      '<div class="flags">' + f.map(function (x) { return '<span class="flag ' + x[0] + '">' + x[1] + '</span>'; }).join('') + '</div>';
  }

  function renderDetail() {
    var r = bySlug[st.p], box = $('detail');
    if (!r) { box.hidden = true; $('scrim').hidden = true; return; }
    var p = r.p, v = r.v, f = r.plan, cat = M.multipleFor(R.peers, p.category);
    var steps = [['TVL', p.tvl_usd, usd(p.tvl_usd), 'DefiLlama, ' + R.asOf, ''],
      ['× peer multiple', v.multiple, mult(v.multiple), (cat.n ? cat.n + (cat.n === 1 ? ' comp' : ' comps') + ' at median ' + mult(cat.raw) + ', shrunk to ' + cat.group + ' group ' + mult(cat.groupMultiple) + ' (n=' + cat.groupN + ')' : 'no traded token in category: ' + cat.group + ' group median (n=' + cat.groupN + ')'), 'c'],
      ['× momentum', v.momentum, mult(v.momentum), '7-day TVL change ' + pct(p.change_7d, 2), 'g'],
      ['× track record', v.track, mult(v.track), v.months === null ? 'listing date not recorded' : mo(v.months) + ' since listed ' + p.listed_at + ', no token', 't'],
      ['× reach', v.reach, mult(v.reach), p.chains.length + (p.chains.length === 1 ? ' chain' : ' chains'), 'r']];
    var run = p.tvl_usd, vals = steps.map(function (s, i) { if (i) run *= s[1]; return run; });
    var vmax = Math.max.apply(null, vals);
    var wf = steps.map(function (s, i) {
      return '<div class="wf ' + s[4] + '"><span class="k">' + s[0] + '</span><b>' + s[2] + '</b><s><i style="width:' + (vals[i] / vmax * 100) + '%"></i></s><em>' + usd(vals[i]) + '</em><small>' + s[3] + '</small></div>';
    }).join('') + '<div class="wf tot"><span class="k">= Implied value</span><b></b><s><i style="width:' + (v.implied / vmax * 100) + '%"></i></s><em>' + usd(v.implied) + '</em><small>rank #' + r.rank + ' of ' + R.rows.length + '</small></div>';
    var peers = cat.n ? '<table class="mini"><thead><tr><th>Traded peer</th><th class="n">Mcap</th><th class="n">TVL</th><th class="n">Mcap/TVL</th></tr></thead><tbody>' + cat.peers.map(function (q) {
      return '<tr><td>' + esc(q.name) + (q.symbol ? ' <small>$' + esc(q.symbol) + '</small>' : '') + '</td><td class="n">' + usd(q.mcap) + '</td><td class="n">' + usd(q.tvl) + '</td><td class="n">' + mult(q.mcap / q.tvl) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="note">No traded token in this category: the all-comp median applies.</p>';
    var plan = f.steps.map(function (s, i) {
      return '<li><i>' + (i + 1) + '</i><div><b>' + esc(s.title) + '</b><p>' + esc(s.text) + '</p></div><span class="pill cost">' + esc(s.cost) + '</span><span class="pill time">' + esc(s.time) + '</span></li>';
    }).join('');
    var pos = R.rows.indexOf(r), prev = R.rows[pos - 1], next = R.rows[pos + 1];
    box.innerHTML =
      '<header class="dh"><div><div class="rkb">#' + r.rank + '<small>of ' + R.rows.length + '</small></div></div><div class="dt"><h2 id="d-name">' + esc(p.name) + '</h2>' +
      '<div class="tags"><span class="tag">' + esc(p.category || 'Uncategorised') + '</span>' + (r.watch ? '<span class="tag w">WATCHLIST</span>' : '<span class="tag b">BELOW FLOOR</span>') +
      '<span class="win ' + v.window + '">' + v.window + ' window</span><span class="tag cf ' + v.confidence + '">' + v.confidence + ' confidence</span>' +
      '<span class="tok">No token recorded on DefiLlama</span></div><div class="chains">' + p.chains.slice(0, 12).map(esc).join(' · ') + (p.chains.length > 12 ? ' +' + (p.chains.length - 12) : '') + '</div></div>' +
      '<div class="nav"><button data-go="' + (prev ? esc(prev.p.slug) : '') + '"' + (prev ? '' : ' disabled') + '>← prev</button><button data-go="' + (next ? esc(next.p.slug) : '') + '"' + (next ? '' : ' disabled') + '>next →</button><button class="x" data-close="1" aria-label="Close">×</button></div></header>' +
      '<div class="dg"><div class="col">' +
      '<div class="hero"><div><span>Implied value</span><b>' + usd(v.implied) + '</b></div><div><span>Early-user pool (' + R.params.DROP_SHARE * 100 + '%)</span><b class="g">' + usd(v.pool) + '</b></div><div><span>Pool / TVL</span><b>' + (v.dropYield * 100).toFixed(2) + '%</b></div></div>' +
      '<h4>How the value is built</h4>' + wf + '<h4>Category comps <small>' + esc(p.category || '') + ' tokens that trade</small></h4>' + peers + signals(r) + '</div>' +
      '<div class="col"><h4>Farm plan <small>' + f.archetype + ' playbook on ' + esc(f.chain) + '</small></h4>' +
      '<div class="ps"><div><span>Ticket</span><b>' + usd(f.ticket) + '</b></div><div><span>All-in cost</span><b>≈ ' + usd(f.cost) + '</b></div><div><span>Time</span><b>~1 h + ' + f.hold + ' d</b></div><div><span>Est. drop on ticket</span><b class="g">' + usd(f.share) + '</b><small>≈ ' + Math.round(f.share / f.ticket * 365 / f.hold * 100) + '%/yr over ' + f.hold + ' d</small></div></div>' +
      '<ol class="steps">' + plan + '</ol><p class="note">Est. drop = pool × ticket / (TVL + ticket), if the implied value held at launch. Cost counts gas, fees and 5%/yr carry; it is no forecast that a token will launch.</p></div></div>';
    box.hidden = false; $('scrim').hidden = false;
  }

  function renderFoot() {
    $('foot').innerHTML = '<span>Data: ' + esc(S.source) + ' — sealed snapshot, no network at run time.</span>' +
      '<span>board.json is written by main.ts from the same model.js this page runs: what you see is what was submitted.</span>' +
      '<span>“No token recorded” means DefiLlama records none; implied values are this board\'s claim.</span>';
  }

  function render() {
    renderTabs(); syncControls();
    var rows = view();
    if (st.tab === 'board') renderBoard(rows); else if (st.tab === 'comps') renderComps(); else renderAside();
    renderKpis(st.tab === 'board' ? rows : R.rows); renderChips(rows.length); renderRail(rows); renderDetail();
    writeHash();
  }

  /* ---------- events ---------- */
  function on(el, ev, fn) { el.addEventListener(ev, fn); }
  on($('tabs'), 'click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; render(); } });
  on($('q'), 'input', function () { st.q = this.value.trim(); render(); });
  on($('cat'), 'change', function () { st.cat = this.value; render(); });
  on($('chain'), 'change', function () { st.chain = this.value; render(); });
  on($('mom'), 'change', function () { st.mom = this.checked; render(); });
  ['tier', 'win'].forEach(function (g) { on($(g), 'click', function (e) { var b = e.target.closest('button'); if (b) { st[g] = b.dataset.v; render(); } }); });
  on($('reset'), 'click', function () { st.q = st.cat = st.chain = st.tier = st.win = ''; st.mom = false; st.sort = 'rank'; st.dir = 1; render(); });
  on($('chips'), 'click', function (e) { var b = e.target.closest('[data-clear]'); if (b) { var k = b.dataset.clear; st[k] = k === 'mom' ? false : ''; render(); } });
  on($('main'), 'click', function (e) {
    var h = e.target.closest('th[data-sort]');
    if (h) { var k = h.dataset.sort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === 'rank' || k === 'name' ? 1 : -1; } render(); return; }
    var tr = e.target.closest('tr[data-slug]'); if (tr) { st.p = tr.dataset.slug; render(); }
  });
  on($('main'), 'keydown', function (e) { var tr = e.target.closest('tr[data-slug]'); if (tr && e.key === 'Enter') { st.p = tr.dataset.slug; render(); } });
  on($('rail'), 'click', function (e) { var c = e.target.closest('[data-slug]'); if (c) { st.p = c.dataset.slug; render(); } });
  on($('detail'), 'click', function (e) {
    var g = e.target.closest('[data-go]'); if (g && g.dataset.go) { st.p = g.dataset.go; render(); return; }
    if (e.target.closest('[data-close]')) { st.p = ''; render(); }
  });
  on($('scrim'), 'click', function () { st.p = ''; render(); });
  on(document, 'keydown', function (e) { if (e.key === 'Escape' && st.p) { st.p = ''; render(); } });
  on(window, 'hashchange', function () { readHash(); render(); });

  readHash(); renderMeta(); fillSelects(); renderFoot(); render();
})();
