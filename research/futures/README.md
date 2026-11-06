# The gold rule on 12 futures markets

Plan written before the run: [PLAN.md](PLAN.md) (committed 2026-11-07, 7588329). Data: `python3 fetch_fut.py`
(Yahoo hourly bars from 2024-06-16, daily from 2016-11; not in git). Test: `node fut_test.js` (about 7 minutes),
numbers in `result.json`.

## Result: fails

The rule, four-timeframe version on hourly bars, target 3R, trades from 2024-09-16 to 2026-11-06:

| series | trades | win | avg a trade | p (avg ≤ 0) | groups positive |
|---|---|---|---|---|---|
| raw (as Yahoo gives it) | 520 | 23% | −0.11R | 0.95 | 1 of 4 |
| roll-adjusted | 502 | 25% | −0.04R | 0.73 | 1 of 4 |

Failing on both series is a fail by the plan. The trailing exit did no better (−0.13R raw, −0.07R adjusted).

By market, target 3R (raw / adjusted): silver +0.23 / +0.30, copper +0.04 / +0.04, WTI −0.27 / −0.52,
Brent −0.32 / −0.09, S&P −0.21 / −0.05, Nasdaq −0.32 / −0.01, Dow −0.20 / +0.11, Russell −0.16 / −0.19,
Nikkei +0.29 / +0.02, 10-year −0.26 / −0.10, 30-year −0.09 / −0.08, 5-year −0.14 / −0.01.
Groups (raw / adjusted): metals +0.14 / +0.18, energy −0.29 / −0.32, stock indices −0.12 / −0.03, bonds −0.17 / −0.06.

Yardstick over the same dates: gold futures +0.63R (raw, 39 trades) / +0.77R (adjusted, 36); spot gold's
four-timeframe version +0.58R (50); the real five-timeframe rule on spot gold +0.49R (71). The futures pipeline
gives gold about what spot gives, so the losses elsewhere are not a data artefact.

## No weekly

Information only. Pooled, target 3R: raw −0.09R (773 trades) against the rule's −0.11R; adjusted −0.08R (771) against
−0.04R. Trailing: raw −0.10R against −0.13R, adjusted −0.12R against −0.07R. Share of month resamples in which it is
ahead of the rule: raw 69% (3R) and 82% (trailing), adjusted 27% and 8%. On gold over these dates it was behind
(spot four-timeframe +0.49R against +0.58R; trailing +0.43R against +0.65R). So no support from markets it was
never looked at on; together with forex (worse there too), the case for it rests on gold's and Bitcoin's own
history only.

## What it means

The rule made money on gold and silver in 2024-2026 and lost on oil, stock indices and bonds over the same two
years, although several of those trended strongly too (the S&P and Nasdaq rose most of the period). Add forex
(−0.07R, 11 pairs) and seven coins (about zero): wherever it has been tried away from gold, it has not repeated.
Gold's own record is +0.07R a trade in 2011-2018 and most of its profit is 2022-2025. The honest reading: the edge
looks tied to precious metals' long trends of the last few years, not a general trend effect. It is not evidence that
it will stop working on gold; it is a reason to keep the size small and to follow the paper record and the stop
line (健康检查).

## Limits

- Two years of hourly data; four timeframes, not five (no 15-minute history on Yahoo).
- Contract rolls are not known. The adjusted series removes every jump larger than 4 times the median bar range,
  rolls and some real gaps alike (S&P 31 jumps, silver 69). The two series disagree market by market (Nasdaq −0.32
  raw, −0.01 adjusted), so single markets mean little; the pooled answer is the same on both.
- Costs are typical CFD spreads plus 1% a year financing, as on forex.
