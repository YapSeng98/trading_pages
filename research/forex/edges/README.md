# Forex, round 2: none of the documented currency effects makes money after costs

Tested on 2026-10-30 exactly as written down beforehand in `PLAN.md` (committed before the first run). The owner asked
to make the forex predictions more accurate and profitable. Round 1 (`../`) had already found that the gold rule loses
on currencies. This round tested the effects the academic literature documents specifically for currencies, each on
the years after the paper's own sample ended, plus the most popular retail day-trading method. `fetch_edges.py`
downloads the data (into `data/`, not in git), `edges_test.js` runs the tests, and `result.json` keeps the numbers.

## Results

| test | period | result after costs | verdict |
|---|---|---|---|
| A1 Fed announcement days: short the dollar against 9 currencies, noon the day before to noon the day after | 2011-2026, 125 announcements | **-9.2 bp** an announcement (gross -6.0), wins 51%, p 0.88 | **fails** |
| &nbsp;&nbsp;same test in the paper's own years | 1994-2010, 136 announcements | +12.8 bp (gross +16.0; the paper: +12.45) | information |
| A2 time of day, EUR/USD: short 07:00 London to 08:00 New York, long 08:00 to 16:00 New York | 2024-01 to 2026-10, 722 days | **-0.8 bp** a day at 1 bp a trade (gross +1.2), p 0.73 | **fails** |
| A3 currency momentum: long the 3 strongest of 9 G10 currencies over the past month, short the 3 weakest | 2011-01 to 2026-09, 189 months | **-0.28%** a month (gross -0.08%), Sharpe -0.57, p 0.99 | **fails** |
| B1 London breakout of the Asian range, 11 pairs | 2024-01 to 2026-10, 5,305 trades | **-0.105R** a trade, wins 51%, 1 of 11 pairs positive | **fails** |

Holm correction across A1-A3 was not needed: no p-value came near 0.05.

- **A1:** the Fed-day effect was real in the paper's years. The same data and window find +12.8 bp for 1994-2010, close to the
  paper's +12.45 bp, so the test can see it. After the paper's sample it is gone. It was -22 bp an announcement in
  2011-2018 and +4 bp in 2019-2026, and the same two-day windows on other days averaged -4.4 bp. On Yahoo hourly bars with
  the paper's own 4pm-to-4pm window, the 22 announcements of 2024-2026 averaged -15.9 bp gross. The three
  highest-rate currencies, where the paper found the largest effect, did worse (-17.0 bp).
- **A2:** the pattern is still there but small. In the paper (1997-2007) the euro fell about 3 bp in European hours and
  rose about 4 bp in US hours each day. In 2024-2026 those moves were +0.8 and +0.4 bp in the trade's favour. That is
  +1.2 bp a day before costs, and it breaks even only at 0.6 bp a trade, below any retail spread. At 2 bp a trade it
  is -2.8 bp a day. The paper's other dollar pairs, at 1.5 bp a trade, also lost: GBP/USD -2.2, USD/CHF -1.9, USD/JPY
  -2.5, AUD/USD -1.0 bp a day.
- **A3:** "buy the strongest currency, sell the weakest" lost in both halves (-0.11% and -0.46% a month), and even
  before 2011 it earned almost nothing on these currencies (1976-2010: Sharpe 0.07).
- **B1:** the London breakout won half its trades and lost about 0.1R a trade on 10 of the 11 pairs. EUR/GBP was worst
  (-0.30R). USD/JPY was the only positive pair, at +0.01R.

## Information only

- **Month-end fix** (Melvin & Prins): over the 32 month-ends of 2024-2026, stocks beating the other markets barely
  predicted the fix-hour move. The slope was -0.002 against the paper's -0.0142. Trading it against the dollar lost
  1.8 bp a trade (224 trades, 47% wins).
- **Yahoo's daily forex bars:** their close is a snapshot taken at the start of the London day, almost exactly the
  open. The median gap between the two is 0-1 bp in every year from 2016 to 2026; the day's move shows up between one
  bar and the next. Round 1 used those bars only as history before its hourly data began. Rerun with each bar's close
  replaced by the next bar's open (`fx_recheck.js`), it gives exactly the same 688 trades and -0.071R (`recheck.json`).
  Round 1 stands.
- **Deviations from the plan:** FRED no longer serves the daily Deutsche mark (DEXGEUS), so the 1994-1998 part of
  A1's information check uses the other 8 currencies. In 2003 the Fed's calendar lists the September meeting on two
  days (the 15th and 16th); it is counted once, on the 16th.

## What it means

Counting round 1 and `../../world`, eight ways of predicting currencies have now been tested on the years since 2010:

- the gold rule;
- daily trend;
- carry, both ways;
- Fed days;
- time of day;
- strong against weak currencies;
- the London breakout.

None passed. Carry, holding the 3 highest-rate currencies against the 3 lowest, came closest (Sharpe 0.43 from 2010, p 0.08). A 1% yearly
swap mark-up, which an MT5 account pays, cuts that to 0.18. Two effects were real when they were published: Fed days
and time of day. Both have since faded to nothing or to less than a retail spread. That is the pattern McLean &
Pontiff describe for published predictors. forex.html says so in its warning box, and its signals stay a trend map
with the label 回放不赚钱.

## Sources

- Mueller, Tahbaz-Salehi & Vedolin, "Exchange Rates and Monetary Policy Uncertainty", Journal of Finance 2017
  (working paper: https://researchonline.lse.ac.uk/id/eprint/66043)
- Breedon & Ranaldo, "Intraday patterns in FX returns and order flow", Journal of Money, Credit and Banking 2013
  (working paper: https://www.snb.ch/en/publications/research/working-papers/2011/working_paper_2011_04)
- Melvin & Prins, "Equity hedging and exchange rates at the London 4 p.m. fix", Journal of Financial Markets 2015
  (https://ideas.repec.org/a/eee/finmar/v22y2015icp50-72.html)
- Menkhoff, Sarno, Schmeling & Schrimpf, "Currency momentum strategies", Journal of Financial Economics 2012
- McLean & Pontiff, returns of published predictors after publication: https://ivey.uwo.ca/media/3775549/pontiff.pdf
- Fed meeting dates: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm

## Run it again

`python3 ../fetch_fx.py` (hourly bars), `python3 ../../world/fetch_world.py` (interest rates) and
`python3 fetch_edges.py`, then `node edges_test.js` (under a second). `node --max-old-space-size=12000 fx_recheck.js`
reruns round 1 with the corrected daily bars (about 5 minutes).
