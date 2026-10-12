# XAU replay

The rules on `report.html` were chosen and checked by replaying the page's own engine over real spot gold history.
This folder holds the tools. The results the page shows are in `data/xau-backtest.json`.

## What it does

1. `download.py` pulls 1-minute spot XAU/USD bars (bid) from Dukascopy's chart feed, the same source the live page reads.
2. `gen_states.js` walks through history in 15-minute steps. At each step it hands `assets/xau-engine.js` only the candles
   that had closed by then, cut the way the page cuts them (broker days, weekend removed), and stores what the engine said.
3. `sim.js` turns those states into trades on the 1-minute bars: entry one minute after the signal, spread and overnight
   financing charged, the stop wins when stop and target fall in the same minute, one position at a time.
4. `report.js` scores the page's rule and the alternatives, and writes `data/xau-backtest.json`.

The page and the replay run the same files (`assets/xau-engine.js`, `assets/xau-plan.js`), so a change to either one
changes both. `assets/xau-feed.js` cuts candles exactly like `lib.js` does here.

## Run it

```sh
cd research/xau-replay
python3 download.py BID 2010          # about 15 minutes, 110 MB into data/ (not in git)
node --max-old-space-size=8000 gen_states.js 2010 2026     # about 7 minutes
node --max-old-space-size=8000 report.js 2010 2026         # prints the tables
node --max-old-space-size=8000 report.js 2010 2026 full --write    # also rewrites data/xau-backtest.json
```

Set `XAU_REPLAY_DATA` to keep the history somewhere else. Node 18 or later, Python 3.9 or later, no packages.

`track.js` (with `download_paxg.py`) compares the PAXG token, the page's first data source and now its fallback, with
spot. That comparison is why the page moved to spot candles.

## How the rule was chosen

- Looked at 2019-2023 and picked the rule: all five timeframes agree, stop 3 x the 1-hour ATR, target 3R (or a trailing stop).
- Checked it on 2024-2026.
- Only then downloaded 2010-2018 and ran the fixed rule on it once.

`report.js` prints the three periods separately. The rule is positive in each, but only just in 2010-2018; most of the
profit comes from 2022-2025, when gold trended. Read the numbers with that in mind.

## What the replay cannot tell you

- It enters within a minute of every signal for sixteen years and never closes early. A person will not.
- Slippage around data releases is only as bad as the 1-minute bars show.
- Spread (1.5 bp of price) and financing (7.5% a year on longs) are estimates; brokers differ.
- About fifty variants were looked at on 2019-2026 before the rule was fixed, so that period flatters it. The 2010-2018
  figure is the cleaner one.
