#!/usr/bin/python3
# <swiftbar.title>黄金 + 比特币</swiftbar.title>
# <swiftbar.desc>The trading site's answer for gold and Bitcoin in the Mac menu bar, with live prices.</swiftbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>
#
# SwiftBar plugin (macOS menu bar), refreshed every 5 minutes (the ".5m" in the file name). The answer, trend arrows
# and levels come from the site's data/widget.json (market job, every 15 minutes); prices are fetched live here.
# Setup: widgets/README.md.
import datetime
import json
import urllib.request

SITE = "https://yapseng98.github.io/trading_pages/"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.load(r)


def live_gold():
    try:
        b = get("https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD")[0]["spreadProfilePrices"][0]["bid"]
        if b > 0:
            return b
    except Exception:
        pass
    try:
        p = get("https://api.gold-api.com/price/XAU")["price"]
        return p if p > 0 else None
    except Exception:
        return None


def live_btc():
    try:
        return float(get("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT")["price"])
    except Exception:
        return None


def fmt(v, d):
    return "—" if v is None else f"{v:,.{d}f}"


def word(m):
    """The answer in one or two characters for the menu bar."""
    if m["level"] == "go":
        return "买" if m["side"] == "long" else "卖"
    if m["level"] == "ready":
        return "等" + ("↓" if m.get("bigDir") == "down" else "↑")
    return "观望"


def colour(m):
    if m["level"] == "go":
        return "#34D399" if m["side"] == "long" else "#F87171"
    return "#E6BE55" if m["level"] == "ready" else None


def section(m, px, d):
    prev = m["price"] - m["chg"] if m.get("chg") is not None else None
    chg = f" ({(px - prev) / prev * 100:+.2f}%)" if prev and px else ""
    print(f"{m['icon']} {m['name']}  {fmt(px or m['price'], d)}{chg} | href={m['url']} font=Menlo-Bold size=13")
    tag = ("仅观察 · " if m.get("observe") and m["level"] == "go" else "") + m["tag"]
    c = colour(m)
    print(tag + (f" | color={c}" if c else ""))
    print(m["arrows"] + " | font=Menlo size=12")
    if m.get("plan"):
        p = m["plan"]
        print(f"{'买入' if p['side'] == '做多' else '卖出'} {fmt(p['entry'], d)} · 止损 {fmt(p['stop'], d)} · 目标 {fmt(p['target'], d)}" + (f" | color={c}" if c else ""))
    for l in m.get("lines") or []:
        gap = abs(l["price"] - (px or m["price"]))
        print(f"{'▲' if l['dir'] == 'up' else '▼'} {fmt(l['price'], d)}  {l['text']} · 差 {fmt(gap, d)} | font=Menlo size=12")
    if m.get("odds"):
        o = m["odds"]
        print(f"先到：{'做空' if o['dir'] < 0 else '做多'}信号 {round(o['back'])}% · 大方向转折 {round(o['brk'])}%（历史比例，不是预测） | size=12")
    now = datetime.datetime.now().strftime("%H:%M")
    print((f"价格 {now} 实时" if px else f"价格 {m['priceTime']}（未更新）") + f" · 结论按 {m['updated'][11:16]} | size=11 color=#8A857E")


try:
    data = get(SITE + "data/widget.json")
except Exception:
    print("🥇 — | color=#8A857E")
    print("---")
    print("读不到网站的数据：连上网后会自动重试")
    raise SystemExit
g, b = live_gold(), live_btc()
gm, bm = data.get("gold"), data.get("btc")
title = []
if gm:
    title.append(f"🥇{fmt(g or gm['price'], 0)} {word(gm)}")
if bm:
    title.append(f"₿{fmt(b or bm['price'], 0)} {word(bm)}")
gc = colour(gm) if gm and gm["level"] == "go" else None
print("  ".join(title) + (f" | color={gc}" if gc else ""))
print("---")
if gm:
    section(gm, g, 1)
    print("---")
if bm:
    section(bm, b, 0)
    print("---")
print("规则：周线、日线、4 小时同向才做；比特币只作观察 | size=11 color=#8A857E")
print("刷新 | refresh=true")
