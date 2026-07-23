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
| `stocks.html` | 18 q-cards (`.q-px` / `.q-chg`), per-country radar 动能 (index 4 only), timestamps `.js-sg-time` / `.js-my-time` |
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
- Keep old values on API/fetch error — never blank a field.
- GOLD7 array: first run of new SGT day → append yesterday's close + remove oldest; same-day → update last entry's `v` only.
- Radar `drawRadar(...)` calls: update index-4 (动能) value only. Never touch render code.
- Footer `.upd` exact format: `⟳ 自动刷新 · 最后更新 YYYY-MM-DD HH:MM SGT · 图表报价实时`
- Commit message: `Auto-refresh YYYY-MM-DD HH:MM SGT: [one-line summary]`
- **ALWAYS** `git add daily.html news.html risk.html index.html stocks.html potential.html && git commit && git push origin main`
- **NEVER** push to `claude/*` branches — only `main`.
- On push rejection: `git fetch origin && git rebase origin/main && git push origin main`
- On conflicts: `git checkout --theirs -- *.html && git add -A && git rebase --continue`
- Verify: `git log origin/main --oneline -1`
- TIME BUDGET: if elapsed nears 18 min, stop fetching, commit what you have, push. Partial push beats no push.
