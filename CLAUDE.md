# Trading Pages — Auto-Refresh Instructions

This repo is a static GitHub Pages trading site at https://yapseng98.github.io/trading_pages/.  
A scheduled Claude Code session refreshes the written content once a day at 09:00 SGT.  
Stock prices are not its job: a GitHub Actions workflow writes them to `data/quotes.json` (see "Stock market data").

---

## Pages updated EVERY run (Steps 3–4)

| File | What to update |
|------|----------------|
| `daily.html` | hdate chip, hprice-chg, bias bar, snapshot, S/R table, scenarios, session plan, calendar, multi-timeframe table |
| `news.html` | hdate, price chip (`<!--LIVEPRICE-->` markers), hprice-chg, TL;DR, 5 news items, key levels |
| `risk.html` | hdate, calendar rows, scenario probabilities (`.scen-prob`), staged plan |
| `index.html` | Main tile chips, news tile chip, risk tile chip, footer `.upd`, Market Pulse (`#pulse-dxy` / `#pulse-fed` / `#pulse-event` / `#pulse-event-d` / `#pulse-gold` / `#pulse-list` 3×`<li>`), GOLD7 array |
| `stocks.html` | `hdate` date line only, exactly `YYYY年M月D日（星期X）HH:MM SGT&ensp;·&ensp;GMT+8 &ensp;·&ensp; 美国 / 新加坡 / 马来西亚 三大市场 · 成长股与股息股分类` with nothing appended (the page has its own data-freshness bar). Every market number on this page is filled in by the browser; see "Stock market data". Do NOT touch `#review`, `#fresh`, `#usBoard` or any `.q-thesis` / `.px-row` line: all are JS-generated. |
| **`potential.html`** | **`hdate` date line + `.upd-stamp` timestamp** (format: `⟳ 时间戳更新 · YYYY-MM-DD HH:MM SGT · 内容每周一深度研究刷新`) |

## Stock market data — written by a script, not by the refresh

`scripts/update_quotes.py` fetches one year of daily bars and dividends from Yahoo Finance for every `.tk` ticker on `stocks.html` and writes `data/quotes.json` plus `data/quotes.js` (the same data as `window.STOCK_QUOTES`). `.github/workflows/quotes.yml` runs it at 08:20 SGT Tue–Sat and 17:40 SGT Mon–Fri. `assets/stocks-live.js` then fills the page from it in the browser:

- `.q-px` / `.q-chg` on the SG/MY quote cards, `.js-sg-time` / `.js-my-time`, the five `.deep` cards (`.deep-px`, 52-week low and high, dividend yield, `.range52`), the price line on each `.stock` card, radar 动能 (index 4), the first date in the footer `.upd-stamp`, the review table, both rankings, the totals strip and the market comparison.
- The numbers typed into the HTML for those fields are only a fallback for when the data file fails to load. Do not spend time editing them.
- Each quote has `price`, `prev`, `chg` (% against the previous close), `date` (the trading day), `hi52`, `lo52`, `pos52` (0–100 position inside the 52-week range), `r1m`, `r3m`, `ytd` (% returns), `divTtm` and `yield` (dividends paid in the last 12 months, and that as a % of price). Keys are the page's own tickers: `NVDA`, `SGX:D05`, `KLSE:1155`.
- When writing or reviewing research text, read `data/quotes.json` for the facts and make the text agree with it: a card must not quote a price, yield or 52-week position that contradicts the data. Do not fetch Yahoo for these from the cloud session; it is blocked there.
- To add or remove a stock, add or remove its `.stock` card (with its `.tk`); the script and the review table follow. A new SG/MY stock also needs a `.q-card` whose `data-symbol` equals that `.tk`.

## Live page — never edited by the refresh

`report.html` (4H 多周期报告与交易计划) computes everything in the visitor's browser, so it has no data values to refresh:

- `assets/xau-engine.js` pulls PAXG/USDT candles from `data-api.binance.vision` and runs the multi-timeframe structure engine. It mirrors `engine.js` of the "XAU 4-Hour Report" artifact (engine id `xau-mtf-1`); if that engine changes, copy the analysis functions across and keep the cross-origin `XAU_API` fetch.
- `assets/xau-plan.js` derives key levels, entry candidates, position size and the pre-trade checklist. It is pure and can be loaded in Node to test the maths.
- At view time the page also reads `risk.html` (`table.cal` rows: `.cal-date`, `.cal-time` as `HH:MM SGT`, `.imp`, `.cal-event`, a `✓` marking finished events) and `daily.html` (the two `.risk-list li` lines `多头入场方案：…止损$X，TP1: $X，TP2: $X` and `空头入场方案：…`). Keep those class names and that line shape when refreshing those pages.
- `data/xau-report.json` is a snapshot of the newest document in the `reports` collection of that artifact (https://claude.ai/artifact/SLbPQauRyYqyvv3RVU9vHS) without its `charts` field. To refresh it: read the document with the ArtifactData tool, drop `charts`, write the file, commit. The page folds the write-up away as "may be outdated" once it is over 12 hours old.

The refresh routine must NOT edit `report.html`, `assets/`, `data/`, `scripts/` or `.github/`. Every page's navbar links to `report.html`; keep that link.

## Weekly deep refresh — Monday 09:00 SGT only

`stocks.html` full content review, using `data/quotes.json` for every market fact: on each `.stock` card the `<p>` thesis, `.metric`, `.risk-tag`, `.score-v` and the matching `.score-fill` width; on the five `.deep` cards the text columns, market cap and P/E; on each market tab the bull / bear / catalyst cards and the AI synthesis; and the one-line summary. When that is done, set the second date in the footer `.upd-stamp` to today.  
`potential.html` full stock research content (target prices, bull/bear lists, scores).

---

## Critical rules

- **NEVER** change HTML structure / CSS / JS — text and data values only.
- **NEVER** use Google Finance (blocked). Use Yahoo Finance (primary), klsescreener.com, or WebSearch.
- **Yahoo Finance fetch method** (this is what `scripts/update_quotes.py` does)**:** use the chart API, not the rendered quote page — `curl -s "https://query1.finance.yahoo.com/v8/finance/chart/TICKER?interval=1d&range=10d" -H "User-Agent: Mozilla/5.0"`. Compute price/% change from the **last two non-null entries in the response's `timestamp` / `indicators.quote[0].close` arrays** — never from `meta.previousClose` or `meta.regularMarketPrice`, which can reference a stale/inconsistent baseline (confirmed case: 0166.KL showed +10.36% via meta fields vs. the correct +1.66% from the close array).
- Keep old values on API/fetch error — never blank a field.
- **GOLD7 array (`index.html`, `var GOLD7=`) — this has broken before, follow exactly:**
  1. Compute TODAY as `M/D` (no leading zeros) from the **real `TZ='Asia/Singapore' date` shell output this run** — NEVER from a date mentioned in a news article or search result.
  2. If the array's LAST entry's `d` already equals TODAY, only update its `v`. Otherwise APPEND `{d:"TODAY", v:price}` using that real date string (even if several days were skipped since the last run — do not backfill/guess the gap, just add the one real new point).
  3. Trim from the FRONT until exactly 7 entries remain.
  4. Before saving: every `d` must be in ascending order and every date must be traceable to a real shell clock output from some past run — if you can't justify a date, drop that entry rather than guess.
- **Weekday labels anywhere on the site** (e.g. "7/31（周四）", "8/4（周一）") must be computed from the real calendar, not assumed — a July 31 / Aug 4 mislabeling bug shipped once already (Aug 4 2026 is a Tuesday, not Monday; the real next Monday was Aug 3). When writing a date+weekday pair, double check the weekday against the actual computed date rather than pattern-matching nearby text.
- Radar `drawRadar(...)` calls: index 4 (动能) is computed in the browser from the quote data, so leave it. The other five values change only in the Monday deep refresh. Never touch render code.
- Footer `.upd` exact format: `⟳ 自动刷新 · 最后更新 YYYY-MM-DD HH:MM SGT · 图表报价实时`
- `stocks.html` footer `.upd-stamp` exact format: `⟳ 价格更新 · YYYY-MM-DD · 评分与研究文本上次深度刷新于 YYYY-MM-DD，待下次周一 · 价格与收益率为近似参考值`. The first date is overwritten in the browser from the quote data; leave it. The second is the last Monday deep refresh that actually rewrote scores and research text; move it forward only when that happened in this run.
- Commit message: `Auto-refresh YYYY-MM-DD HH:MM SGT: [one-line summary]`
- **ALWAYS** `git add daily.html news.html risk.html index.html stocks.html potential.html && git commit && git push origin main`
- **NEVER** push to `claude/*` branches — only `main`.
- On push rejection: `git fetch origin && git rebase origin/main && git push origin main`
- On conflicts: `git checkout --theirs -- *.html && git add -A && git rebase --continue`
- Verify: `git log origin/main --oneline -1`
- TIME BUDGET: if elapsed nears 18 min, stop fetching, commit what you have, push. Partial push beats no push.
