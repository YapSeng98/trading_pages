# Does the gold rule work on forex?

Written on 2026-10-28 BEFORE any of the tests below was run. Until now forex.html could only say "unverified": the free
intraday forex history the page uses (Dukascopy's chart feed) turns away scripted downloads. Yahoo Finance serves
hourly forex bars from 2024-01 (checked: EURUSD=X, 17,500 hourly bars, gaps only at weekends), the same source the
stock page uses.

## The test, fixed now

- **Markets**: the 11 pairs forex.html shows: EUR/USD, GBP/USD, USD/JPY, AUD/USD, NZD/USD, USD/CAD, USD/CHF, EUR/JPY,
  GBP/JPY, AUD/JPY, EUR/GBP (Yahoo EURUSD=X, GBPUSD=X, JPY=X, AUDUSD=X, NZDUSD=X, CAD=X, CHF=X, EURJPY=X, GBPJPY=X,
  AUDJPY=X, EURGBP=X).
- **Data**: Yahoo hourly bars (range 730d, which reaches back to 2024-01), with Yahoo daily bars from 2019 placed in
  front so the weekly and daily trends have the year of history the engine needs. Candles cut in broker time
  (17:00 New York) as on the page.
- **The rule, one change**: the page's engine and plan code unchanged (assets/xau-engine.js, assets/xau-plan.js).
  Yahoo has no 15-minute history beyond 60 days, so the signal is the four-timeframe version: weekly, daily, 4-hour
  and 1-hour all agree (onset), entered at the next hourly open; stop 3 x the 1-hour ATR; target 3R; one position at
  a time per pair.
- **Yardstick**: the same four-timeframe version on spot gold (Dukascopy, research/xau-replay/data), from the same
  hourly bars and over the same dates. The gold rule's real five-timeframe result over these dates is known
  (+0.48R a trade in 2024-2026); the yardstick shows how much the four-timeframe, hourly-bar version keeps of it.
- **Costs**: spread 1 bp a side on the seven pairs with the US dollar, 2 bp on the four crosses; financing 1% a year
  of the position against every position held overnight, either side (a typical broker mark-up; the interest
  difference itself is left out).
- **Exits checked on hourly bars**: when one hour touches both stop and target, the stop counts (cautious).
- **Window**: trades opened from 2024-04-01 (three months of hourly data before the first trade) to the end of the data.

## Pass mark

The 11 pairs together: average R a trade above 0 with p < 0.05 (bootstrap over calendar months, 4,000 resamples, so
pairs that move together are not counted as separate evidence), AND positive on at least 7 of the 11 pairs.

Information only, not part of the pass mark: the trailing-stop exit (no target, stop moved once a day at 08:00 SGT
to 2R behind the best price, out when the big three stop agreeing); each pair on its own; the 2024-25 and 2026 halves.

## What the page will say

Pass: forex.html says what the replay found, with its number of trades, and that it is a short history.
Fail: forex.html says the rule did not make money on forex in 2024-2026, in place of "unverified".
