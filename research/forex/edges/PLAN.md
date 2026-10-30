# Forex, round 2: the effects documented for currencies

Written on 2026-10-30 BEFORE any of the tests below was run. The owner asked to make the forex predictions more accurate
and profitable. Already tested on currencies and failed since 2010: the gold rule (`../`, -0.07R a trade), daily trend
(`../../world` T3, `../../trend-daily`), carry (`../../world` T2) and RSI(2) (`../../world` T1b). This round tests the
effects that the academic literature documents specifically for currencies, each on the years after the paper's own
sample ended, and the most popular retail day-trading method.

## Data

- Daily: FRED H.10 noon buying rates in New York (12:00 ET) for the 9 G10 currencies against the dollar (EUR from 1999,
  the Deutsche mark before it for the 1994-1998 check). Interest rates: OECD 3-month rates via FRED (`../../world/data`),
  the rate known at the time (last month's), the last value carried forward where a series stops.
- Intraday: Yahoo hourly bars (`../data`, 2024-01-11 to 2026-10-28) for the 11 pairs forex.html shows. The price at a
  time is the close of the hourly bar that ends then.
- Not used: Yahoo daily forex bars. Their close is a snapshot taken at the start of the London day (median gap between
  close and open 0-1 bp in every year from 2016 to 2026), so they cannot time anything within a day.
- Fed meeting dates: the Fed's calendar pages (federalreserve.gov/monetarypolicy/fomccalendars.htm and
  fomchistoricalYYYY.htm). Scheduled meetings only (conference calls, unscheduled meetings and notation votes left out);
  the announcement day is the meeting's last day.
- Stock indices, for the month-end check only: Yahoo daily ^GSPC, ^STOXX50E, ^FTSE, ^N225, ^GSPTSE, ^AXJO, ^SSMI, ^NZ50.

## Family A: effects from the literature (Holm correction across A1-A3 at 5%)

**A1 Fed announcement days** (Mueller, Tahbaz-Salehi & Vedolin, Journal of Finance 2017; sample 1994-2010). Short the
dollar against the 9 currencies, equal weights, around scheduled FOMC announcements. The paper measured 4pm ET the day
before to 4pm ET on the day: +12.45 bp (t 2.43) against about zero on other days, three quarters of it before the
announcement.
- Window: the noon rate of the business day before the announcement to the noon rate of the business day after. It
  contains the paper's window; the extra hours had no excess return in the paper's data.
- Costs: 1 bp a side for EUR, JPY, GBP, CHF, CAD, AUD and NZD, 2.5 bp a side for NOK and SEK; financing 1% a year.
- Test period: announcements from 2011-01-01 to the last one with data (after the paper's sample).
- Pass: average net return above 0 with a one-sided bootstrap p (10,000 resamples of the announcements) that survives
  Holm, AND an average above 0 in both 2011-2018 and 2019-2026.
- Information only: 1994-2010 (the paper's years: shows whether this data and window find the effect where it was
  found), the three currencies with the highest interest rates, the same two-day windows on all other days, each
  currency, and 2024-2026 on the Yahoo hourly bars with the paper's own 4pm-to-4pm window.

**A2 Time of day** (Breedon & Ranaldo, Journal of Money, Credit and Banking 2013; sample 1997-2007). A currency tends to
fall during its own trading hours. Trading hours as in their Table 1: US 08:00-16:00 New York, Europe 07:00-15:00 London,
Japan 08:00-15:00 Tokyo, Australia 10:00-16:00 Sydney. The one pair they found profitable after costs is EUR/USD: short
from 07:00 London to 08:00 New York, long from 08:00 to 16:00 New York.
- Test: that EUR/USD trade on every weekday of the Yahoo hourly data, 2024-01 to 2026-10.
- Cost: 1 bp a trade, round trip (about 1.1 pips, a typical MT5 EUR/USD spread with commission); two trades a day.
- Pass: average daily net return above 0 with a one-sided p (10,000 resamples of calendar weeks) that survives Holm, AND
  above 0 in both halves of the period.
- Information only: the same at 2 bp a trade; the cost at which it breaks even; each leg alone; the paper's other dollar
  pairs at 1.5 bp a trade (GBP/USD and USD/CHF timed like EUR/USD; USD/JPY long in Tokyo hours and short in US hours;
  AUD/USD short in Sydney hours and long in US hours).

**A3 Currency momentum, "strong against weak currencies"** (Menkhoff, Sarno, Schmeling & Schrimpf, Journal of Financial
Economics 2012; sample to 2010). Each month, long the 3 G10 currencies with the best excess return against the dollar
over the past month and short the 3 worst, equal weights, held one month.
- Excess return: spot change plus the interest difference (3-month rates).
- Costs: 1.5 bp per unit of position changed; financing 1% a year on every position (an MT5 swap mark-up).
- Test period: 2011-01 to 2026-09.
- Pass: average monthly net return above 0 with a one-sided p (10,000 resamples in blocks of 3 months) that survives
  Holm, AND above 0 in both 2011-2018 and 2019-2026.
- Information only: 1976-2010.

## Family B: the most popular retail method (on its own)

**B1 London breakout of the Asian range**, on the 11 pairs. Asian range: the high and low from 00:00 to 07:00 London.
The first hourly close above the high (below the low) between 07:00 and 11:00 London: buy (sell) at the next hourly
open. Stop at the other side of the range, target one range height from the entry, out at 16:00 London if neither is
hit; one trade per pair a day; when one hour touches both, the stop counts. Costs 1 bp a side (2 bp on the crosses).
Measured in R.
- Pass: average R above 0 with p < 0.05 (resampling calendar months, so pairs that move together count once), at least 7
  of the 11 pairs positive, AND above 0 in both halves of the period.

## Information only

- Month-end fix (Melvin & Prins, Journal of Financial Markets 2015; 2004-2012): a country's stocks beating the other
  markets over the month (to the second-last business day) predict its currency falling in the hour before the 4pm
  London fix on the last business day (10% better stocks, -14 bp). 2024-2026 on Yahoo hourly bars: about 33 month-ends,
  too few for a verdict.
- The first forex test (`../`) built its weekly and daily history before 2024-01 from Yahoo daily bars, whose closes are
  the day's opening price. Run again with each of those bars' close replaced by the next bar's open (the true close),
  to see whether its result changes.

## What the page will say

- A test that passes goes on forex.html as one short line with its own record: what to do, when (in Singapore time),
  and the replay's numbers. The daily refresh may quote it.
- Tests that fail: the warning box names them as tested and not making money after costs; nothing else on the page
  changes.
