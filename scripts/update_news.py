#!/usr/bin/env python3
"""Fresh gold-related headlines for news.html: writes data/news.json.

The written news on news.html is rewritten once a day (10:10 SGT) by the Claude refresh. This keeps a list of the
latest headlines current between those runs: it runs with the gold job (scripts/update_gold.js, .github/workflows/
market.yml), every few hours. Headlines stay in their original language and each links to its source.

Sources (RSS): FXStreet news and Investing.com commodities news, kept only when the title is about gold or what
moves it (the Fed, yields, the dollar, inflation data, geopolitics), and a Google News search for "gold price" over
the last day. When no source answers, the old file is kept.
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

OUT = "data/news.json"
SGT = timezone(timedelta(hours=8))
UA = {"User-Agent": "Mozilla/5.0 (compatible; trading_pages news reader; +https://yapseng98.github.io/trading_pages/)"}
FEEDS = [  # (name, url, filter by keywords)
    ("FXStreet", "https://www.fxstreet.com/rss/news", True),
    ("Investing.com", "https://www.investing.com/rss/news_11.rss", True),
    ("Google News", "https://news.google.com/rss/search?q=gold+price+when:1d&hl=en-US&gl=US&ceid=US:en", False),
]
# a headline has to be about gold or about what moves it: the Fed, US yields and the dollar, US data, the Gulf
KEY = re.compile(r"\b(gold|xau|bullion|precious metals?|fed|fomc|powell|warsh|treasur\w*|dxy|dollar index|jobless|"
                 r"payrolls?|nfp|cpi|pce|ppi|iran|hormuz|geopolitic\w*)\b", re.I)
# retail price lists, crypto and single mining stocks are not what moves spot gold
NOISE = re.compile(r"jewel|\b(24k|22k|18k|tola|carat|city-wise)\b|rates? today|price (in|today in) [A-Z]|bitcoin|crypto|ethereum|"
                   r"\(tsx|\(asx|\bnse\b|\bbse\b|fund ?raising|lab-made", re.I)
# Google News brings every publisher; keep the market-news ones
PUBLISHERS = ("Reuters", "Bloomberg", "Kitco", "FXStreet", "CNBC", "MarketWatch", "Investing.com", "Barron's", "Financial Times",
              "The Wall Street Journal", "BullionVault", "FX Empire", "Forex.com", "Yahoo Finance", "AP News", "Fortune", "Nasdaq")
KEEP_HOURS, MAX_ITEMS = 36, 15


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def text(el, tag):
    x = el.find(tag)
    return html.unescape((x.text or "").strip()) if x is not None and x.text else ""


def parse(name, raw, need_key, now):
    out = []
    root = ET.fromstring(raw)
    for it in root.iter("item"):
        title, link, pub = text(it, "title"), text(it, "link"), text(it, "pubDate")
        src = name
        s = it.find("source")
        if s is not None and s.text:                        # Google News: "<title> - <publisher>", publisher in <source>
            src = html.unescape(s.text.strip())
            if title.endswith(" - " + src):
                title = title[: -len(" - " + src)]
        if not title or not link.startswith("https://"):
            continue
        if need_key and not KEY.search(title):
            continue
        if NOISE.search(title) or (name == "Google News" and not any(src.startswith(p) for p in PUBLISHERS)):
            continue
        try:
            t = parsedate_to_datetime(pub)
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if now - t > timedelta(hours=KEEP_HOURS) or t - now > timedelta(minutes=10):
            continue
        out.append({"t": re.sub(r"\s+", " ", title)[:200], "src": src[:40], "url": link, "ms": int(t.timestamp() * 1000),
                    "time": t.astimezone(SGT).strftime("%m/%d %H:%M")})
    return out


def main():
    now = datetime.now(timezone.utc)
    items, answered = [], 0
    for name, url, need_key in FEEDS:
        try:
            got = parse(name, fetch(url), need_key, now)
            answered += 1
            items += got
            print(f"{name}: {len(got)} headlines")
        except Exception as e:  # one source failing must not stop the others
            print(f"::warning::{name} not read: {e}")
    if not answered or not items:
        print("No headlines read; data/news.json left as it is.")
        return 0
    seen, uniq = set(), []
    for x in sorted(items, key=lambda x: -x["ms"]):
        k = re.sub(r"[^a-z0-9]+", "", x["t"].lower())[:70]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(x)
    uniq = uniq[:MAX_ITEMS]
    try:
        old = json.load(open(OUT, encoding="utf-8"))
        if [x["url"] for x in old.get("items", [])] == [x["url"] for x in uniq]:
            print("Same headlines as before; file left as it is.")
            return 0
    except (OSError, ValueError):
        pass
    out = {"updated": now.astimezone(SGT).strftime("%Y-%m-%d %H:%M SGT"), "sources": [f[0] for f in FEEDS], "items": uniq}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {OUT}: {len(uniq)} headlines, newest {uniq[0]['time']} SGT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
