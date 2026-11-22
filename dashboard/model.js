/* Token Radar v2 — the value model and farm planner.
 * One file, two readers: main.ts loads it with require() to write board.json, and the page loads it
 * as a classic <script> and recomputes the very same board from the raw snapshot in ../data.js.
 * Nothing here names a protocol: every number below comes from the snapshot's own fields.
 *
 *   implied value = TVL × peer multiple(category) × momentum(7d) × track record(months tokenless) × reach(chains)
 *
 * peer multiple: the median market-cap / TVL of protocols in the same category whose token already
 *                trades, shrunk by K pseudo-comps toward its playbook group's median (vault, lend, trade, rwa,
 *                use), itself shrunk toward the all-comp median — thin categories lean on their neighbours.
 * momentum:      (1 + Δ7d)^1.5, Δ7d clamped to ±40 % — a week of inflow is priced, a spike is not.
 * track record:  0.75 + 0.5·(1 − e^(−months/12)) — a protocol that has held TVL for longer with no token is
 *                a proven product with a longer points season behind it (0.75 new … 1.25 asymptote).
 * reach:         1 + 0.08·log2(chains) — more deployments, more users who can be dropped to.
 */
(function (root) {
  'use strict';

  var K_SHRINK = 3;            // pseudo-comps pulling a category's multiple toward the global median
  var MULT_MIN = 0.02, MULT_MAX = 25;
  var DROP_SHARE = 0.075;      // share of the implied FDV assumed to go to early users (stated, not observed)
  var EXCHANGES = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
  var DERIVED_CATS = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
  var DAY = 86400000;

  // Gas per transaction in USD and the token that pays it, by chain (a planning figure, Nov 2026).
  var GAS = {
    Ethereum: [3, 'ETH'], Bitcoin: [2.5, 'BTC'], Solana: [0.01, 'SOL'], Tron: [1, 'TRX'], BSC: [0.08, 'BNB'],
    Arbitrum: [0.05, 'ETH'], Base: [0.03, 'ETH'], Optimism: [0.04, 'ETH'], Polygon: [0.02, 'POL'],
    Avalanche: [0.1, 'AVAX'], Sui: [0.02, 'SUI'], Aptos: [0.01, 'APT'], Hyperliquid: [0.02, 'HYPE'],
    'Hyperliquid L1': [0.02, 'HYPE'], Sonic: [0.02, 'S'], Berachain: [0.03, 'BERA'], Plasma: [0.02, 'XPL']
  };

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function median(xs) {
    if (!xs.length) return NaN;
    var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Where a protocol sits: 'trading' (a token is recorded), 'derived' (a wrapper, exchange or bridge), or 'early'. */
  function classify(p) {
    if (p.gecko_id !== null || p.symbol !== null) return { cls: 'trading', why: 'token recorded' + (p.symbol ? ' ($' + p.symbol + ')' : '') };
    if (DERIVED_CATS.indexOf(p.category) >= 0) return { cls: 'derived', why: p.category + ' — product of a traded asset' };
    if (/\s(v\d+(\.\d+)?|\d\.\d)$/i.test(p.name)) return { cls: 'derived', why: 'version of an existing protocol' };
    if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return { cls: 'derived', why: 'wrapped or staked product' };
    if (EXCHANGES.test(p.name)) return { cls: 'derived', why: 'exchange product' };
    return { cls: 'early', why: 'no token recorded' };
  }

  /** Category multiples from protocols whose token trades: median mcap/TVL, shrunk toward the median of the
   *  category's playbook group (vault, lend, trade, rwa, use), which is itself shrunk toward the all-comp median. */
  function peerMultiples(protocols) {
    var comps = protocols.filter(function (p) { return p.mcap_usd > 0 && p.tvl_usd > 0; });
    var lr = function (p) { return Math.log(clamp(p.mcap_usd / p.tvl_usd, MULT_MIN, MULT_MAX)); };
    var g = median(comps.map(lr)), byCat = {}, byGrp = {};
    comps.forEach(function (p) {
      var c = p.category || 'Uncategorised', a = archetype(c);
      (byCat[c] = byCat[c] || []).push(p);
      (byGrp[a] = byGrp[a] || []).push(lr(p));
    });
    var groups = {};
    Object.keys(ARCH).concat('use').forEach(function (a) {
      var xs = byGrp[a] || [], m = xs.length;
      groups[a] = { n: m, log: m ? (m * median(xs) + K_SHRINK * g) / (m + K_SHRINK) : g };
    });
    var cats = {};
    Object.keys(byCat).forEach(function (c) {
      var logs = byCat[c].map(lr), n = logs.length, med = median(logs), grp = groups[archetype(c)];
      cats[c] = {
        n: n, raw: Math.exp(med), group: archetype(c), groupN: grp.n, groupMultiple: Math.exp(grp.log),
        multiple: Math.exp((n * med + K_SHRINK * grp.log) / (n + K_SHRINK)),
        peers: byCat[c].sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 4)
          .map(function (p) { return { name: p.name, symbol: p.symbol, mcap: p.mcap_usd, tvl: p.tvl_usd }; })
      };
    });
    return { global: Math.exp(g), n: comps.length, cats: cats, groups: groups };
  }

  /** The multiple for any category, including one with no traded token: its group's. */
  function multipleFor(peers, category) {
    var c = peers.cats[category || 'Uncategorised'];
    if (c) return c;
    var a = archetype(category || ''), grp = peers.groups[a];
    return { n: 0, raw: null, group: a, groupN: grp.n, groupMultiple: Math.exp(grp.log), multiple: Math.exp(grp.log), peers: [] };
  }

  function monthsBetween(from, asOf) {
    if (!from) return null;
    return Math.max(0, (Date.parse(asOf + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY / 30.44);
  }

  /** The four factors and the value they multiply to, with every intermediate kept for the page to show. */
  function value(p, peers, asOf) {
    var cat = multipleFor(peers, p.category);
    var multiple = cat.multiple;
    var d7 = p.change_7d === null ? 0 : clamp(p.change_7d, -40, 40);
    var momentum = Math.pow(1 + d7 / 100, 1.5);
    var months = monthsBetween(p.listed_at, asOf);
    var track = months === null ? 0.85 : 0.75 + 0.5 * (1 - Math.exp(-months / 12));
    var reach = 1 + 0.08 * Math.log2(Math.max(1, p.chains.length));
    var implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * track * reach));
    var pool = implied * DROP_SHARE;
    return {
      multiple: multiple, peerN: cat.n, groupN: cat.groupN, momentum: momentum, months: months, track: track, reach: reach,
      implied: implied, pool: Math.round(pool), dropYield: pool / p.tvl_usd,
      confidence: cat.n >= 5 ? 'High' : cat.n + cat.groupN >= 10 ? 'Medium' : 'Low',
      window: months === null ? 'Unknown' : months < 6 ? 'Fresh' : months < 18 ? 'Prime' : 'Late'
    };
  }

  var ARCH = {
    vault: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Basis Trading', 'Stablecoin Wrapper',
      'Liquidity Manager', 'Leveraged Farming', 'Farm', 'Staking Pool', 'Governance Incentives', 'Restaking', 'CeDeFi',
      'Anchor BTC', 'Decentralized BTC', 'Indexes', 'Treasury Manager', 'Liquidity Automation'],
    lend: ['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Collateral Management', 'Uncollateralized Lending', 'NFT Lending', 'Dual-Token Stablecoin'],
    predict: ['Prediction Market'],
    pay: ['Payments', 'Crypto Card Issuer'],
    trade: ['Dexs', 'Derivatives', 'Options', 'Launchpad', 'Synthetics', 'Options Vault', 'DEX Aggregator',
      'Perps', 'OTC Marketplace', 'Interest Rate Derivatives'],
    rwa: ['RWA', 'Insurance', 'RWA Lending', 'Stablecoin']
  };
  function archetype(cat) {
    for (var k in ARCH) if (ARCH[k].indexOf(cat) >= 0) return k;
    return 'use';
  }
  function niceTicket(tvl) {
    var t = clamp(tvl * 1e-5, 250, 10000), mag = Math.pow(10, Math.floor(Math.log10(t)));
    return Math.round(t / mag * 2) / 2 * mag;
  }
  function usd(n) { return usd1(n).replace(/\.0(?=[KMB])/, ''); }
  function usd1(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
    return '$' + (a < 1 && a > 0 ? n.toFixed(2) : Math.round(n));
  }

  /** A farm plan: concrete steps, each with its cost in dollars and the time it takes. */
  function plan(p, v) {
    // Ethereum when the protocol runs there (usually its deepest market), else its first listed chain.
    var chain = p.chains.indexOf('Ethereum') >= 0 ? 'Ethereum' : p.chains[0] || 'Ethereum', g = GAS[chain] || [0.1, 'native gas token'];
    var gas = g[0], gasTok = g[1], ticket = niceTicket(p.tvl_usd), hold = v.window === 'Fresh' ? 120 : 90;
    var carry = ticket * 0.05 * hold / 365;            // 5 % a year forgone versus a plain stablecoin yield
    var share = v.pool * ticket / (p.tvl_usd + ticket);
    var exitTvl = usd(p.tvl_usd * 0.7), a = archetype(p.category), N = p.name;
    var s = [];
    function step(title, text, cost, time) { s.push({ title: title, text: text, cost: cost, time: time }); }
    var asset = chain === 'Bitcoin' ? 'BTC' : 'USDC';
    step('Fund', 'Bridge or withdraw ' + usd(ticket) + ' in ' + asset + ' plus ' + usd(Math.max(1, gas * 12)) + ' of ' + gasTok + ' for gas to a fresh wallet on ' + chain + ' that you use only for ' + N + '.',
      usd(Math.max(0.5, gas * 2 + 1)), '15 min');
    if (a === 'vault') {
      step('Deposit', 'Open ' + N + '\'s app, pick its largest USDC or ETH vault on ' + chain + ' (check the curator and the withdrawal queue first), approve and deposit the full ' + usd(ticket) + '.', usd(gas * 2), '10 min');
      step('Hold', 'Leave the position untouched for ' + hold + ' days: points programs weight balance × time, and early withdrawals usually reset multipliers.', usd(carry) + ' carry', hold + ' days');
      step('Stack', 'If the vault issues a receipt token, post it as collateral or LP it on a partner listed in the app to earn a second points stream, keeping loan-to-value under 50 %.', usd(gas * 3), '20 min');
    } else if (a === 'lend') {
      step('Supply', 'Supply ' + usd(ticket) + ' of USDC or ETH to ' + N + '\'s main market on ' + chain + '; both suppliers and borrowers usually earn points.', usd(gas * 2), '10 min');
      step('Borrow', 'Borrow ' + usd(ticket * 0.3) + ' (30 % LTV, far from liquidation) of a different asset and re-supply it, so the account shows both sides of the book.', usd(gas * 3), '15 min');
      step('Hold', 'Keep both legs open ' + hold + ' days and re-check the health factor weekly; repay if it drops below 1.6.', usd(carry) + ' carry', hold + ' days');
    } else if (a === 'trade') {
      step('Provide', 'Add ' + usd(ticket * 0.6) + ' of liquidity to ' + N + '\'s deepest stable or major pair on ' + chain + ' in a wide range, so it earns fees without constant rebalancing.', usd(gas * 2), '15 min');
      step('Trade', 'Route ' + usd(ticket * 2) + ' of volume a week through ' + N + ' with the other ' + usd(ticket * 0.4) + ': swaps or small hedged positions, never size you cannot afford to lose to fees.', usd(ticket * 2 * 0.0015 * 4 + gas * 8) + '/month', '10 min/week');
      step('Hold', 'Keep the LP live ' + hold + ' days; active-week streaks and LP-days are what most volume programs count.', usd(carry) + ' carry', hold + ' days');
    } else if (a === 'predict') {
      step('Position', 'Split ' + usd(ticket * 0.5) + ' across 4–6 liquid markets on ' + N + ' that resolve within 60 days; prefer prices between 20 and 80 ¢ so the stake is not dead money.', usd(gas * 6 + ticket * 0.5 * 0.01), '30 min');
      step('Make', 'Rest limit orders with another ' + usd(ticket * 0.3) + ' inside the spread of two deep markets: liquidity-reward and volume programs both count resting size.', usd(gas * 4), '15 min/week');
      step('Roll', 'As markets resolve, roll the proceeds into new ones for ' + hold + ' days so the account stays active every week.', usd(carry) + ' carry', hold + ' days');
    } else if (a === 'pay') {
      step('Open', 'Open ' + N + '\'s wallet or account on ' + chain + ' and move ' + usd(ticket * 0.5) + ' into it; keep the rest as reserve.', usd(gas * 2), '20 min');
      step('Spend', 'Route 4–8 real payments a month (' + usd(Math.max(20, ticket * 0.02)) + ' each) through it: usage, not balance, is what payment networks reward.', usd(gas * 6) + '/month', '10 min/week');
      step('Hold', 'Keep the account funded and active ' + hold + ' days.', usd(carry * 0.5) + ' carry', hold + ' days');
    } else if (a === 'rwa') {
      step('Onboard', 'Complete ' + N + '\'s onboarding (KYC or accredited check where it applies); without it the mint step is closed to you.', '$0', '1–3 days');
      step('Mint', 'Mint or buy ' + usd(ticket) + ' of its yield-bearing asset on ' + chain + ' and keep it in the same wallet.', usd(gas * 2 + ticket * 0.001), '20 min');
      step('Hold', 'Hold ' + hold + ' days: the asset pays its own yield, so the only cost is liquidity — redemptions can take 1–5 business days.', usd(carry * 0.2) + ' carry', hold + ' days');
    } else {
      step('Use', 'Use ' + N + ' for its core action on ' + chain + ' with ' + usd(ticket) + ' — deposit, stake or bridge through its own interface, not an aggregator, so the wallet is credited.', usd(gas * 3), '20 min');
      step('Repeat', 'Repeat one small action each week (' + usd(Math.max(25, ticket * 0.05)) + ') across 8 weeks: activity streaks often score apart from balance.', usd(gas * 8), '5 min/week');
      step('Hold', 'Keep the main balance in place ' + hold + ' days.', usd(carry) + ' carry', hold + ' days');
    }
    step('Track', 'Bookmark ' + N + '\'s points or rewards page and log the balance every Monday; if no points page exists, keep a dated screenshot of the position as proof of activity.', '$0', '5 min/week');
    step('Exit rule', 'Withdraw if TVL falls under ' + exitTvl + ' (−30 % from ' + usd(p.tvl_usd) + '), the 7-day change prints below −20 %, or a token launches and the claim is done.', usd(gas * 2), '10 min');
    var cost = 0;
    s.forEach(function (x) { var m = /^\$([\d.]+)([KMB]?)/.exec(x.cost); if (m) cost += +m[1] * ({ '': 1, K: 1e3, M: 1e6, B: 1e9 })[m[2]]; });
    return { steps: s, ticket: ticket, hold: hold, cost: cost, share: share, archetype: a, chain: chain };
  }

  function stepText(x) { return x.title + ': ' + x.text + ' Cost ≈ ' + x.cost + '; time ≈ ' + x.time + '.'; }

  /** Everything the board and the page need, from the snapshot alone. */
  function buildRadar(snap) {
    var peers = peerMultiples(snap.protocols), watch = {};
    snap.watchlist.forEach(function (s) { watch[s] = true; });
    var early = [], trading = [], derived = [];
    snap.protocols.forEach(function (p) {
      var c = classify(p);
      if (c.cls === 'trading') trading.push(p);
      else if (c.cls === 'derived' && !watch[p.slug]) derived.push({ p: p, why: c.why });
      else early.push(p);
    });
    var rows = early.map(function (p) {
      var v = value(p, peers, snap.as_of), f = plan(p, v);
      return { p: p, v: v, plan: f, watch: !!watch[p.slug] };
    });
    rows.sort(function (a, b) { return b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return {
      asOf: snap.as_of, source: snap.source, floor: snap.floor_usd, peers: peers, rows: rows,
      trading: trading, derived: derived,
      funnel: { all: snap.protocols.length, tokenless: early.length + derived.length, early: early.length, watch: snap.watchlist.length, trading: trading.length },
      params: { K_SHRINK: K_SHRINK, DROP_SHARE: DROP_SHARE }
    };
  }

  /** The board rows the gate reads. */
  function boardRows(radar) {
    return radar.rows.map(function (r) {
      return {
        slug: r.p.slug, name: r.p.name, rank: r.rank, implied_value_usd: r.v.implied, category: r.p.category,
        tvl_usd: r.p.tvl_usd, change_7d: r.p.change_7d, months_tokenless: r.v.months === null ? null : +r.v.months.toFixed(1),
        peer_multiple: +r.v.multiple.toFixed(4), on_watchlist: r.watch, token_status: 'no token recorded',
        farm_steps: r.plan.steps.map(stepText)
      };
    });
  }

  var api = { multipleFor: multipleFor, buildRadar: buildRadar, boardRows: boardRows, classify: classify, peerMultiples: peerMultiples, value: value, plan: plan, stepText: stepText, usd: usd };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RadarModel = api;
})(this);
