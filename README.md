# XAUUSD 黄金交易中心 · Gold Trading Hub

每日黄金（XAUUSD）盘面分析与交易策略参考站。纯静态网站，可直接用 GitHub Pages 托管。

## 页面

| 文件 | 说明 |
|------|------|
| [`index.html`](index.html) | 首页 · 导航中心 |
| [`daily.html`](daily.html) | **每日深度分析**（主功能，每日更新）— 技术结构、支撑阻力、基本面、操作场景、风险预案 |
| [`strategy.html`](strategy.html) | 策略与形态手册 — 9 形态图鉴、4 套策略、K 线信号、交易心法 |

## 本地预览

直接用浏览器打开 `index.html` 即可，无需构建。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选择 `main` 分支 `/ (root)`，保存后访问
`https://<用户名>.github.io/<仓库名>/`。

## 每日更新流程

1. 用新的当日分析替换 `daily.html` 的正文内容
2. 更新 `index.html` 顶部的价格、偏向标签与日期
3. 提交并推送：`git add -A && git commit -m "Update daily analysis" && git push`

## 免责声明

本站内容仅供参考，不构成投资建议。XAUUSD 交易具有高风险，可能导致本金损失。
