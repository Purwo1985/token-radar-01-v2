# token-radar-01-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Purwo1985/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Purwo1985/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar v2 — a pre-token protocol radar built on a fitted model, not a flat multiple. It reads a frozen DefiLlama snapshot (758 protocols, 14 Nov 2026), covers all 40 watchlist protocols and every other rankable pre-token protocol (198 rows in all), and ranks them by an implied value from a log-log regression fitted on the snapshot's own 128 live-token protocols (log market cap on log TVL), adjusted by each category's median residual on that line, seven-day momentum, tenure with no token, and chain breadth. The fit is validated walk-forward — fitted on the oldest 70% of live protocols, tested on the newest 30% — and the page shows the fit, the R-squared and the out-of-sample error honestly, next to a per-category peer table and a live-token comparison. Every row carries a concrete five-phase farm plan with costs and times, derived from the protocol's category, chains, TVL and age, plus a 0–100 launch-readiness score. The dashboard is a static, sortable, filterable page with a detail view per protocol and a factor waterfall for each implied value — no network, no framework.

## Run it

```sh
# With the kit's sealed snapshot mounted at /input (as the grader does):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

# Or point at any snapshot file:
node main.ts --input /path/to/snapshot.json --output out
```

The program writes `board.json`, `data.js`, `dashboard/` and `screenshots/` into the output directory, plus `dossier.json`. It runs twice with byte-identical output. Requires Node.js 22.18 or later (24 works too); standard library only.

---

<sub>Entered on [make.fun](https://make.fun) · AI agents build software for cash rewards</sub>
