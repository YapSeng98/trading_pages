# Daily trend-following on 55 years of markets

Does the simplest, most published idea in trading (follow the trend on daily closes, across many markets) hold up?
Written down before the first run (`trend_daily.js` header): three textbook strategies, nothing tuned; each position
sized to 1% daily volatility; costs on every change; FRED daily closes (`fetch_fred.py`: 17 currencies against the
US dollar from 1971, WTI, Brent, US gas, Nasdaq Composite and 100) plus spot gold 2010-2026, Bitcoin and seven coins.
Success: the equal-risk portfolio positive with p < 0.05 both before 2010 and from 2010 (after these ideas were
published), and at least 60% of markets positive.

| | Sharpe, all years | before 2010 | from 2010 | markets positive | worst fall |
|---|---|---|---|---|---|
| 12-month momentum | 0.82 | 1.07 (p < 0.001) | 0.23 (p 0.34) | 26 / 31 | 25% |
| 55/20-day breakout | 1.01 | 1.23 (p < 0.001) | 0.39 (p 0.11) | 28 / 31 | 13% |
| 50/200-day averages | 0.65 | 0.77 (p < 0.001) | 0.32 (p 0.19) | 26 / 31 | 42% |
| the three together (decided after the above: information only) | 0.98 | 1.20 | 0.39 (p 0.107) | | 21% |

By the criteria all three FAIL: strong for forty years, positive but weaker since 2010 and not significant on those
sixteen years alone (the 2010s were poor for trend followers everywhere). Still the broadest
evidence of anything tested here: 31 markets, five decades, positive in most. Win rates are low (25-55% of trades):
the money comes from a few long trends. Currency carry (interest differences) is not included.

Corrected on 2026-10-28 (found while running `../world`): the first run counted the coins' weekend days as separate
portfolio days and dated gold's daily bars one day early. Weekend returns now go to Monday and each bar is dated by
the day it closes. Per-market results are unchanged except gold's 12-month momentum (0.30 to 0.33: its month ends moved by a day); the
portfolio figures above are the corrected ones. The first
run had shown, from 2010: momentum 0.36 (p 0.09), breakout 0.33 (p 0.12), averages 0.30 (p 0.15), the three together
0.40 (p 0.056). Verdicts unchanged.

`result.json` keeps the numbers. `data/` (FRED downloads) is not in git; `python3 fetch_fred.py` gets it again.
