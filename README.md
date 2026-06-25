# XAUUSD 黄金交易中心 · Gold Trading Hub

每日黄金（XAUUSD）盘面分析与交易策略参考站。纯静态网站，可直接用 GitHub Pages 托管。

## 页面

| 文件 | 说明 |
|------|------|
| [`index.html`](index.html) | 首页 · 导航中心 |
| [`daily.html`](daily.html) | **每日深度分析**（主功能，每日更新）— 技术结构、支撑阻力、基本面、操作场景、风险预案 |
| [`news.html`](news.html) | 市场快讯 — 最新黄金消息聚合、明日关键价位、来源链接 |
| [`risk.html`](risk.html) | 未来风险与计划 — ForexFactory 经济日历、前瞻情景、分阶段交易计划、风险铁律 |
| [`strategy.html`](strategy.html) | 策略与形态手册 — 9 形态图鉴、4 套策略、K 线信号、交易心法 |

**实时金价**：所有带价格的页面通过浏览器端 fetch（`api.gold-api.com`，免费无密钥，CORS 开放）实时刷新，每 60 秒更新一次。首页与每日页另含 TradingView 实时图表/报价组件。

## 本地预览

直接用浏览器打开 `index.html` 即可，无需构建。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选择 `main` 分支 `/ (root)`，保存后访问
`https://<用户名>.github.io/<仓库名>/`。

## 自动刷新（Cloud Agent）

网站文字内容由一个 Claude Code **云端定时任务**（CCR routine）自动刷新，无需手动操作。

- **频率**：每 3 小时一次（SGT 00:00 / 03:00 / 06:00 / 09:00 / 12:00 / 15:00 / 18:00 / 21:00）
- **Cron**：`0 1,4,7,10,13,16,19,22 * * *`（UTC）
- **流程**：每次运行时云端 agent 会
  1. `git checkout -B claude/auto-refresh origin/main` 同步到最新 main
  2. 联网抓取实时金价（`api.gold-api.com`）、当日行情、财经日历、DXY、Fed 加息概率、RSI 等
  3. 更新全部 4 个页面（`daily.html` / `news.html` / `risk.html` / `index.html`）的文字与数据
  4. 提交并推送到 `main`
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
