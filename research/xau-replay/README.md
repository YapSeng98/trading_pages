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

The history starts in January 2010, but the weekly timeframe needs 60 finished candles before the engine can read it,
so nothing that uses it can trade before 2011-02-20. `report.js` scores every rule from that day (the first state with
a readable weekly trend) to the last state, so the per-year figures are divided by the years in which a trade was
possible (15.6) and all rules cover the same period. Until 2026-10-14 the page divided by 16.5 years counted from
2010-03-25, which made every per-year figure about 6% too small and labelled the results "2010-2026" above a yearly
list that starts in 2011. Each year's total is rounded so the column adds up to the overall total printed with it.

`track.js` (with `download_paxg.py`) compares the PAXG token, the page's first data source and now its fallback, with
spot. That comparison is why the page moved to spot candles.

## How the rule was chosen

- Looked at 2019-2023 and picked the rule: all five timeframes agree, stop 3 x the 1-hour ATR, target 3R (or a trailing stop).
- Checked it on 2024-2026.
- Only then downloaded 2010-2018 and ran the fixed rule on it once (scored from 2011-02-20, see above).

`report.js` prints the three periods separately. The rule is positive in each, but only just in 2011-2018; most of the
profit comes from 2022-2025, when gold trended. Read the numbers with that in mind.

## Robustness checks (2026-10-24)

`robust_check.js` (`MARKET=gold node robust_check.js 2010 2026`, `MARKET=btc ... 2017 2026`) asks whether the rule is
real or lucky. Gold, 2011-02 to 2026-10, 495 trades:

- Resampling whole years instead of single trades (trades inside a year move together): target 3R +0.18R a trade,
  range -0.00 to +0.35, positive in 97% of resamples; trailing stop +0.25R, +0.03 to +0.48, 99%.
- Stop and target grid (2-4 x ATR, 2R-5R): positive almost everywhere, no single sharp peak, so 3 x ATR / 3R was not
  tuned to a lucky spot. A closer target wins more often (1R: 51% of trades) but earns about nothing a trade.
- Entering late, with the stop set 3 x ATR from the later price: after the signal had run 1R, +0.17R a trade (254)
  against +0.18R on the signal; after 2R or 3R, about the same again. Bitcoin: +0.28R after 1R (153) against +0.13R.
  The page used to call a signal that had run 1R "too late"; it now says this and keeps the plan. `report.js` writes
  it as `rules.late1r` (both replay files).
- Longs and shorts: longs lost in 2011-2018 (-0.07R) and shorts in 2024-2026 (-0.53R, 12 trades). Neither side alone
  holds up in every period, so the rule keeps both. On Bitcoin shorts lost overall (-0.05R).
- 4-hour RSI stretched (<= 30 for a short, >= 70 for a long) at the signal: no worse on gold (+0.14R against +0.19R),
  better on Bitcoin. No reason to skip "oversold" shorts.
- Daily EMAs (20/50/200) stacked the trade's way at the signal: gold +0.25R against +0.05R when not, Bitcoin +0.24R
  against -0.07R, but in gold's untouched 2011-2018 no difference with the 3R target (+0.06 / +0.07), and the gap is
  within chance on each market (88-93% of resamples positive, 61% for Bitcoin's trailing stop). A hint, not a rule;
  not used.

## Chart patterns (2026-10-24)

`pattern_check.js` (`MARKET=gold node pattern_check.js 2010 2026 [--write]`) runs the page's own pattern finder
(`xPatterns` in the engine) at every candle close and scores each pattern on the close that completes it (a double top
or bottom, head and shoulders through its neckline; a triangle, wedge, channel, range or flag breaking out).
`--write` keeps the summary in the market's replay file as `patterns`; `report.js` / `report_btc.js` carry it over.

- On their own, traded the breakout way: gold 1-hour +0.01R (2,637), 4-hour −0.02R (487); Bitcoin 1-hour −0.09R
  (1,785), 4-hour −0.03R. With each pattern's own stop and target they win about 57-60% of the time and still average
  about 0R: the high win rate is paid for by losses bigger than the wins.
- With the big three trends they do better and against them worse, which is the trend doing the work, not the pattern.
- With the rule: signals where a finished daily / 4-hour / 1-hour pattern agrees did no better on gold (+0.20R
  against +0.21R with none); better on Bitcoin (+0.28R against +0.09R), so not consistent. A finished pattern pointing
  against the signal was rare and did worse (gold 16 trades −0.28R, Bitcoin 9 trades −0.58R): too few to make a rule.
  The page shows patterns in the answer as reference and adds a caution step in that last case.

## Short-term rules (2026-10-26)

`short_check.js` (`MARKET=gold node short_check.js 2010 2026 [--write]`; `SPREAD=<bp>` to try other costs) tests three
common intraday rules, parameters fixed before the first run, out by the end of the trading day, one at a time:

| Rule | Gold a trade | Bitcoin a trade |
|---|---|---|
| 15-minute turn with the 4-hour and 1-hour trend (stop 2 x 15M ATR, 2R) | −0.10R, every period negative | −0.10R, every period negative |
| Asian-range breakout with the 4-hour trend (stop at the range middle, 2R) | +0.01R | −0.06R |
| Yesterday's high / low broken with the daily and 4-hour trend (stop 1.5 x 1H ATR, 2R) | +0.04R, 2019-2023 −0.07R | +0.03R, 2021-2023 −0.06R |

With half the spread (0.5 bp on gold) the last two reach +0.04R and +0.06R and still lose in 2019-2023. None is a
reliable short-term signal; the pages show the third as a reference with its prices, never as a signal or an alert.

## Is it proven? (2026-10-26)

`proof_check.js` (`MARKET=gold node proof_check.js 2010 2026`) tries to knock the rule down. Random entries are traded
one at a time, like a person would; picking random moments independently over-counts long trends and flatters them.

| Test | Gold | Bitcoin |
|---|---|---|
| Average a trade (target 3R), t-test | +0.18R, p 0.03 | +0.13R, p 0.24 |
| Random entries, same stop / target / costs, one at a time | −0.04R; never beat the rule in 400 runs | +0.00R; beat it in 3.5% |
| Same entry times, side chosen by coin flip | beat the rule's side in 3% | beat it in 28% |
| Random moments inside the big-three trend | +0.09R; beat the rule in 1.3% | +0.11R; beat it in 28% |
| Deflated Sharpe ratio, ~50 variants tried | 76% (95% is the usual bar) | 49% |
| Probability of backtest overfitting (34 stop/target/trailing variants, CSCV by year) | 21%; all 34 variants positive | 33%; 31 of 34 positive |
| Trades a 95% proof would need at this average | 387 (have 495) | 696 (have 254) |
| Spread that halves the edge | about 8 bp | over 15 bp |
| Rule at 0.5% risk vs holding the market | 2.9%/yr, 19% drawdown vs 7.0%/yr, 45% | 2.1%/yr, 14% vs 36.7%/yr, 77% |
| Correlation of yearly R with how far the market moved | 0.48 | 0.77 |

Gold: every single test points the same way and the parameter choice is not a lucky peak, but after allowing for the
~50 variants looked at the confidence is about 76%, not 95%; the untouched 2011-2018 period alone was +0.07R (not
significant) and the best years are the trending ones. Real-looking, small, unproven beyond doubt. Bitcoin: not
proven; its side choice and its timing are no better than chance. Only live trades can settle it, slowly: at about
32 a year, a 95% live proof of +0.18R takes about twelve years, so the useful live check is the other way round
(stop trusting it if the paper record falls further than the replay's worst drawdown, 38R on gold).

## What the replay cannot tell you

- It enters within a minute of every signal for fifteen years and never closes early. A person will not.
- Slippage around data releases is only as bad as the 1-minute bars show.
- Spread (1.5 bp of price) and financing (7.5% a year on longs) are estimates; brokers differ.
- About fifty variants were looked at on 2019-2026 before the rule was fixed, so that period flatters it. The 2011-2018
  figure is the cleaner one.
