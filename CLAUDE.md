# Trading Pages — Auto-Refresh Instructions

This repo is a static GitHub Pages trading site at https://yapseng98.github.io/trading_pages/.  
A scheduled Claude Code session refreshes the written content once a day at 10:10 SGT.  
Numbers are not its job. GitHub Actions workflows write them to data files, and the refresh reads those files:
stock prices in `data/quotes.json`, gold in `data/xau-state.json`, the economic calendar in `data/calendar.json`.

---

## Pages updated EVERY run (Steps 3–4)

| File | What to update |
|------|----------------|
| `daily.html` | hdate chip, hprice-chg, bias bar, snapshot, S/R table, scenarios, session plan, calendar, multi-timeframe table. Every gold number comes from `data/xau-state.json` and every calendar row from `data/calendar.json`; see "Gold facts". |
| `news.html` | hdate, price chip (`<!--LIVEPRICE-->` markers), hprice-chg, TL;DR, 5 news items (each dated, with its source link), key levels (`.lvls`: from `resistance` / `support` / `price` in `data/xau-state.json`) |
| `risk.html` | hdate, calendar rows (from `data/calendar.json`), scenario probabilities (`.scen-prob`), staged plan |
| `index.html` | Nothing. The tile chips, Market Pulse, 7-day chart, score dial and footer stamp are filled in the browser by `assets/hub-live.js` from `data/xau-state.json` and `data/calendar.json`. |
| `stocks.html` | `hdate` date line only, exactly `YYYY年M月D日（星期X）HH:MM SGT&ensp;·&ensp;GMT+8 &ensp;·&ensp; 美国 / 新加坡 / 马来西亚 三大市场 · 成长股与股息股分类` with nothing appended (the page has its own data-freshness bar). Every market number on this page is filled in by the browser; see "Stock market data". Do NOT touch `#review`, `#fresh`, `#usBoard` or any `.q-thesis` / `.px-row` line: all are JS-generated. |
| **`potential.html`** | **`hdate` date line + `.upd-stamp` timestamp** (format: `⟳ 时间戳更新 · YYYY-MM-DD HH:MM SGT · 内容每周一深度研究刷新`) |

## Stock market data — written by a script, not by the refresh

`scripts/update_quotes.py` fetches one year of daily bars and dividends from Yahoo Finance for every `.tk` ticker on `stocks.html` and writes `data/quotes.json` plus `data/quotes.js` (the same data as `window.STOCK_QUOTES`). `.github/workflows/quotes.yml` runs it at 08:20 SGT Tue–Sat and 17:40 SGT Mon–Fri. `assets/stocks-live.js` then fills the page from it in the browser:

- `.q-px` / `.q-chg` on the SG/MY quote cards, `.js-sg-time` / `.js-my-time`, the five `.deep` cards (`.deep-px`, 52-week low and high, dividend yield, `.range52`), the price line on each `.stock` card, radar 动能 (index 4), the first date in the footer `.upd-stamp`, the review table, both rankings, the totals strip and the market comparison.
- The numbers typed into the HTML for those fields are only a fallback for when the data file fails to load. Do not spend time editing them.
- Each quote has `price`, `prev`, `chg` (% against the previous close), `date` (the trading day), `hi52`, `lo52`, `pos52` (0–100 position inside the 52-week range), `r1m`, `r3m`, `ytd` (% returns), `divTtm` and `yield` (dividends paid in the last 12 months, and that as a % of price). Keys are the page's own tickers: `NVDA`, `SGX:D05`, `KLSE:1155`.
- When writing or reviewing research text, read `data/quotes.json` for the facts and make the text agree with it: a card must not quote a price, yield or 52-week position that contradicts the data. Do not fetch Yahoo for these from the cloud session; it is blocked there.
- To add or remove a stock, add or remove its `.stock` card (with its `.tk`); the script and the review table follow. A new SG/MY stock also needs a `.q-card` whose `data-symbol` equals that `.tk`.

## Gold facts — written by a script, quoted by the refresh

`.github/workflows/market.yml` runs two scripts every 15 minutes from Monday to Friday (every 6 hours at the weekend), and whenever a push changes `data/refresh-request.txt`. GitHub's timer has proved unreliable for this repo, so the daily refresh asks for fresh files itself: it writes the time into `data/refresh-request.txt`, pushes, and waits for the `Market facts` commit before reading. That file is the one thing under `data/` the refresh may write.

The scripts:

- `scripts/update_gold.js` runs the report page's own engine on real spot gold and writes `data/xau-state.json`: `price` (close of the last finished 15-minute candle, with `priceTime`), `today` (open, high, low and change since the previous close; the trading day rolls at 17:00 New York), `previousDay`, `thisWeek`, `previousWeek`, `verdict` (the same answer `report.html` shows), `plan` (only when the verdict is "go"), `watch` (the prices that would change the verdict), `timeframes` (per timeframe: `trend`, `since`, `rsi`, `atr`, EMAs, `range`, `lastBreak`, the price that would turn it), `resistance` and `support`.
- `scripts/update_news.py` writes `data/news.json`: the latest gold headlines (FXStreet, Investing.com, Google News limited to market publishers), original language with links. news.html shows them under "实时头条" through `assets/news-live.js`. The refresh may use them as leads for its five news items, checking each with WebSearch.
- `scripts/update_calendar.py` writes `data/calendar.json`: this week's US releases of medium or high impact, times already in Singapore time, with forecast and previous values.

Rules for the refresh when it writes `daily.html` and `risk.html`:

- Take every gold number from `data/xau-state.json`: the price, today's and yesterday's range, each timeframe's direction and RSI, the support and resistance levels. Do not take a price, level or indicator reading from a web search result. If the file's `updated` time is more than 6 hours old, say on the page that the figures are as of that time.
- The direction call follows `verdict`. The site's trading rule is: trade only when the weekly, daily and 4-hour trends agree, enter when the 1-hour and 15-minute agree too, stop 3 x the 1-hour ATR, target 3R or a trailing stop. `data/xau-backtest.json` has the replay behind it (2011-02 to 2026-10, real spot gold; quote its numbers from that file, not from memory). Do not write an entry plan that goes against `verdict`, and do not present tighter stops or "buy the dip in the zone" entries as the plan: the replay found no edge in them.
- The two `.risk-list li` lines in `daily.html` keep their shape. When `plan` is present, write the matching side from it: `多头入场方案：现价 $X 附近顺势做多，止损$X，TP1: $X` (or `空头入场方案：…`). For a side with no plan, write `多头入场方案：暂无。<verdict 的一句话原因>` with no dollar figure before the reason, so the report page does not offer it as a preset.
- Take calendar rows from `data/calendar.json` (dates, weekdays and times as given there). Use WebSearch for what the search is good at: why gold moved, what the releases showed, what the Fed said.

## Site layout (2026-10-23)

The navbar on every page is: 🥇 黄金 (`report.html`) · ₿ 比特币 (`btc.html`) · 📒 盈亏日历 · 📖 策略 · 📈 股票 · 🚀 潜力精选.
`report.html` is the one gold page: the live answer and plan, then the written brief in tabs ("分析 · 消息 · 日历"),
which shows `daily.html`, `news.html` and `risk.html` in frames. Those three pages are still what the refresh writes
and still open on their own; each loads `assets/embed.js` in `<head>`, which hides their own navbar and live bar when
they are inside the gold page. Keep that script tag. The home page's news and calendar tiles open
`report.html#read-news` and `report.html#read-risk`.

Phones (checked 2026-10-26 at 360 and 390 px wide, no page scrolls sideways): each page's `<style>` ends with phone rules
(`max-width:640px`): nothing under 11px, the navbar on one line, buttons about 36px tall, inputs 16px so iOS does not zoom.
`risk.html`'s `table.cal` becomes one card per row on phones, so every calendar row keeps its three cells (date and time,
impact, event). On `report.html` / `btc.html` the answer card shows the price, gauge and lights right after the answer, and
wide tables (`.tablewrap.stk`) become cards labelled from their header row.

## Live page — never edited by the refresh

The daily, news and risk pages open with a live bar (`<div id="gold-bar">`, filled by `assets/gold-bar.js` from `data/xau-state.json`, `data/calendar.json` and the live price from `assets/gold-live.js`): the current verdict, the price now, the level that would change the answer and the next US release. The refresh must leave that div and the `<div id="news-live">` on news.html empty and in place.

The written text is then marked against the live price in the browser, without being changed:

- `daily.html` (`assets/daily-live.js`): a note in `<div id="since-note">` (leave it empty) says when the text was written and at what price, how far price has moved since, which of the page's levels it has crossed, which timeframes have turned and whether the verdict is still the one the text gives. It reads the date and the first `HH:MM SGT` in `hdate` as the writing time, the `当前` row of the S/R table (`.lvl-type.P`) as the price the text was written at, the first `.badge` after `.biaslabel` (`结论：…`) as the written verdict, and the `.sig` of each `.tf-table` row as the written trend. So: keep the `当前` row's price equal to the state file's `price`, keep the S/R table ordered from the highest level to the lowest, and keep `结论：<tag>` at the start of the first bias badge. The S/R table's `.dist-tag` cells are recomputed from the live price.
- The cards on `daily.html` carry an `id` and `data-fold` (used by the section links and the fold buttons). Keep both; write text only, as everywhere.
- `news.html` and `risk.html` (`assets/levels-live.js`): in `.lvls`, the box whose `.k` contains `现价` holds the price the text was written at (first `$` figure in its `.v`); the other boxes get "已跌破 / 已突破" marks and the distance to their nearest level.

`report.html` (4H 多周期报告与交易计划) computes everything in the visitor's browser, so it has no data values to refresh:

- `assets/xau-feed.js` gets the candles: real spot XAU/USD from Dukascopy's chart feed (JSONP, not a documented API), with days cut at 17:00 New York like an MT5 broker chart and the weekend removed. If that feed does not answer it falls back to Binance PAXG/USDT moved onto the spot price and the page says so. The tick-by-tick price is the Binance PAXG stream, which trades $10-15 above spot; the gap is measured at each refresh by matching spot's last ~20 one-minute closes (Dukascopy, bid) with PAXG's one-minute closes and taking the middle value. `api.gold-api.com` is only the fallback: on 2026-10-23 it moved every 30 seconds and was up to $2 off spot, while the matched-minute price stayed within about $0.50 of Swissquote's live bid. `assets/gold-live.js` does the same for the daily, news, risk and home pages (one spot-minutes request per page view and per 15 minutes). The feed turns away clients that identify as automated (HTTP 429 "Bot blocked", seen 2026-10-14 for curl's and headless Chrome's user agents), so test the page through the fallback (`XauFeed.load({ source: "paxg" })`), not against the spot feed. An open tab asks it for candles once per closed 15-minute candle; do not add polling.
- `assets/xau-engine.js` (engine id `xau-mtf-2`) reads the candles: structure trend per timeframe, gaps, patterns, and how many timeframes agree.
- `assets/xau-plan.js` turns that into the verdict, the plan (stop 3 x 1H ATR, target 3R or trailing stop), position size and the checklist. It is pure and loads in Node. `verdict()` also returns `next`, the answer as numbered steps (what to do now, which close to wait for, what the trade will look like, what to do with a trade already on); the page shows them under "现在该做什么". The rule itself lives in `regime()`, `flipLevel()` and `systemPlan()`: changing those means running the replay again, changing wording does not. A signal that has already run is still offered with a plan from the price now: entering later, with the stop set 3 x ATR from that price, did about as well in the replay (`rules.late1r` in both replay files, checked 2026-10-24 with `research/xau-replay/robust_check.js`); do not write "too late, don't chase" for it. The replay tested two ways out, each on its own, and every text on the site keeps them apart: target 3R (stop and target fixed, a change in the big trends is not an exit) and trailing stop (no target, stop moved once a day at 08:00 SGT to 2R behind the best price, exit when the weekly, daily and 4-hour trends stop agreeing).
- `data/xau-backtest.json` holds the replay results the rule was chosen on. The page does not show them: on 2026-10-14 the owner asked for the tab (now "成绩记录") to show only real records, their own trades from `journal.html` and the live paper record. `research/xau-replay/` has the tools that produce it and a README on how the rule was chosen. The page and the replay run the same engine and plan files: after changing either, run the replay again before trusting the numbers on the page.
- Score and lights are worked out in the browser from the candles: the gauge shows the sum written out (W 3, D 3, 4H 2, 1H 1, 15M 1 per direction) and the candle it was computed on; each light shows when that trend began and the close that would turn it. Nothing on the page is typed in.
- On the backup feed (PAXG) the page compares its answer with the last spot answer in `data/xau-state.json`; when they differ it heads the answer "备用数据 · 待确认", and offers no one-click plan. PAXG structure can differ from spot (2026-10-22: 4H down on PAXG, up on spot).
- 我的持仓: after "我已入场" the page follows one open position in the visitor's browser (localStorage `xau4h.pos`): live profit and loss, where the replay's rule moves the stop each day at 08:00 SGT (`XauPlan.manage`), and when to leave. Closing it can write the result into the P&L calendar (`pnl.v1`).
- 问 Claude (`#ask`): the visitor's question plus the page's live state written out as plain facts (price, verdict, the five timeframes and their turning prices, the plan, calendar, `data/news.json` headlines, the paper record, and the visitor's tracked position and balance when they tick the box) opens in claude.ai through `https://claude.ai/new?q=`, and is also copied. Nothing is sent before the button is pressed; the visitor's own Claude account answers. The live bar on the other pages links to it. No API key is kept anywhere.
- 形态 (chart patterns): `XauPlan.patternsNow()` lists the patterns finished on the daily, 4-hour and 1-hour charts; the answer shows them in a fourth box next to 大方向 / 小周期 / 时机, as reference only, and adds a caution step when a finished pattern points against a live signal. `research/xau-replay/pattern_check.js` found no edge in patterns alone or as a filter (`patterns` in both replay files); do not present a pattern as a reason to trade.
- 按现价预估 (`#v-pre`, under the lights): when the live price already stands beyond a timeframe's turning close, the page says so, when that candle closes, and what the answer would become if it closed there. The rule itself still decides on closed candles only; the preview is never alerted.
- 趋势变化 (`#changes`): every timeframe flip, newest first, with the close that caused it and what the five trends looked like after. The history comes from the paper-record file (`changes` in `data/xau-signals.json` / `data/btc-signals.json`: `scripts/xau_track.js` compares the trends at every 15-minute close, also while no page is open, and looked back 5 days when it was added); the page adds flips newer than the record's last check.
- Notifications: browser notifications only, asked for by the owner on 2026-10-23 (new signals, then also trend changes). They are on by default (owner's request, 2026-10-23): the page asks the browser's permission on load or at the first click, once per site, so gold and Bitcoin share it; the 🔔 panel under the answer (`#v-alert`) can switch them off, with ticks for: a new 可以顺势做多 / 做空 signal, the answer changing, the weekly / daily / 4-hour turning, the 1-hour / 15-minute turning (off by default). The chime is a short WAV the page makes (each market its own) played by an `<audio>` element; on load the page tries it silently to learn whether sound is allowed. In a normal tab a browser reload needs one click before it can sound (browser rule; a corner chip says so). Installed as an app (`manifest.webmanifest`, icons in `assets/icon-*.png`, linked from every page) Chrome allows sound without a click, so the owner was pointed to installing it. All of this works while the page is open; with it on, a background tab keeps recomputing after each 15-minute close (still one candle request per quarter hour). The answer the page opened with is the baseline, and each signal alerts once across tabs (localStorage `xau4h.notified`). On 2026-10-22 the owner had all other alerts removed (GitHub issue comments, the outside timer that needed tokens): do not add those back or suggest a timer.
- `data/xau-signals.json` is the live record: an hourly job (`scripts/xau_track.js`) opens a paper trade at every "go" signal and follows it to its stop or target. It shows at the top of the 回放成绩 tab. The refresh may quote its `summary`.
- At view time the page also reads `data/calendar.json` (falling back to `risk.html`'s `table.cal` rows: `.cal-date`, `.cal-time` as `HH:MM SGT`, `.imp`, `.cal-event`, a `✓` marking finished events) and `daily.html` (the two `.risk-list li` lines `多头入场方案：…` and `空头入场方案：…`). Keep those class names and that line shape when refreshing those pages.
- `data/xau-report.json` is an old one-off snapshot of the "XAU 4-Hour Report" artifact (https://claude.ai/artifact/SLbPQauRyYqyvv3RVU9vHS). The page hides it once it is more than a day old.

`journal.html` (盈亏日历) is the visitor's own profit and loss diary. Everything on it is typed in by the visitor and kept in their browser (localStorage key `pnl.v1`); the page has no data values to refresh.

`btc.html` (比特币) is the same page for Bitcoin: `report.html` and `btc.html` both run `assets/market-page.js`, and
everything that differs comes from `window.MARKET` in each page (gold's values are the defaults). Bitcoin's candles and
live price come from Binance BTC/USDT through `assets/btc-feed.js` (UTC days, never shut, no calibration needed). The
rule is gold's, unchanged; `data/btc-backtest.json` (`research/xau-replay/report_btc.js`, Binance 1-minute history
2017-08 to 2026-10, scored from 2018-10-08) found its edge on Bitcoin unclear: +0.13R a trade with a range that
includes zero, positive in 2018-2020, about flat in 2021-2023, negative since 2024, shorts negative. `btc.html` shows
that card and words its verdict from that file (`XauPlan.setMarket`, `BtcFeed.replayWords`); do not describe a Bitcoin
signal with gold's replay. `scripts/update_btc.js` (market job) writes `data/btc-state.json` (home page tile) and
`data/btc-signals.json` (Bitcoin's own paper record, started 2026-10-23 19:30 SGT).

The refresh routine must NOT edit `report.html`, `btc.html`, `journal.html`, `assets/`, `data/` (except `data/refresh-request.txt`), `scripts/`, `research/` or `.github/`. Every page's navbar links to `report.html` and `journal.html`; keep those links.

## Weekly deep refresh — Monday only

`stocks.html` full content review, using `data/quotes.json` for every market fact: on each `.stock` card the `<p>` thesis, `.metric`, `.risk-tag`, `.score-v` and the matching `.score-fill` width; on the five `.deep` cards the text columns, market cap and P/E; on each market tab the bull / bear / catalyst cards and the AI synthesis; and the one-line summary. When that is done, set the second date in the footer `.upd-stamp` to today.  
`potential.html` full stock research content (target prices, bull/bear lists, scores).

---

## Critical rules

- **NEVER** change HTML structure / CSS / JS — text and data values only.
- **NEVER** use Google Finance (blocked). For numbers, read the data files above; they are written from Yahoo Finance and the gold feed by scripts. Use WebSearch for news and context.
- **Yahoo Finance fetch method** (this is what `scripts/update_quotes.py` does)**:** use the chart API, not the rendered quote page — `curl -s "https://query1.finance.yahoo.com/v8/finance/chart/TICKER?interval=1d&range=10d" -H "User-Agent: Mozilla/5.0"`. Compute price/% change from the **last two non-null entries in the response's `timestamp` / `indicators.quote[0].close` arrays** — never from `meta.previousClose` or `meta.regularMarketPrice`, which can reference a stale/inconsistent baseline (confirmed case: 0166.KL showed +10.36% via meta fields vs. the correct +1.66% from the close array).
- Keep old values on API/fetch error — never blank a field.
- **Weekday labels anywhere on the site** (e.g. "7/31（周四）", "8/4（周一）") must be computed from the real calendar, not assumed — a July 31 / Aug 4 mislabeling bug shipped once already (Aug 4 2026 is a Tuesday, not Monday; the real next Monday was Aug 3). When writing a date+weekday pair, double check the weekday against the actual computed date rather than pattern-matching nearby text.
- Radar `drawRadar(...)` calls: index 4 (动能) is computed in the browser from the quote data, so leave it. The other five values change only in the Monday deep refresh. Never touch render code.
- `stocks.html` footer `.upd-stamp` exact format: `⟳ 价格更新 · YYYY-MM-DD · 评分与研究文本上次深度刷新于 YYYY-MM-DD，待下次周一 · 价格与收益率为近似参考值`. The first date is overwritten in the browser from the quote data; leave it. The second is the last Monday deep refresh that actually rewrote scores and research text; move it forward only when that happened in this run.
- Commit message: `Auto-refresh YYYY-MM-DD HH:MM SGT: [one-line summary]`
- **ALWAYS** `git add daily.html news.html risk.html index.html stocks.html potential.html && git commit && git push origin main`
- **NEVER** push to `claude/*` branches — only `main`.
- On push rejection: `git fetch origin && git rebase origin/main && git push origin main`
- On conflicts: `git checkout --theirs -- *.html && git add -A && git rebase --continue`
- Verify: `git log origin/main --oneline -1`
- TIME BUDGET: if elapsed nears 18 min, stop fetching, commit what you have, push. Partial push beats no push.
