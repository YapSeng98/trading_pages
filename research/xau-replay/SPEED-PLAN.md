# Can the gold signal come sooner? Plan, written before any of these numbers were seen

Owner, 2026-11-05: "help me improve the signal, quick slow, the market will not wait", then "deep analysis and
reinvest how to make it more faster for the signal".

The rule today: weekly, daily, 4-hour, 1-hour and 15-minute structure trends all agree, checked on closed candles only,
in about 2 minutes after the deciding close (the replay's assumption), stop 3 x 1-hour ATR, target 3R or the trailing
stop. A timeframe turns when a candle closes beyond its last unbroken swing; a swing is known only `swing` bars later
(5 on daily, 4H, 1H, 15M; 3 on weekly). Replay baseline, which this test must reproduce first: 495 trades, +0.182R.

## Data

`data/duk` as it stands locally (1-minute spot bid, last state 2026-10-23), no new download. Same costs as `report.js`:
spread 1.5 bp, long financing 7.5% a year, one position at a time, stop wins when stop and target share a minute.

## Part 1: where the time goes (description, no pass or fail)

For each signal of the baseline rule:

1. Which timeframe's close completed the five.
2. For that timeframe: minutes from the first 1-minute close beyond its level to the candle close that made it official,
   and how far price moved in between, in R.
3. How far price had already come at the signal from the extreme of the last 1-hour counter-move, in R.
4. Big moves: legs of at least 5 daily ATR on daily closes (zigzag). For each: did a signal come that way during the
   leg, how many hours after it began, and how much of the leg had passed.

## Part 2: what being late costs (description)

The same baseline signals entered 2, 5, 15, 30, 60, 120, 240 and 480 minutes after the close, stop 3 x ATR from the
later price, target 3R.

## Part 3: the faster versions (13, fixed here)

Group A: same trends, seen before the candle closes. Each named timeframe counts as turned at the first 1-minute close
beyond its level; the others stay on closed candles. In 2 minutes later, as the baseline.

- A1: 15M
- A2: 15M, 1H
- A3: 15M, 1H, 4H
- A4: all five
- A5: A2 as a resting stop order at the level the small timeframes still need (the further one if both). It fills when
  the 1-minute high or low touches it, at the level or the bar's open if price gapped past. Nobody has to watch.

Group B: fewer timeframes, closed candles.

- B1: W, D, 4H, 1H (no 15M)
- B2: W, D, 4H, 15M (no 1H)
- B3: D, 4H, 1H, 15M (no weekly)
- B4: 4H, 1H, 15M (no weekly, no daily)

Group C: quicker trends, closed candles.

- C1: 1H and 15M on 2-bar swings (the engine's `internal` structure)
- C2: 4H, 1H and 15M on 2-bar swings
- C3: 1H and 15M on 3-bar swings
- C4: 4H, 1H and 15M on 3-bar swings

Trailing exit: reported for all; its "big trends split" exit uses each version's own big-trend definition (B3: D and
4H; B4: 4H).

## What counts as passing

Target 3R, compared with the baseline. A version passes only if all of these hold:

1. Faster: on the baseline signals it beats, it is at least 5 minutes earlier at the median, and it beats at least half
   of them. An earlier signal = same direction, within the 48 hours before the baseline signal.
2. Not worse per trade: resampling whole years 5,000 times, the chance that its average is more than 0.05R below the
   baseline's is small. Holm-adjusted over the 13 versions, below 0.10. (0.05R is about a quarter of the edge.)
3. Positive average in each of 2011-2018, 2019-2023 and 2024-2026.
4. Worst drawdown at most 47.5R (the baseline's 38R + 25%).
5. R a year at least 90% of the baseline's.

Information only, for any that pass: spread doubled to 3 bp (a break is where the spread is widest), the same version
on Bitcoin.

## What happens with the result

- None passes: the rule on the page does not change. The page may get better early warning and faster delivery, worded
  as warnings, not signals.
- One or more pass: the owner sees the numbers and decides. About 50 variants were looked at when the rule was chosen,
  and this adds 13, so a pass is a candidate to watch, not proof.

Part 1 and 2 cannot change the rule by themselves. Anything else tried after seeing these results gets called
exploratory, in the same write-up.

## Delivery delay (no replay needed)

Measured from the code and the commit log, reported beside the above: the answer on `report.html` after a close, an
alert in a background tab, and the age of `data/xau-state.json`, which the home tile and the live bar read.
