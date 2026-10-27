# World strategies: what holds up, and what could improve the system

Written on 2026-10-28 BEFORE any of the tests below was run. The owner asked for a deep look at the world's
high-win-rate and well-documented strategies and how the system could be improved.

## What the literature already says (sources in README.md)

- High win rate is not profit: Connors' RSI(2) won 71% of trades on the S&P 500 in 2016-2026 and returned +18%
  against +255% for holding the index.
- Published edges shrink: 97 stock anomalies earned 58% less after publication (McLean & Pontiff).
- Time-series momentum was strong 1985-2009 and weak after (our own daily test agrees).
- Currency carry: high Sharpe 1990-2008, crashes in crises; crash-hedged carry earns about zero.
- Volatility targeting raises Sharpe ratios (Moreira & Muir), including for carry.
- Combining different premia (carry across assets, trend on top) raises portfolio Sharpe more than any single one.
- Gold's link to real yields broke in 2022-2023 (correlation 0.84 -> 0.03).
- 70-89% of retail CFD / forex accounts lose money.

## Tests, settings fixed now

Costs per unit of position changed: 1.5 bp major currencies, 5 bp emerging currencies, oil and crypto, 2 bp stock
indices. Positions sized to 1% daily volatility (63-day), capped at 4x, unless said otherwise. Before / after split
at 2010-01-01. Sharpe and t on daily returns, flat days included.

**T1 Index mean reversion (Connors RSI(2)), the classic high-win-rate system.** Nasdaq Composite (1971-), Nasdaq 100
(1986-), Nikkei 225 (1949-). Long only: buy at the close when the close is above its 200-day average and RSI(2) < 10;
sell at the close when the close is above its 5-day average. Full size while in (no volatility scaling: one position
at a time, as published). Success: positive Sharpe with p < 0.05 both before and after 2010 on the Nasdaq Composite,
and positive on the other two after 2010.

**T1b The same rule, both ways, on currencies, oil, gold and crypto** (short when below the 200-day and RSI(2) > 90,
cover above... below the 5-day average). Information: does a stock-index effect carry to other markets?

**T2 Currency carry.** 13 currencies against the US dollar (GBP, JPY, CAD, CHF, AUD, NZD, EUR, SEK, NOK, DKK, MXN,
ZAR, KRW), 3-month interest rates (OECD via FRED; Japan before 2002 and Switzerland before 1999-07 from their
call-money rates), 1986-2026. Daily return of holding a currency = its spot move against the dollar + its rate minus
the US rate (accrued daily). (a) time-series carry: each month hold every currency the side of its rate difference;
(b) cross-sectional carry: each month long the 3 highest-rate currencies and short the 3 lowest, equal risk.
Success for each: positive Sharpe with p < 0.05 both before and after 2010.

**T3 Trend with carry.** The daily trend rules of research/trend-daily on these 13 currencies, now with the interest
difference added to the returns (what a real currency position earns or pays). Information: how much carry changes
the trend result.

**T4 Gold and real yields.** The gold 4-hour rule's own trades (research/xau-replay), split by whether the trade's
side agrees with the 63-day change in the 10-year real yield (falling yields favour longs). Success: agreeing trades
beat the others in 2011-2018, 2019-2023 AND 2024-2026.

**T5 A portfolio of different strategies.** Equal-risk mix (each scaled to 10% yearly volatility on its own history)
of: daily trend on all markets (research/trend-daily, three rules together), cross-sectional currency carry (T2b),
and Nasdaq mean reversion (T1). Report the correlation between them and the mix's Sharpe before / after 2010.
Success: the mix's Sharpe after 2010 above the best single one's, with p < 0.05.

Anything decided after seeing a result is labelled "information only".
