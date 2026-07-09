#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""雲端版：抓證交所公開資料，產生 data.json（給網頁讀取）。

在 GitHub Actions（Ubuntu + Python）上每天自動執行，不需任何套件。
資料來源：
  1) 除權除息預告表 (TWT48U)      → 即將除權息日、現金股利、除權息別、ETF/特別股
  2) 個股日殖利率/股價 (BWIBBU_d) → 收盤價、本益比、股價淨值比
殖利率 = 本次現金股利 ÷ 收盤價。
"""
from __future__ import annotations
import html as htmllib
import json, re, ssl, sys, datetime as dt
import urllib.request, urllib.error
from pathlib import Path

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TWT48U = "https://www.twse.com.tw/exchangeReport/TWT48U?response=html"
BWIBBU = "https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=html&selectType=ALL&date={date}"
OUTPUT = Path(__file__).resolve().parent / "data.json"


def _today_tw():
    """用台灣時間(UTC+8)判斷「今天」，避免雲端伺服器用 UTC 導致清晨跑差一天。"""
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, ssl.SSLError):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
            return r.read().decode("utf-8", errors="replace")


def _clean(cell: str) -> str:
    t = re.sub(r"<[^>]+>", " ", cell)
    return " ".join(htmllib.unescape(t).split())


def parse_table(raw: str) -> list[dict]:
    thead = re.search(r"<thead[^>]*>(.*?)</thead>", raw, re.S)
    headers = []
    if thead:
        trs = re.findall(r"<tr[^>]*>(.*?)</tr>", thead.group(1), re.S)
        head_html = trs[-1] if trs else thead.group(1)
        headers = [_clean(h) for h in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", head_html, re.S)]
    body = re.search(r"<tbody[^>]*>(.*?)</tbody>", raw, re.S)
    region = body.group(1) if body else raw
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", region, re.S):
        cells = [_clean(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        if not cells:
            continue
        if headers and len(headers) == len(cells):
            out.append(dict(zip(headers, cells)))
        else:
            out.append({str(i): v for i, v in enumerate(cells)})
    return out


def col(d: dict, *names: str):
    for key in d:
        norm = re.sub(r"\s", "", key)
        for n in names:
            if n in norm:
                return d[key]
    return None


def to_float(v):
    if v is None:
        return None
    s = re.sub(r"[,\s%]", "", str(v))
    if not s or not re.match(r"^-?\d", s):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def roc_to_md(s: str):
    m = re.match(r"\s*(\d+)年(\d+)月(\d+)日", str(s or ""))
    if not m:
        return None, None
    y = int(m.group(1)) + 1911
    return (y, int(m.group(2)), int(m.group(3))), "%02d / %02d" % (int(m.group(2)), int(m.group(3)))


def get_forecast():
    print("→ 下載除權除息預告表 ...")
    rows = parse_table(fetch(TWT48U))
    today = _today_tw().timetuple()[:3]
    out = []
    for d in rows:
        code = (col(d, "股票代號", "證券代號") or "").strip()
        # 代號可能帶英文字母尾碼（主動式／多類別 ETF、特別股，如 00400A、2881A），一併收錄。
        if not re.match(r"^\d{4,6}[A-Za-z]?$", code):
            continue
        ymd, md = roc_to_md(col(d, "除權除息日期", "除權息日期"))
        if not ymd or ymd < today:
            continue
        out.append({
            "code": code, "name": (col(d, "名稱") or "").strip(),
            "ex_md": md, "ex_ymd": ymd,
            "type": (col(d, "除權息") or "息").strip() or "息",
            "cash": to_float(col(d, "現金股利")),
        })
    print("  即將除權息 %d 檔" % len(out))
    return out


def get_prices():
    print("→ 下載個股殖利率/股價（自動找最近交易日）...")
    today = _today_tw()
    for back in range(0, 12):
        d = today - dt.timedelta(days=back)
        rows = parse_table(fetch(BWIBBU.format(date=d.strftime("%Y%m%d"))))
        price = {}
        for r in rows:
            code = (col(r, "證券代號", "股票代號") or "").strip()
            close = to_float(col(r, "收盤價"))
            if code and close:
                price[code] = {"close": close, "pe": to_float(col(r, "本益比")),
                               "pb": to_float(col(r, "股價淨值比", "淨值比"))}
        if price:
            print("  使用 %s 收盤資料，%d 檔" % (d.strftime("%Y/%m/%d"), len(price)))
            return price
    print("  警告：找不到收盤資料，殖利率將留白", file=sys.stderr)
    return {}


def build(forecast, price):
    records = []
    for f in forecast:
        p = price.get(f["code"], {})
        close = p.get("close")
        yld = None
        if f["cash"] and f["cash"] > 0 and close and close > 0:
            yld = round(f["cash"] / close * 100, 2)
        records.append({
            "stock_code": f["code"], "stock_name": f["name"],
            "ex_dividend_date": f["ex_md"], "ex_type": f["type"],
            "cash_dividend_value": f["cash"], "current_yield_value": yld,
            "closing_price_value": close, "pe_value": p.get("pe"), "pb_value": p.get("pb"),
        })
    records.sort(key=lambda r: (r["ex_dividend_date"] or "99/99"))
    return records


def main():
    forecast = get_forecast()
    if not forecast:
        print("錯誤：預告表沒有資料（可能暫時連線異常）。", file=sys.stderr)
        return 1
    price = get_prices()
    records = build(forecast, price)
    payload = {"updated": _today_tw().strftime("%Y/%m/%d"), "records": records}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_yield = sum(1 for r in records if r["current_yield_value"] is not None)
    print("完成！共 %d 檔，其中 %d 檔已算出殖利率。已寫入 %s" % (len(records), n_yield, OUTPUT.name))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
