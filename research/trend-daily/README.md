# Daily trend-following on 55 years of markets

Does the simplest, most published idea in trading (follow the trend on daily closes, across many markets) hold up?
Written down before the first run (`trend_daily.js` header): three textbook strategies, nothing tuned; each position
sized to 1% daily volatility; costs on every change; FRED daily closes (`fetch_fred.py`: 17 currencies against the
US dollar from 1971, WTI, Brent, US gas, Nasdaq Composite and 100) plus spot gold 2010-2026, Bitcoin and seven coins.
Success: the equal-risk portfolio positive with p < 0.05 both before 2010 and from 2010 (after these ideas were
published), and at least 60% of markets positive.

| | Sharpe, all years | before 2010 | from 2010 | markets positive | worst fall |
|---|---|---|---|---|---|
| 12-month momentum | 0.79 | 1.07 (p < 0.001) | 0.36 (p 0.09) | 26 / 31 | 27% |
| 55/20-day breakout | 0.91 | 1.23 (p < 0.001) | 0.33 (p 0.12) | 28 / 31 | 26% |
| 50/200-day averages | 0.60 | 0.77 (p < 0.001) | 0.30 (p 0.15) | 26 / 31 | 45% |
| the three together (decided after the above: information only) | 0.91 | 1.20 | 0.40 (p 0.056) | | 21% |

By the criteria all three FAIL, narrowly: strong for forty years, positive but weaker since 2010 and not yet
significant on those sixteen years alone (the 2010s were poor for trend followers everywhere). Still the broadest
evidence of anything tested here: 31 markets, five decades, positive in most. Win rates are low (25-55% of trades):
the money comes from a few long trends. Currency carry (interest differences) is not included.

`result.json` keeps the numbers. `data/` (FRED downloads) is not in git; `python3 fetch_fred.py` gets it again.
