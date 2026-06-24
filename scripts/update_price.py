#!/usr/bin/env python3
"""Fetch the live spot gold (XAU/USD) price and rewrite the marked
price/timestamp regions in the static HTML pages.

Markers (kept in the HTML so the replace is reliable):
    <!--LIVEPRICE-->$4,074<!--/LIVEPRICE-->
    <!--LIVEUPDATED-->2026-06-24 13:30 UTC<!--/LIVEUPDATED-->

Data source: https://api.gold-api.com  (free, no API key required)
Runs in GitHub Actions on a cron; commits only when something changed.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://api.gold-api.com/price/XAU"
FILES = ["index.html", "news.html"]


def fetch_price():
    req = urllib.request.Request(API, headers={"User-Agent": "trading-pages-bot"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    return float(data["price"])


def replace_marker(text, name, value):
    pattern = re.compile(
        r"(<!--%s-->).*?(<!--/%s-->)" % (name, name), re.DOTALL
    )
    return pattern.subn(lambda m: m.group(1) + value + m.group(2), text)


def main():
    try:
        price = fetch_price()
    except Exception as e:  # noqa: BLE001
        print(f"ERROR fetching price: {e}", file=sys.stderr)
        return 1

    price_str = f"${price:,.0f}"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"Live gold price: {price_str} @ {stamp}")

    changed_any = False
    for fn in FILES:
        try:
            with open(fn, encoding="utf-8") as f:
                html = f.read()
        except FileNotFoundError:
            continue
        new, n1 = replace_marker(html, "LIVEPRICE", price_str)
        new, n2 = replace_marker(new, "LIVEUPDATED", stamp)
        if new != html:
            with open(fn, "w", encoding="utf-8") as f:
                f.write(new)
            changed_any = True
            print(f"  updated {fn} (price x{n1}, stamp x{n2})")

    if not changed_any:
        print("No changes (price unchanged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
