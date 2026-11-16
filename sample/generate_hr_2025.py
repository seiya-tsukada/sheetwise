"""架空の組織人事データ（2025年12月末時点の社員名簿スナップショット）を生成する。

使い方: python3 sample/generate_hr_2025.py sample/hr_2025.csv
"""
import csv, random, sys, datetime as dt

random.seed(20251116)
out = sys.argv[1]
AS_OF = dt.date(2025, 12, 31)

DEPTS = [("開発", 0.38), ("営業", 0.22), ("カスタマーサクセス", 0.15),
         ("マーケティング", 0.10), ("人事総務", 0.08), ("経理財務", 0.07)]
# 部署ごとの年収係数・残業傾向（月平均時間）
DEPT_PAY = {"開発": 1.10, "営業": 1.00, "カスタマーサクセス": 0.92,
            "マーケティング": 1.00, "人事総務": 0.90, "経理財務": 0.95}
DEPT_OT = {"開発": 28, "営業": 32, "カスタマーサクセス": 22,
           "マーケティング": 20, "人事総務": 14, "経理財務": 18}
LOCATIONS = [("東京本社", 0.55), ("大阪支社", 0.18), ("福岡支社", 0.10), ("フルリモート", 0.17)]
GRADES = ["S", "A", "B", "C", "D"]
NOTES = ["育休復帰", "時短勤務", "社内異動", "管理職候補", "中途採用", "再雇用"]
# 入社年ごとの採用人数（会社の成長に伴い近年ほど多い）
HIRES_BY_YEAR = {y: round(6 + (y - 2005) ** 1.45) for y in range(2005, 2026)}
# 入社月の重み（4月の新卒一括入社が突出、10月に秋入社の小さな山）
MONTH_W = [3, 2, 3, 30, 4, 4, 5, 3, 4, 9, 4, 3]


def pick(pairs):
    return random.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def title_for(tenure, age):
    score = tenure * 0.6 + max(0, age - 25) * 0.25 + random.gauss(0, 2.0)
    if score > 17 and random.random() < 0.25:
        return "役員"
    if score > 12:
        return "部長"
    if score > 7.5:
        return "課長"
    if score > 4:
        return "主任"
    return "一般"


BASE_PAY = {"一般": 430, "主任": 560, "課長": 760, "部長": 980, "役員": 1500}

rows = []
eid = 1
for year, n in HIRES_BY_YEAR.items():
    for _ in range(n):
        month = random.choices(range(1, 13), weights=MONTH_W)[0]
        days = (dt.date(year + month // 12, month % 12 + 1, 1) - dt.timedelta(days=1)).day
        hire = dt.date(year, month, 1 if month == 4 else random.randint(1, days))
        new_grad = month == 4 and random.random() < 0.7
        hire_age = random.randint(22, 24) if new_grad else random.randint(24, 45)
        tenure = round((AS_OF - hire).days / 365.25, 1)
        age = int(hire_age + tenure)
        dept = pick(DEPTS)
        emp_type = "正社員" if random.random() < 0.82 else random.choice(["契約社員", "契約社員", "派遣"])
        title = title_for(tenure, age) if emp_type == "正社員" else "一般"
        pay = BASE_PAY[title] * DEPT_PAY[dept] + tenure * 9 + random.gauss(0, 45)
        if emp_type != "正社員":
            pay *= 0.75
        pay = int(round(pay, -1))
        # 残業: 管理職ほど/営業・開発ほど多い。役員は管理対象外（空欄）
        ot = "" if title == "役員" else round(max(0, random.gauss(
            DEPT_OT[dept] + (6 if title in ("課長", "部長") else 0), 9)), 1)
        # エンゲージメント: 残業が多いほど低い（負の相関）
        ot_v = ot if ot != "" else 20
        eng = round(min(5.0, max(1.0, random.gauss(4.3 - ot_v * 0.045, 0.45))), 1)
        grade = random.choices(GRADES, weights=[6, 22, 48, 18, 6])[0]
        location = pick(LOCATIONS)
        remote = 1 if location == "フルリモート" or random.random() < 0.35 else 0
        leave = round(min(1.0, max(0.0, random.gauss(0.68 - ot_v * 0.006, 0.15))), 2)
        training = max(0, int(random.gauss(18 if tenure < 3 else 10, 6)))
        note = random.choice(NOTES) if random.random() < 0.18 else ""
        rows.append({
            "社員番号": f"EMP-{eid:04d}", "入社日": hire.isoformat(), "部署": dept,
            "役職": title, "雇用形態": emp_type, "勤務地": location, "リモート勤務": remote,
            "年齢": age, "勤続年数": tenure, "年収（万円）": pay, "月平均残業時間": ot,
            "有給取得率": leave, "研修受講時間": training, "人事評価": grade,
            "エンゲージメントスコア": eng, "備考": note,
        })
        eid += 1

# 品質チェック検証用の仕込み
# 1) 外れ値: 繁忙プロジェクトで残業が突出した社員（IQR外れ値候補）
cands = [i for i, r in enumerate(rows) if r["月平均残業時間"] != ""]
for i in random.sample(cands, 6):
    rows[i]["月平均残業時間"] = round(random.uniform(75, 95), 1)
    rows[i]["エンゲージメントスコア"] = round(random.uniform(1.2, 2.2), 1)
    rows[i]["備考"] = "長時間労働面談対象"
# 2) 欠損: エンゲージメントサーベイ未回答 約9%（medium）
for i in random.sample(range(len(rows)), round(len(rows) * 0.09)):
    rows[i]["エンゲージメントスコア"] = ""

rows.sort(key=lambda r: (r["入社日"], r["社員番号"]))
# 3) 完全重複行（人事システム移行時の二重登録を想定）
for i in random.sample(range(len(rows)), 3):
    rows.append(dict(rows[i]))
rows.sort(key=lambda r: (r["入社日"], r["社員番号"]))

with open(out, "w", newline="", encoding="utf-8") as f:
    # 指標カラムは主要なもの（年収・残業・エンゲージメント）を先頭に置く
    # （メイン指標は先頭の数値カラム、相関分析は先頭6指標が対象になるため）
    fields = ["社員番号", "入社日", "部署", "役職", "雇用形態", "勤務地", "リモート勤務",
              "年収（万円）", "月平均残業時間", "エンゲージメントスコア", "有給取得率",
              "勤続年数", "年齢", "研修受講時間", "人事評価", "備考"]
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(len(rows), "rows")
