# Trading Pages — Auto-Refresh Instructions

This repo is a static GitHub Pages trading site at https://yapseng98.github.io/trading_pages/.  
A scheduled Claude Code session refreshes data every ~3 hours.

---

## Pages updated EVERY run (Steps 3–4)

| File | What to update |
|------|----------------|
| `daily.html` | hdate chip, hprice-chg, bias bar, snapshot, S/R table, scenarios, session plan, calendar, multi-timeframe table |
| `news.html` | hdate, price chip (`<!--LIVEPRICE-->` markers), hprice-chg, TL;DR, 5 news items, key levels |
| `risk.html` | hdate, calendar rows, scenario probabilities (`.scen-prob`), staged plan |
| `index.html` | Main tile chips, news tile chip, risk tile chip, footer `.upd`, Market Pulse (`#pulse-dxy` / `#pulse-fed` / `#pulse-event` / `#pulse-event-d` / `#pulse-gold` / `#pulse-list` 3×`<li>`), GOLD7 array |
| `stocks.html` | 18 SG/MY q-cards (`.q-px` / `.q-chg`), per-country radar 动能 (index 4 only), timestamps `.js-sg-time` / `.js-my-time`. Do NOT touch `#usBoard` (🇺🇸 US 速览板) or any `.q-thesis` line — both are 100% JS-generated from `.stock`/`.score-v`/`.risk-tag`/`<p>` content that already exists elsewhere on the page; they update themselves automatically whenever that source content changes. |
| **`potential.html`** | **`hdate` date line + `.upd-stamp` timestamp** (format: `⟳ 时间戳更新 · YYYY-MM-DD HH:MM SGT · 内容每周一深度研究刷新`) |

## Pages updated only at 09:00 SGT run

| File | What to update |
|------|----------------|
| `stocks.html` | Deep-dive `.deep` cards (5 cards: NVDA, D05, O39, 6742, 1155) — `.deep-px` price + `.range52` position % |

## Weekly deep refresh — Monday 09:00 SGT only

`stocks.html` full card content review.  
`potential.html` full stock research content (target prices, bull/bear lists, scores).

---

## Critical rules

- **NEVER** change HTML structure / CSS / JS — text and data values only.
- **NEVER** use Google Finance (blocked). Use Yahoo Finance (primary), klsescreener.com, or WebSearch.
- **Yahoo Finance fetch method:** use the chart API, not the rendered quote page — `curl -s "https://query1.finance.yahoo.com/v8/finance/chart/TICKER?interval=1d&range=10d" -H "User-Agent: Mozilla/5.0"`. Compute price/% change from the **last two non-null entries in the response's `timestamp` / `indicators.quote[0].close` arrays** — never from `meta.previousClose` or `meta.regularMarketPrice`, which can reference a stale/inconsistent baseline (confirmed case: 0166.KL showed +10.36% via meta fields vs. the correct +1.66% from the close array).
- Keep old values on API/fetch error — never blank a field.
- **GOLD7 array (`index.html`, `var GOLD7=`) — this has broken before, follow exactly:**
  1. Compute TODAY as `M/D` (no leading zeros) from the **real `TZ='Asia/Singapore' date` shell output this run** — NEVER from a date mentioned in a news article or search result.
  2. If the array's LAST entry's `d` already equals TODAY, only update its `v`. Otherwise APPEND `{d:"TODAY", v:price}` using that real date string (even if several days were skipped since the last run — do not backfill/guess the gap, just add the one real new point).
  3. Trim from the FRONT until exactly 7 entries remain.
  4. Before saving: every `d` must be in ascending order and every date must be traceable to a real shell clock output from some past run — if you can't justify a date, drop that entry rather than guess.
- **Weekday labels anywhere on the site** (e.g. "7/31（周四）", "8/4（周一）") must be computed from the real calendar, not assumed — a July 31 / Aug 4 mislabeling bug shipped once already (Aug 4 2026 is a Tuesday, not Monday; the real next Monday was Aug 3). When writing a date+weekday pair, double check the weekday against the actual computed date rather than pattern-matching nearby text.
- Radar `drawRadar(...)` calls: update index-4 (动能) value only. Never touch render code.
- Footer `.upd` exact format: `⟳ 自动刷新 · 最后更新 YYYY-MM-DD HH:MM SGT · 图表报价实时`
- Commit message: `Auto-refresh YYYY-MM-DD HH:MM SGT: [one-line summary]`
- **ALWAYS** `git add daily.html news.html risk.html index.html stocks.html potential.html && git commit && git push origin main`
- **NEVER** push to `claude/*` branches — only `main`.
- On push rejection: `git fetch origin && git rebase origin/main && git push origin main`
- On conflicts: `git checkout --theirs -- *.html && git add -A && git rebase --continue`
- Verify: `git log origin/main --oneline -1`
- TIME BUDGET: if elapsed nears 18 min, stop fetching, commit what you have, push. Partial push beats no push.
