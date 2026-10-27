# World strategies: what holds up, and what it means for this system

The owner asked (2026-10-28) for a deep look at the world's well-known "high win rate" strategies and at how this
system could improve. Five tests were written down in `PLAN.md` before any was run, with fixed settings and a pass
mark each. `world_tests.js` runs them (`result.json` keeps the numbers).

Data: FRED daily closes (`../trend-daily/fetch_fred.py`: currencies from 1971, oil, Nasdaq), FRED monthly 3-month
interest rates, the 10-year real yield and the Nikkei (`fetch_world.py`), spot gold 2010-2026 and the coins from
`../xau-replay`. Costs on every change of position (1.5 bp major currencies, 5 bp emerging currencies, oil and
crypto, 2 bp stock indices). Positions sized to 1% daily volatility unless said otherwise. "Sharpe" is return per
unit of risk per year (0.5 is decent, 1.0 is very good); p is the chance of a result this good by luck.

## Results against the pass marks set beforehand

| test | before 2010 | from 2010 | verdict |
|---|---|---|---|
| T1 Connors RSI(2) dip-buying, Nasdaq Composite (wins 65% of 415 trades) | -0.19 (p 0.24) | 0.66 (p 0.006) | **fails** |
| &nbsp;&nbsp; same rule, Nasdaq 100 (wins 71% of 330 trades) | 0.41 (p 0.048) | 0.57 (p 0.020) | |
| &nbsp;&nbsp; same rule, Nikkei 225 (wins 67% of 532 trades) | -0.02 (p 0.89) | 0.41 (p 0.10) | |
| T2a carry, time-series (hold each currency on the side of its interest difference) | 1.06 (p < 0.001) | 0.06 (p 0.82) | **fails** |
| T2b carry, cross-sectional (3 highest-rate currencies against the 3 lowest) | 0.55 (p 0.007) | 0.43 (p 0.08) | **fails** |
| T4 gold 4-hour rule, trades that agree with real yields vs the rest | | | **fails** |
| T5 equal-risk mix: daily trend + carry (T2b) + Nasdaq dip-buying (T1) | 0.95 (p < 0.001) | **0.87 (p < 0.001)** | **passes** |

- **High win rate is not an edge.** RSI(2) won 65-71% of its trades everywhere, yet on the Nasdaq Composite it lost
  money for 21 years (1972-1993, -33% in the 1987 crash alone), and even where it works it earns less per unit of
  risk than simply holding the index (Nasdaq 100 from 2010: 0.57 against 0.89). Run both ways on 19 other markets
  (currencies, oil, gold, coins: T1b, information only) it won 52-68% of trades and was positive on only 8; on gold
  it lost (-0.18).
- **Every single strategy had a decade-long bad spell.** Carry was strong until 2008 and weak since; its worst years
  were crises (2020 -13%, 2008 -10%, 1998 -10%), the crash risk the literature describes. The time-series version
  fell 63% from 2005 to 2016, when near-zero US rates made it a bet against the dollar. Trend on currencies (T3,
  information) went from 0.83 before 2010 to -0.15 since; adding the interest difference barely changed it.
- **Real yields do not help the gold rule** (T4): in 2011-2018 trades agreeing with the move in real yields averaged
  -0.08R against +0.46R for the others; 2019-2023 0.13 vs 0.20; 2024-2026 0.49 vs 0.48. Consistent with the
  gold/real-yield link breaking in 2022-2023.
- **What passed is the mix.** The three parts barely move together (correlations -0.09, 0.05, 0.08), so their
  bad spells fell at different times. From 2010 the mix scored 0.87 against 0.33 (trend), 0.43 (carry) and 0.66
  (Nasdaq) alone, and no year since 2010 lost more than 3% (at about 6% yearly risk). Worst fall 22%, in the 1987
  crash, from the dip-buying part, which has no stop.

## Checks on the mix (decided after seeing T5: information only)

| change | mix from 2010 |
|---|---|
| as tested | 0.87 |
| each part's risk measured only from its own past | 0.87 (but before 2010 0.72, worst fall 45% from mid-1986 to the 1987 crash) |
| without the Nasdaq part (trend + carry only) | 0.65 (p 0.007) |
| Nasdaq 100 instead of the Composite | 0.81 |
| Nasdaq part pays 5% a year financing while in a trade | 0.83 |
| trend and carry pay 1% a year on every position held (what a 1% swap mark-up costs) | 0.66; alone they drop to 0.15 and 0.18 |
| your gold 4-hour rule added as a fourth part (monthly, from 2011-02) | 0.94 -> **1.07**; the gold rule's correlation with the mix is 0.04 |

The Nasdaq dip-buying done a day late (decided at the US close, traded at the next close, as from Singapore) still
held: Nasdaq 100 0.49 before 2010 and 0.50 from 2010 (p 0.04).

## The parts you can trade (information only, added after the tests above)

On MT5 the owner can trade the gold rule, the daily trend markets and US100, not interbank carry. Monthly from 2011-02,
each at the same 10% yearly swing:

| | Sharpe | worst fall | losing years |
|---|---|---|---|
| gold 4-hour rule | 0.55 | 35% | 5 of 16 |
| daily trend on trend.html's markets (18 of its 19) | 0.11 | 25% | 9 of 16 |
| Nasdaq 100 dip-buying | 0.76 | 20% | 4 of 16 |
| gold + Nasdaq 100 (picked after seeing this table) | 0.93 | 28% | 2 of 16 |
| all three | 0.76 | 26% | 2 of 16 |

Gold and the Nasdaq rule barely move together (correlation -0.01); daily trend on these markets added nothing since
2011. The Nasdaq rule has no stop: 71% of its 330 trades won (average +1.6%, losers -2.0%), but the worst lost 29%
(October 1987), then 12% (1990) and 8% (1998, 2011). A stop on the close does not fix that, crashes gap through it
(8%: worst trade -13%, and from 2010 0.51 instead of 0.57).

trend.html's risk setting: with every market held together, the account swung 6.7% a day per 1% of daily risk per
market (2011-2026), because most of its currency pairs move against the same dollar. At the old default of 0.15% that
is about 1% a day, a worst day of -8.5% and a worst fall of 48%; the page had said 0.3-0.6% a day. The default is now
0.05% (about 0.3% a day, 5% a year, worst fall 16%), and the page shows these figures for whatever the visitor sets.

## A bug found on the way, and what it changed

The first run counted Bitcoin's weekend days as separate portfolio days and dated gold's daily bars one day early.
No look-ahead, but it inflated the mix's volatility (8% instead of the expected 6%) and the number of "years" in
the daily-trend study. Fixed here and in `../trend-daily/trend_daily.js` (weekend returns added to Monday; each bar
dated by the day it closes). Effect: T5 from 2010 went from 0.67 (p 0.001) to 0.87; in the daily-trend study the
three rules together from 2010 went from 0.40 (p 0.056) to 0.39 (p 0.107), so that result is further from proof
than first reported. Verdicts unchanged in both.

## What this means for the system

1. Stop judging rules by win rate. Judge them by average R per trade, the worst fall and how many years were positive.
2. Keep the gold 4-hour rule as it is. Nothing tested (filters, patterns, indicators, real yields) improved it, and
   it is nearly independent of the other strategies, which is exactly what makes it useful in a mix.
3. The largest improvement available is not another filter but more unrelated strategies, each at a small, equal
   risk: the gold rule, daily trend (`trend.html`), and Nasdaq 100 dip-buying are the candidates with evidence.
4. Before holding positions for weeks on a CFD account, check the broker's swap rates (MT5: Symbol, Specification).
   A 1% yearly mark-up removes more than half of what trend and carry earned since 2010.

## Sources

- Connors RSI(2) on the S&P 500, 2016-2026: 71% winners, +18% against +255% for holding: https://backtrex.com/en/backtests/connors-rsi-2-sp-500
- McLean & Pontiff, 97 return predictors, 58% lower returns after publication: https://ivey.uwo.ca/media/3775549/pontiff.pdf
- Time-series momentum, 1985-2009 and after: https://quantpedia.com/deconstructing-the-time-series-momentum-strategy/
- Trend followers 2022-2025 (SG CTA / Trend indices): https://www.alternativeswatch.com/2025/09/02/ctas-trend-following-hedge-funds-rebound-h1-rout-societe-generale-indices/
- Turn-of-the-month effect fading after 1990 (Maberly & Waggoner): https://www.atlantafed.org/research/publications/wp/2000/11.aspx
- Carry across asset classes (Koijen, Moskowitz, Pedersen, Vrugt): https://www.nber.org/papers/w19325 and https://www.etf.com/sections/index-investor-corner/swedroe-carry-factor-spans-assets
- Carry trade risks and drawdowns (Daniel, Hodrick, Lu): https://business.columbia.edu/sites/default/files-efs/pubfiles/6378/Daniel.Hodrick.Lu.Carry%20Trade.Critical%20Finance%20Review.2017.pdf
- Volatility-managed portfolios (Moreira & Muir): https://www.nber.org/papers/22208
- Trend following added to other premia: https://beyondpassive.substack.com/p/what-trend-following-actually-adds
- Absolute momentum and drawdowns: https://alphaarchitect.com/2015/02/asset-allocation-horserace-robust-asset-allocation-raa-vs-dual-momentum/
- Gold and real yields, correlation 0.84 (2005-2021) to 0.03 (2022-2023): https://www.rbcwealthmanagement.com/en-ca/?p=28896
- Share of retail CFD / forex accounts that lose money: https://www.babypips.com/news/almost-80-percent-of-retail-traders-are-unprofitable

## Run it again

`python3 ../trend-daily/fetch_fred.py`, `python3 fetch_world.py` (both FRED, into `data/` folders not kept in git),
then `node world_tests.js`. Gold and coin data come from `../xau-replay/data` (see the README there).
