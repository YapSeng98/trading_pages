# Forward record of the candidate versions

Written on 2026-11-07, before the first run that records them. All of gold's history (2011-02 to 2026-10-23) has been
used to choose and check the rule, and the futures test (research/futures) found no support elsewhere, so the open
questions below can only be answered on prices that did not exist when they were asked.

## What is recorded

`scripts/xau_track.js` already keeps the rule's live paper record (target 3R) at every 15-minute close for gold
(`data/xau-signals.json`) and Bitcoin (`data/btc-signals.json`). From the first run after this plan, the same walk
also keeps three candidate books in `shadow` in those files:

| book | entry | exit | replay, gold (whole history) | replay, Bitcoin |
|---|---|---|---|---|
| `trail` | the rule's own signal | trailing stop, out when W/D/4H stop agreeing | 434 trades, +0.25R | 281, +0.18R |
| `noW` | D, 4H, 1H, 15M agree (no weekly) | target 3R | 709, +0.14R | 441, +0.20R |
| `noWtrail` | the same | trailing stop, out when D/4H stop agreeing | 637, +0.24R | 484, +0.33R |

The rule itself (target 3R): gold 495 trades, +0.18R; Bitcoin 254, +0.13R.

Each book holds one position at a time, enters at the 15-minute close with the record's costs (gold spread 1.5 bp,
financing 7.5% a year on longs; Bitcoin 3 bp and 15% both sides), stop 3 x the 1-hour ATR. Trailing as replayed: at
the first candle of each UTC day (08:00 SGT) the stop moves to 2R behind the best price since entry, never back.

No look back: each book starts at the record's last checked candle when the code first runs. Its first entry is the
first change of its own signal after that.

Checked before going live (2026-11-07), the tracker walked over 2024-01 to 2026-10 in job-sized steps against the
replay's simulator on the same dates. Gold: rule 3R 102 trades +0.47R (replay 102, +0.48R), trail 83, +0.55R (84,
+0.56R), noW 137, +0.35R (137, +0.37R), noWtrail 118, +0.36R (120, +0.36R). Bitcoin: 99, −0.03R (100, −0.08R),
104, −0.04R (105, −0.05R), 167, +0.12R (172, +0.13R), 177, +0.27R (178, +0.26R). The small gaps are 15-minute
against 1-minute fills.

## When and how it is judged

Not before a book has 100 closed trades (gold: about three years for `trail`, two for `noW`). Then each book is
compared with the rule's own 3R record over the same dates: average R a trade, bootstrap over calendar months
(4,000 resamples) on the difference. A candidate counts as better only if it is ahead in at least 95% of the
resamples. Even then the page's rule changes only after the replay is run again with the new data included and the
change is written down as a plan first.

Until then the books are information: the gold page shows their totals under the paper record, labelled as
candidates that the tests so far did not support, with no alerts. They are not signals and must not be presented
as reasons to trade.
