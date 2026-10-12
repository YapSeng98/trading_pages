# XAUUSD 黄金交易中心 · Gold Trading Hub

每日黄金（XAUUSD）盘面分析与交易策略参考站。纯静态网站，可直接用 GitHub Pages 托管。

## 页面

| 文件 | 说明 |
|------|------|
| [`index.html`](index.html) | 首页 · 导航中心 |
| [`daily.html`](daily.html) | **每日深度分析**（主功能，每日更新）— 技术结构、支撑阻力、基本面、操作场景、风险预案 |
| [`report.html`](report.html) | **4H 多周期报告与交易计划** — 浏览器端用现货金 K 线实时计算 W / D / 4H / 1H / 15M 的方向；五个周期同向才给出入场方案，并算好手数、检查项与到价提醒。规则的依据是 2010 年以来的真实金价回放，结果在页面的「回放成绩」里（引擎见 `assets/`，回放工具见 `research/xau-replay/`） |
| [`news.html`](news.html) | 市场快讯 — 最新黄金消息聚合、明日关键价位、来源链接 |
| [`risk.html`](risk.html) | 未来风险与计划 — ForexFactory 经济日历、前瞻情景、分阶段交易计划、风险铁律 |
| [`strategy.html`](strategy.html) | 策略与形态手册 — 9 形态图鉴、4 套策略、K 线信号、交易心法 |

**股票行情**：`stocks.html` 的价格、涨跌、52 周区间和股息率来自 `data/quotes.json`，由 `scripts/update_quotes.py`（Yahoo Finance 日线）生成，GitHub Actions 工作流 `.github/workflows/quotes.yml` 每个交易日运行两次；页面由 `assets/stocks-live.js` 在浏览器里填入。手动更新：`python3 scripts/update_quotes.py`。

**黄金数据**：`report.html` 的 K 线是现货金 XAU/USD（Dukascopy 公开图表数据，按纽约 17:00 换日），连不上时改用 Binance 的 PAXG 并提示。`.github/workflows/market.yml` 每 4 小时用同一套引擎生成 `data/xau-state.json`（价位、各周期方向、结论）和 `data/calendar.json`（本周美国数据），每日刷新任务的数字都取自这两个文件。手动更新：`node scripts/update_gold.js`、`python3 scripts/update_calendar.py`。

**实时金价**：所有带价格的页面通过浏览器端 fetch（`api.gold-api.com`，免费无密钥，CORS 开放）实时刷新，每 60 秒更新一次。首页与每日页另含 TradingView 实时图表/报价组件。

## 本地预览

直接用浏览器打开 `index.html` 即可，无需构建。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选择 `main` 分支 `/ (root)`，保存后访问
`https://<用户名>.github.io/<仓库名>/`。

## 自动刷新（Cloud Agent）

网站文字内容由一个 Claude Code **云端定时任务**（CCR routine）自动刷新，无需手动操作。

- **频率**：每天一次，新加坡时间 10:10
- **Cron**：`10 2 * * *`（UTC）
- **流程**：云端 agent 读取仓库里的数据文件（`data/xau-state.json`、`data/calendar.json`、`data/quotes.json`）取得所有数字，联网搜索只用来了解行情背后的原因，然后更新 `daily.html` / `risk.html` / `stocks.html` / `potential.html` 的文字并推送到 `main`。周一另做一次股票研究内容的深度刷新。规则见 `CLAUDE.md`
- **更新凭证**：首页页脚显示 `⟳ 自动刷新 · 最后更新 YYYY-MM-DD HH:MM SGT`，可据此确认上次刷新时间
- **管理**：https://claude.ai/code/routines/trig_01LkvxUQJ5hfe3EJacyN5Zrf （查看运行记录、改时间、停用）

> 注意：实时金价与 TradingView 图表始终为浏览器端实时数据，与定时任务无关；定时任务刷新的是**文字分析内容**。

## 手动更新流程（备用）

若需手动刷新而非等待定时任务：

1. 用新的当日分析替换 `daily.html` 的正文内容
2. 更新 `index.html` 顶部的价格、偏向标签与日期、页脚时间戳
3. 提交并推送：`git add -A && git commit -m "Update daily analysis" && git push`

## 免责声明

本站内容仅供参考，不构成投资建议。XAUUSD 交易具有高风险，可能导致本金损失。
