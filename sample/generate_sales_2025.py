import csv, random, sys, datetime as dt

random.seed(20251115)
out = sys.argv[1]

REGIONS = [("東京", 0.34), ("大阪", 0.20), ("名古屋", 0.14), ("福岡", 0.12), ("札幌", 0.10), ("仙台", 0.10)]
CATS = {  # name: (weight, unit price range)
    "クラウドSaaS": (0.30, (18000, 32000)),
    "分析ツール": (0.24, (12000, 22000)),
    "セキュリティ": (0.18, (15000, 28000)),
    "ハードウェア": (0.16, (40000, 60000)),
    "サポート保守": (0.12, (5000, 9000)),
}
CHANNELS = [("オンライン", 0.55), ("店舗", 0.30), ("代理店", 0.15)]
# 月別の受注件数係数（2月に谷、12月にピーク、全体として右肩上がり）
MONTH_FACTOR = {1: 0.85, 2: 0.70, 3: 1.00, 4: 0.90, 5: 0.95, 6: 1.00,
                7: 1.05, 8: 0.90, 9: 1.10, 10: 1.15, 11: 1.25, 12: 1.45}
NOTES = ["初回購入", "リピート", "キャンペーン適用", "法人一括", "見積り経由", "要フォロー"]

def pick(pairs):
    return random.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]

rows = []
oid = 1
for month in range(1, 13):
    n = round(60 * MONTH_FACTOR[month])
    days = (dt.date(2025 + month // 12, month % 12 + 1, 1) - dt.timedelta(days=1)).day
    for _ in range(n):
        d = dt.date(2025, month, random.randint(1, days))
        region = pick(REGIONS)
        cat = random.choices(list(CATS), weights=[v[0] for v in CATS.values()])[0]
        lo, hi = CATS[cat][1]
        price = round(random.uniform(lo, hi), -2)
        qty = max(1, int(random.gauss(6 + month * 0.25, 2.5)))
        disc = random.choice([0, 0, 0, 0.05, 0.05, 0.1, 0.15])
        member = 1 if random.random() < 0.45 else 0
        if member and disc < 0.05:
            disc = 0.05
        sales = round(price * qty * (1 - disc))
        # 広告費は売上と強い正の相関（約15% + ノイズ）
        ad = int(round(sales * random.uniform(0.11, 0.19), -2))
        sat = round(min(5.0, max(1.0, random.gauss(3.6 + (0.4 if member else 0), 0.7))), 1)
        note = random.choice(NOTES) if random.random() < 0.35 else ""
        rows.append({
            "注文ID": f"ORD-{oid:05d}", "注文日": d.isoformat(), "地域": region,
            "商品カテゴリ": cat, "販売チャネル": pick(CHANNELS), "会員フラグ": member,
            "売上": sales, "広告費": ad, "数量": qty, "単価": int(price),
            "割引率": disc, "顧客満足度": sat, "備考": note,
        })
        oid += 1

# 品質チェック検証用の仕込み
# 1) 外れ値: 法人一括の大型受注（IQR外れ値候補）
for i in random.sample(range(len(rows)), 6):
    r = rows[i]
    r["数量"] = random.randint(40, 60)
    r["売上"] = round(r["単価"] * r["数量"] * (1 - r["割引率"]))
    r["広告費"] = int(round(r["売上"] * 0.04, -2))
    r["備考"] = "法人一括"
# 2) 欠損: 広告費 約7%（medium）、顧客満足度 約3%
for i in random.sample(range(len(rows)), 50):
    rows[i]["広告費"] = ""
for i in random.sample(range(len(rows)), 25):
    rows[i]["顧客満足度"] = ""

rows.sort(key=lambda r: (r["注文日"], r["注文ID"]))
# 3) 完全重複行（二重登録を想定）
for i in random.sample(range(len(rows)), 4):
    rows.append(dict(rows[i]))
rows.sort(key=lambda r: (r["注文日"], r["注文ID"]))

with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print(len(rows), "rows")
