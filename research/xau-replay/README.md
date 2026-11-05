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

## The rule on markets it was never chosen on (2026-10-26)

Written down before the run (`cross_check.js` header): seven coins on Binance (ETH, BNB, LTC, XRP, ADA, DOGE, SOL),
15-minute bars (`download_binance15.py`; 15-minute fills flattered gold and Bitcoin by 0.01-0.03R), Bitcoin's CFD
costs, the rule unchanged; success = pooled average above 0 with p < 0.05 and at least 5 of 7 positive.

| | n | Target 3R a trade | Trailing |
|---|---|---|---|
| ETH | 336 | +0.11R | +0.15R |
| BNB | 297 | −0.00R | +0.17R |
| LTC | 294 | −0.16R | −0.19R |
| XRP | 134 | −0.25R | −0.10R |
| ADA | 107 | +0.05R | +0.05R |
| DOGE | 26 | −0.09R | +0.29R |
| SOL | 169 | +0.19R | +0.23R |
| **Pooled** | 1,363 | **−0.005R, p 0.91** | +0.06R, p 0.27 |

NOT confirmed: 3 of 7 positive, pooled no better than chance. On crypto the rule has no general edge, and Bitcoin's
own +0.13R is most likely luck. Gold could not be checked this way: the only free intraday history for silver,
currencies, indices and oil is Dukascopy's chart feed, which turns away automated downloads.

## Indicators as confirmation (2026-10-27)

`indicator_check.js`, written down before the run: the rule's own trades split by eight standard indicators at the
signal (EMA 20/50/200 stacked, daily and 4-hour; RSI(14) on the trade's side of 50, 1-hour and 4-hour; MACD(12,26,9)
histogram the trade's way, 4-hour and daily; ADX(14) at 25 or more, daily and 4-hour). An indicator confirms only if
its confirmed trades beat the rest in all three gold periods, on Bitcoin and on the seven coins, with 40% or more of
trades confirmed and gold's difference at p < 0.05 / 8.

None passed. Closest: the 1-hour RSI on the wrong side of 50 (one signal in ten) did worse in most places but not in
gold's 2019-2023, p 0.03; the daily EMA stack and daily MACD helped on gold and Bitcoin and hurt on the coins. Adding
them would raise the hit rate on paper and lower it in use. The page shows RSI and the EMA stack in 各周期明细 as
information only.

## Can the signal come sooner? (2026-11-05)

Owner: "the market will not wait". `SPEED-PLAN.md` fixed 13 faster versions and five pass marks before the run;
`speed_states.js` adds each timeframe's turning prices to the replay, `speed_check.js [--write]` keeps the numbers in
`speed-result.json` (results and, under `exploratory`, what was looked at afterwards). It reproduces the rule first:
495 trades, +0.182R, 38R. **None of the 13 passed. The rule did not change.**

Being late costs little. The same signals entered later, stop 3 x ATR from the later price:

| Minutes after the close | 2 | 5 | 15 | 30 | 60 | 120 | 240 | 480 |
|---|---|---|---|---|---|---|---|---|
| Average a trade | +0.18R | +0.18R | +0.17R | +0.17R | +0.13R | +0.20R | +0.14R | +0.12R |
| 2011-2018 only | +0.07R | +0.03R | +0.04R | +0.06R | −0.02R | +0.00R | −0.04R | −0.01R |

All within chance of each other, though from an hour on the untouched 2011-2018 period is about zero.

The faster versions, target 3R:

| Version | Trades | Average | Worst fall | What it gained |
|---|---|---|---|---|
| The rule | 495 | +0.182R | 38R | |
| A1 15M before its close | 535 | +0.137R | 45.8R | about 8 min |
| A2 + 1H | 563 | +0.120R | 46.5R | about 9 min |
| A3 + 4H | 629 | +0.074R | 61.3R | about 9 min |
| A4 all five | 689 | +0.090R | 42.5R | about 10 min |
| A5 resting stop order at the level | 535 | +0.166R | 38.8R | about 17 min |
| B1 no 15M | 356 | +0.169R | 33.3R | not earlier: fewer signals |
| B2 no 1H | 567 | +0.072R | 68.6R | |
| B3 no weekly | 709 | +0.141R | 40.8R | big moves, below |
| B4 no weekly, no daily | 1,037 | +0.037R | 41.1R | big moves; 2019-2023 negative |
| C1 / C2 2-bar swings | 557 / 579 | +0.099R / +0.093R | 59.6R / 48.6R | 2011-2018 negative |
| C3 / C4 3-bar swings | 547 / 546 | +0.143R / +0.093R | 51.2R / 55.9R | 2011-2018 negative |

Waiting for the close saves money: price moves about +0.1R further while you wait, but entering before the close takes
the false breaks as well, which cost more than that. Stopping the same re-fire within a stretch (`noRefire`) did not
rescue it (A1 +0.155R, A2 +0.133R, 2011-2018 about zero).

A5 came closest and failed only "not worse" (raw 0.108 against the 0.10 / 13 needed). It saves about 17 minutes, and
the level moves about 5 times a day while waiting, so someone has to keep moving the order. With 3 bp of slippage it
falls to +0.133R.

Where the time really goes (descriptive): 64% of signals are settled by a 15-minute close (median wait 8 minutes from
first crossing the level), 22% by the 1-hour (35), 12% by the 4-hour (154), the rest by the daily (435) and weekly.
On big moves, 48 legs of at least 5 daily ATR on daily closes, the rule has a signal in 35, the first a median 62 days
in with 57% of the leg gone. That lag is the weekly trend, not the candle close: only B3 and B4 change it (B3: 46 legs,
20 days, 42%; B4: all 48, 4 days, 15%).

B3 is therefore the one worth another look, but it failed as written: "faster" (by the plan's 48-hour measure) and "not
worse" (a 40% chance of being over 0.05R below). Exploratory only: with the trailing exit it made 9.7R a year with a
26.1R worst fall against the rule's 6.9R and 31.8R, and more R than the rule in 69% of resampled histories on 3R; each
year's results are in `exploratory.b3`. All of gold's history has now been looked at, so only a forward record can test it.

What did change on the site, none of it the rule: the early word now covers any timeframe still needed, not only the
small two (`XauPlan.soonNeed`); the answer no longer waits for slow price quotes, which held it until they replied (32 s
to 1.9 s with the quotes slowed to 30 s); the home tile and live bar state the age of the verdict in `data/xau-state.json`
(median 4.5 hours between runs, on 2026-11-05). `strategy.html` quotes `speed-result.json`.

**Bitcoin** (`MARKET=btc`, `speed-result-btc.json`, reproduces 254 trades, +0.134R, 28.2R first). Information only, as
written down before the run. Being late shows no pattern: +0.11R to +0.18R from 2 minutes to 8 hours. One version passed:
A4, all five timeframes before their close, 358 trades, +0.204R, worst fall 23.4R. Nothing changes on the page, because
the same version was fourth from the bottom of the 13 on gold (+0.09R), and one pass in 13 on a market whose rule is
itself unproven may be chance. No weekly failed the marks again (+0.202R, 441 trades, 15.4R, but raw 0.045 against the
0.10 / 13 for "not worse", and "faster" by the 48-hour measure); on big moves it has 97% of legs at 37% used against the
rule's 65% and 59%, and with the trailing exit 19.6R a year against 6.1R.

**Forex** (`../forex/fx_speed.js`, `../forex/speed-result.json`, reproduces 688 trades, −0.071R first). Every version
loses and none passes: no weekly −0.10R, no weekly or daily −0.12R, the 4-hour before its close −0.03R, late by 1, 2, 4
and 8 hours −0.08R, −0.03R, −0.02R and −0.10R, with 1 to 4 pairs of 11 positive. So no weekly helped on gold and Bitcoin
and hurt on forex, where the rule has no edge to begin with.

Same delivery fixes on all three: `forex.html` looks again a minute after a candle published late or a pair that failed
(it waited for the next quarter hour) and gives the early word from each 15-minute close, the soonest it can, since it
has no live forex price; candle requests for Bitcoin and for gold's backup have a 20-second limit, so a stall ends in the
retry banner; the home page's Bitcoin tile states its verdict's age.

## What the replay cannot tell you

- It enters within a minute of every signal for fifteen years and never closes early. A person will not.
- Slippage around data releases is only as bad as the 1-minute bars show.
- Spread (1.5 bp of price) and financing (7.5% a year on longs) are estimates; brokers differ.
- About fifty variants were looked at on 2019-2026 before the rule was fixed, so that period flatters it. The 2011-2018
  figure is the cleaner one.
