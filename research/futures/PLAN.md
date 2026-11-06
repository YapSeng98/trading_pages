# Does the gold rule work on other futures markets?

Written on 2026-11-07 BEFORE any of the tests below was run. The data was downloaded and screened for quality first
(counts of bad bars only; no rule was run on it).

## Why

All of gold's history has now been used to choose and check the rule, so another test on gold mostly fits noise. The
rule failed on forex (research/forex) and on 7 other coins (research/xau-replay/cross_check.js). Futures (metals,
oil, stock indices, government bonds) are where the published trend-following evidence is strongest, and the rule
has never been run on them. Two questions:

1. Does the rule, unchanged, make money on these markets in 2024-2026? If it does, gold's result looks more like a
   general trend effect and less like luck. If it does not, that counts against gold's result too.
2. Does the version without the weekly trend (research/xau-replay/SPEED-PLAN.md, B3) do better or worse than the rule
   on markets it was never looked at on? On gold and Bitcoin it looked better with the trailing exit and failed the
   pass marks; on forex it was worse.

## Data

Yahoo Finance chart API (fetch_fut.py), the "=F" front contract: hourly bars for 730 days (from 2024-06-16) and daily
bars from 2016-11 placed in front so the weekly and daily trends have their history, as in research/forex. Candles
cut in broker time (17:00 New York, which is also the CME day), weekends removed. Bars not on the hour are dropped.

Screen, decided from data quality alone before any test:

- Out: natural gas, heating oil, gasoline, corn, soybeans, wheat. In each, Yahoo's hourly series jumps to another
  contract and straight back, hour after hour, on 4 to 42 different days (corn: 80 such spikes).
- Out: platinum and palladium. 68% and 78% of their daily bars before mid-2024 are a single price (high = low).
- In, with a note: silver. 19% of its daily bars before mid-2024 are a single price; the closes are right, the highs
  and lows of those days are understated.
- In: silver, copper (metals); WTI, Brent (energy); S&P 500, Nasdaq 100, Dow, Russell 2000, Nikkei (stock indices);
  5-, 10- and 30-year US Treasuries (bonds). 12 markets in 4 groups.
- Yardstick, not counted: gold futures (GC), run the same way, next to spot gold from Dukascopy over the same dates
  and the rule's real five-timeframe result, to show how much the futures data and the four-timeframe version change.

## Contract rolls

Yahoo does not adjust the "=F" series when the front contract changes, and expired contracts cannot be downloaded,
so the roll dates are not known. Each roll shows as a jump (S&P: about 1% each quarter, near 1R for this rule's
stop). Two versions of every market, both run:

- raw: the series as Yahoo gives it.
- adjusted: every jump from one bar's close to the next bar's open larger than 4 times that series' median bar
  range (high - low) is taken out by moving all earlier prices by the jump (hourly and daily series alike). This
  removes rolls and also some real weekend gaps.

## The rule

Unchanged engine and plan code (assets/xau-engine.js). No 15-minute history on Yahoo, so the four-timeframe version
used on forex: weekly, daily, 4-hour and 1-hour all agree (onset), entered at the next hourly open; stop 3 x the 1-hour
ATR; target 3R; one position at a time per market. Exits checked on hourly bars, stop first when one bar touches both.
Trailing exit (information only): no target, stop moved once a day at 08:00 SGT to 2R behind the best price, out when
the weekly, daily and 4-hour stop agreeing.

No weekly (information only): daily, 4-hour and 1-hour agree; big trends = daily and 4-hour.

Costs: spread in basis points of price, per side as in the replay: silver 4, copper 4, WTI 3, Brent 3, S&P 1,
Nasdaq 1.5, Dow 1.5, Russell 2, Nikkei 2, bonds 1, gold futures 1.5. Financing 1% a year of the position for every
night held, either side, as on forex (the futures price already carries the interest).

Window: trades opened from 2024-09-16 (three months of hourly data first) to the end of the data (2026-11-06).

## Pass mark

The 12 markets together, target 3R: average R a trade above 0 with p < 0.05 (bootstrap over calendar months, 4,000
resamples, so markets that move together count once), AND average above 0 in at least 3 of the 4 groups.

It must hold on both the raw and the adjusted series to pass; failing on both is a fail; anything else is unclear.

Information, not part of the pass mark: the trailing exit; each market; the no-weekly version against the rule
(pooled difference, both exits, both series, with a bootstrap over months on the paired difference); gold futures
against spot gold.

## What changes on the site

Pass: strategy.html says the rule also made money on these futures in 2024-2026, with the number of trades and that
it is two years. Fail: it says it did not, next to forex and the coins. Unclear: it says so. Nothing else changes:
the gold rule stays as it is, and no new market page is added (one page per market, owner 2026-10-28).
No weekly: reported on strategy.html and in the README whichever way it goes; on its own it does not change the rule.
