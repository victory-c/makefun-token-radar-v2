# makefun-token-radar-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/victory-c/makefun-token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/victory-c/makefun-token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar v2 is a pre-token launch radar built on DefiLlama's sealed snapshot. It ranks 198 protocols with no token recorded, all 40 watchlist protocols plus 158 below the floor. Each one gets an implied value worked out from the snapshot alone:

    implied = TVL × peer multiple(category) × (1 + Δ7d)^1.5 × track(months tokenless) × reach(chains)

The peer multiple is the median market cap / TVL of the same category's traded tokens. It is shrunk toward the category's playbook group, and that group is shrunk toward the median across all comps. Tokens that already trade are never ranked. They have their own tab as the comps that price the board, and wrappers, bridges and exchanges are set aside with the reason given. Every row has a farm plan of six steps, and each step lists its dollar cost and how long it takes.

One file, `dashboard/model.js`, does all of this. `main.ts` loads it to write `board.json`, and the page runs the same file in the browser, so the screenshots and the board can't drift apart. The page has a sortable, filterable board (search, category, chain, watchlist tier, launch window, 7-day inflow), a radar map, a funnel and a value-model card. Its detail view shows how the value is built step by step, the category comps, percentile signals, flags and the costed farm plan. All view state lives in the URL hash.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# open out/dashboard/index.html; screenshots: node tools/shoot.mjs out /tmp/shots && python3 tools/pack.py /tmp/shots screenshots
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dsps50bd&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
