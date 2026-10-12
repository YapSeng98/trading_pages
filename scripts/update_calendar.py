#!/usr/bin/env python3
"""Fetch this week's economic calendar and write the events that move gold where the pages can read them.

Output: data/calendar.json
    {"updated": "...SGT", "source": "...", "events": [{"ms", "date", "weekday", "time", "impact", "title", "zh", "forecast", "previous", "allDay"}]}

Source: the ForexFactory weekly export (free, no key). It lists the current week only and switches to the new
week on Sunday. Kept: US events of medium or high impact, US bank holidays, and events marked for all currencies.
Times are converted to Singapore time (GMT+8); `ms` is the event time as Unix milliseconds.

If the fetch fails, or the feed comes back empty, the old file is left as it is.

Runs in GitHub Actions (.github/workflows/market.yml); also fine to run by hand:
    python3 scripts/update_calendar.py
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "calendar.json")
URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
SGT = timezone(timedelta(hours=8))
WEEKDAY = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
IMPACT = {"High": "high", "Medium": "medium", "Holiday": "holiday"}

# Plain Chinese names for the releases that matter most to gold. Anything not listed keeps its English title.
ZH = {
    "CPI m/m": "CPI 月率", "CPI y/y": "CPI 年率", "Core CPI m/m": "核心 CPI 月率", "Core CPI y/y": "核心 CPI 年率",
    "PPI m/m": "PPI 月率", "PPI y/y": "PPI 年率", "Core PPI m/m": "核心 PPI 月率", "Core PPI y/y": "核心 PPI 年率",
    "Core PCE Price Index m/m": "核心 PCE 物价指数月率", "Core PCE Price Index y/y": "核心 PCE 物价指数年率", "PCE Price Index m/m": "PCE 物价指数月率",
    "Non-Farm Employment Change": "非农就业人数", "Unemployment Rate": "失业率", "Average Hourly Earnings m/m": "平均时薪月率",
    "ADP Non-Farm Employment Change": "ADP 就业人数", "JOLTS Job Openings": "JOLTS 职位空缺", "Unemployment Claims": "初请失业金人数",
    "Employment Cost Index q/q": "就业成本指数季率", "Challenger Job Cuts y/y": "挑战者裁员人数年率",
    "Federal Funds Rate": "美联储利率决议", "FOMC Statement": "FOMC 声明", "FOMC Press Conference": "美联储主席记者会",
    "FOMC Meeting Minutes": "FOMC 会议纪要", "FOMC Economic Projections": "FOMC 经济预测",
    "Retail Sales m/m": "零售销售月率", "Core Retail Sales m/m": "核心零售销售月率",
    "Advance GDP q/q": "GDP 季率初值", "Prelim GDP q/q": "GDP 季率修正值", "Final GDP q/q": "GDP 季率终值",
    "Advance GDP Price Index q/q": "GDP 物价指数初值", "ISM Manufacturing PMI": "ISM 制造业 PMI", "ISM Services PMI": "ISM 服务业 PMI",
    "ISM Manufacturing Prices": "ISM 制造业物价", "Flash Manufacturing PMI": "制造业 PMI 初值", "Flash Services PMI": "服务业 PMI 初值",
    "Final Manufacturing PMI": "制造业 PMI 终值", "Final Services PMI": "服务业 PMI 终值",
    "Prelim UoM Consumer Sentiment": "密歇根消费者信心初值", "Revised UoM Consumer Sentiment": "密歇根消费者信心终值",
    "Prelim UoM Inflation Expectations": "密歇根通胀预期初值", "Revised UoM Inflation Expectations": "密歇根通胀预期终值",
    "CB Consumer Confidence": "谘商会消费者信心", "Empire State Manufacturing Index": "纽约联储制造业指数",
    "Philly Fed Manufacturing Index": "费城联储制造业指数", "Richmond Manufacturing Index": "里士满联储制造业指数",
    "Durable Goods Orders m/m": "耐用品订单月率", "Core Durable Goods Orders m/m": "核心耐用品订单月率", "Factory Orders m/m": "工厂订单月率",
    "Industrial Production m/m": "工业产出月率", "Capacity Utilization Rate": "产能利用率", "Trade Balance": "贸易帐",
    "Existing Home Sales": "成屋销售", "New Home Sales": "新屋销售", "Pending Home Sales m/m": "成屋签约销售月率",
    "Building Permits": "营建许可", "Housing Starts": "新屋开工", "Crude Oil Inventories": "EIA 原油库存",
    "10-y Bond Auction": "10 年期国债拍卖", "30-y Bond Auction": "30 年期国债拍卖", "Federal Budget Balance": "联邦预算",
    "Beige Book": "美联储褐皮书", "Bank Holiday": "美国假日（银行休市）", "Treasury Currency Report": "财政部汇率报告",
    "Jackson Hole Symposium": "杰克逊霍尔年会", "Personal Spending m/m": "个人支出月率", "Personal Income m/m": "个人收入月率",
    "Consumer Credit m/m": "消费信贷月率", "Business Inventories m/m": "商业库存月率", "Import Prices m/m": "进口物价月率",
    "Chicago PMI": "芝加哥 PMI", "Construction Spending m/m": "营建支出月率", "Wards Total Vehicle Sales": "汽车销量",
    "Prelim Nonfarm Productivity q/q": "非农生产力初值", "Prelim Unit Labor Costs q/q": "单位劳动力成本初值",
    "TIC Long-Term Purchases": "长期资本净流入", "NFIB Small Business Index": "NFIB 小企业信心", "Presidential Election": "美国总统大选",
}
PATTERNS = [
    (re.compile(r"^Fed Chair(?:man)? (.+?) Speaks$"), "美联储主席 %s 讲话"),
    (re.compile(r"^Fed Chair(?:man)? (.+?) Testifies$"), "美联储主席 %s 国会作证"),
    (re.compile(r"^FOMC Member (.+?) Speaks$"), "美联储官员 %s 讲话"),
    (re.compile(r"^President (.+?) Speaks$"), "美国总统 %s 讲话"),
    (re.compile(r"^Treasury Sec (.+?) Speaks$"), "美国财长 %s 讲话"),
]


def zh(title):
    if title in ZH:
        return ZH[title]
    for rx, fmt in PATTERNS:
        m = rx.match(title)
        if m:
            return fmt % m.group(1)
    return title


def fetch():
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - retry, then report
            last = e
            time.sleep(5 + 10 * attempt)
    raise last


def main():
    try:
        raw = fetch()
    except Exception as e:  # noqa: BLE001
        print("Calendar fetch failed, old file kept: %s" % e, file=sys.stderr)
        return 1
    events = []
    for e in raw if isinstance(raw, list) else []:
        impact = IMPACT.get(e.get("impact"))
        if not impact or e.get("country") not in ("USD", "All"):
            continue
        try:
            when = datetime.fromisoformat(e["date"])
        except (KeyError, ValueError):
            continue
        local = when.astimezone(SGT)
        all_day = impact == "holiday"
        events.append({
            "ms": int(when.timestamp() * 1000),
            "date": "%d月%d日" % (local.month, local.day),
            "weekday": WEEKDAY[local.weekday()],
            "time": "" if all_day else local.strftime("%H:%M"),
            "allDay": all_day,
            "impact": impact,
            "title": e.get("title", ""),
            "zh": zh(e.get("title", "")),
            "forecast": e.get("forecast", ""),
            "previous": e.get("previous", ""),
        })
    if not events:
        print("The feed had no US events; old file kept.", file=sys.stderr)
        return 1
    events.sort(key=lambda x: (x["ms"], x["title"]))

    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    if old.get("events") == events:
        print("Calendar unchanged (%d events)." % len(events))
        return 0
    data = {
        "updated": datetime.now(SGT).strftime("%Y-%m-%d %H:%M SGT"),
        "source": "ForexFactory weekly calendar (this week only); times in Singapore time",
        "events": events,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    high = [x for x in events if x["impact"] == "high"]
    print("Wrote %d events (%d high impact) at %s" % (len(events), len(high), data["updated"]))
    for x in events:
        print("  %s %s %-5s %-7s %s" % (x["date"], x["weekday"], x["time"] or "全天", x["impact"], x["zh"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
