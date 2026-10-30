# The gold rule on forex: it does not make money there

Tested on 2026-10-28 exactly as written down beforehand in `PLAN.md`. `fetch_fx.py` downloads Yahoo's hourly and daily
bars (data/, not in git); `fx_test.js` runs the page's own engine and plan code; `result.json` keeps the numbers.

What was tested: the 11 pairs forex.html shows, trades opened from 2024-04-01 to 2026-10-28. Yahoo has no 15-minute
history before the last 60 days, so the signal is the four-timeframe version (weekly, daily, 4-hour and 1-hour agree),
entered at the next hourly open, stop 3 x the 1-hour ATR, target 3R, exits checked on hourly bars (stop first when one
hour touches both). Costs: 1 bp spread (2 bp on the crosses) and 1% a year financing on every position held.

| | trades | win | average | total |
|---|---|---|---|---|
| EUR/USD | 75 | 24% | -0.09R | -6.4R |
| GBP/USD | 55 | 24% | -0.12R | -6.8R |
| USD/JPY | 61 | 16% | -0.37R | -22.6R |
| AUD/USD | 66 | 20% | -0.24R | -15.6R |
| NZD/USD | 62 | 18% | -0.33R | -20.4R |
| USD/CAD | 52 | 21% | -0.21R | -11.0R |
| USD/CHF | 52 | 27% | +0.05R | +2.6R |
| EUR/JPY | 63 | 43% | +0.63R | +39.7R |
| GBP/JPY | 72 | 26% | +0.03R | +2.3R |
| AUD/JPY | 65 | 29% | +0.14R | +9.4R |
| EUR/GBP | 65 | 18% | -0.31R | -20.1R |
| **all 11** | **688** | **24%** | **-0.07R** (p 0.82) | **-48.9R** |

**Verdict by the pass mark: FAILS** (needed an average above 0 with p < 0.05 and at least 7 pairs positive; got -0.07R
and 4 pairs). The trailing-stop exit was no better (736 trades, -0.08R). By period: about zero from 2024-04 to
2025-12 (+0.01R, 452 trades), negative in 2026 (-0.23R, 236 trades). One pair doing well (EUR/JPY) among eleven is
what chance alone produces; it is not a reason to trade it.

The test is not too blunt to find an edge: the same four-timeframe version on spot gold, from the same kind of hourly
bars over the same dates, made +0.66R a trade (66 trades), and the gold page's real five-timeframe rule on minute bars
+0.52R (92 trades). The rule finds gold's trends; on currencies it loses.

This agrees with the daily tests in `../world` (trend rules on 13 currencies negative since 2010). forex.html now says
so instead of "unverified".

Checked again on 2026-10-30 (`edges/`): Yahoo's daily forex bars, used here only as history before the hourly data
begins (2024-01), have a close that is really a snapshot at the start of the London day (close and open differ by 0-1
bp). With each close replaced by the next bar's open, the true close, the test gives exactly the same 688 trades and
-0.071R (`edges/fx_recheck.js`, `edges/recheck.json`). Round 2 (`edges/`) then tested the effects documented for
currencies (Fed days, time of day, strong against weak currencies) and the London breakout: none makes money after costs.

Run again: `python3 fetch_fx.py`, then `node --max-old-space-size=12000 fx_test.js` (about 5 minutes; the gold
yardstick needs research/xau-replay/data).
