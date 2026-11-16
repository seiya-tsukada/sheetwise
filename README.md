# CSV Intelligence Dashboard

ローカルのCSVファイルをブラウザ内に読み込み、データ構造の推定・プロファイリング・ルールベース統計分析・インサイト抽出・推奨可視化ダッシュボードの生成を自律的に行うWebアプリケーションです。

---

## 1. プロダクト概要

**CSV Intelligence Dashboard** は、ユーザーが分析手法やグラフの種類を事前に指定しなくても、CSVをアップロードするだけでデータの特徴に応じた最適な分析と可視化を自動実行するビジネスデータ分析ツールです。

すべてのCSV読み込み・SQL集計・統計演算はブラウザ上で完結し、外部サーバーやLLM APIへのデータ送信は一切行いません。

---

## 2. 主な機能

- **ローカルCSVインポート**
  - ドラッグ＆ドロップおよびファイル選択ダイアログに対応
  - 文字コード自動判定（UTF-8 / UTF-8 BOM / Shift_JIS）および手動切り替え
  - 読み込み進捗表示・エラー通知・読み込み中のファイル切替保護
- **データ構造・役割の自動推定**
  - データ型推定（Integer / Float / String / Boolean / Date / Timestamp / Unknown）
  - 分析上の役割推定（日付・カテゴリ・数値指標・ID・テキスト・Boolean）
  - 顧客IDや注文IDなどの数値IDを売上等の分析指標として誤認しない識別ロジック
- **データプロファイリング & 品質診断**
  - 総レコード数・カラム数・欠損率・完全重複行・IQR外れ値候補・型混在の検出
  - 数値カラムの基本統計量（最小・最大・平均・中央値・合計・標準偏差・四分位数）
  - カテゴリ構成比および日付期間・推奨集計粒度の算出
- **自律分析 & ルールベース・インサイト生成**
  - 時系列推移分析（日別・週別・月別、前期間比増減率、ピーク/ボトム期間）
  - カテゴリ比較（上位3項目集中率、全体平均との比較）
  - 数値カラム間のピアソン相関分析（※因果関係の非断定注記付き）
  - すべてのインサイトに実測値の根拠（Evidence）を付与
- **自動グラフ推薦 & カスタマイズ**
  - データ構造に応じて最大4種のグラフを自動選定（折れ線・複数系列折れ線・棒・グループ化棒・円・散布図・ヒストグラム）
  - グラフの追加・削除、タイトル変更、グラフ種別・X/Y軸・集計方法（SUM / AVG / COUNT / MIN / MAX）・並び替え・上位N件のリアルタイム変更
- **グローバルフィルター & ページネーション付きデータテーブル**
  - カテゴリ・日付期間・数値範囲フィルターによるKPI・インサイト・グラフ・テーブルの連動再計算
  - DuckDBによるオンデマンドページネーション・全文検索・カラムソート・列絞り込み

---

## 3. 技術スタック

- **フロントエンド**: React 19, TypeScript, Vite, Tailwind CSS v4
- **ブラウザ内SQL分析エンジン**: DuckDB-Wasm（シングルスレッドMVP構成・ローカルnpmアセット配信）
- **可視化**: Recharts
- **アイコン**: Lucide React
- **コンテナ実行環境**: Docker / Docker Compose (Node.js 22 Alpine)

※ 本MVPでは CSV パース・集計の責務を DuckDB-Wasm に集約しており、Papa Parse / Arquero / simple-statistics や外部LLM APIは使用していません。

---

## 4. アーキテクチャ

```
[ブラウザ File API (ArrayBuffer / TextDecoder)]
        │
        ▼  UTF-8正規化 & 仮想FS登録
[DuckDB-Wasm (Web Worker / シングルスレッドMVP)]
        │
        ├──► schema/           (型・役割推定ルール)
        ├──► dataProfiler.ts   (基本統計・重複・NULL・外れ値)
        ├──► rules/            (品質・相関・分布・時系列ルール)
        ├──► insightEngine.ts  (根拠数値付きインサイト生成)
        └──► charts/           (最適グラフ・KPI選定ルール)
                │
                ▼  型定義済み分析結果のみを返却
        [React UI / Recharts / Paginated DataTable]
```

UIコンポーネント内にSQL文字列や分析ロジックを持たせず、`src/lib/duckdb/` と `src/features/analysis/` に完全に分離しています。

---

## 5. ディレクトリ構成

```text
.
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── README.md
├── sample/                    # 動作確認用サンプルCSV（sales_2025.csv / hr_2025.csv）と生成スクリプト
├── scripts/
│   └── test-hooks.mjs         # テスト時に Vite 専用の `?url` import をスタブ化する Node フック
└── src/
    ├── app/
    │   └── DashboardApp.tsx
    ├── components/
    │   ├── charts/            # ChartCard, ChartEditorModal
    │   ├── common/            # AppHeader
    │   ├── dashboard/         # FilterBar, KpiStrip, InsightsSection, SchemaProfilePanel
    │   └── data-table/        # DataTableView
    ├── features/
    │   ├── analysis/
    │   │   ├── charts/        # chartRules.ts, kpiRules.ts, chartRecommendationEngine.ts
    │   │   ├── insights/      # insightEngine.ts
    │   │   ├── profiling/     # dataProfiler.ts
    │   │   ├── rules/         # dataQualityRules.ts, statisticalRules.ts, trendRules.ts
    │   │   ├── schema/        # typeRules.ts, roleRules.ts, schemaDetector.ts
    │   │   ├── services/      # analysisService.ts
    │   │   ├── types/
    │   │   ├── __snapshots__/ # characterization.json（ルールの正解データ）
    │   │   ├── characterization.test.ts
    │   │   ├── granularity.ts # 集計粒度（日別/週別/月別）のルールとラベル
    │   │   ├── formatters.ts  # 数値の短縮表記
    │   │   └── index.ts
    │   ├── csv-import/
    │   │   ├── components/    # CsvUploadView.tsx
    │   │   └── services/      # csvImportService.ts, sampleDatasets.ts
    │   └── dashboard/
    │       ├── components/    # DashboardWorkspace.tsx
    │       └── hooks/         # useDashboardState.ts
    ├── lib/
    │   └── duckdb/            # duckdbInitializer.ts, duckdbClient.ts, csvLoader.ts, queryBuilder.ts, chartQueryBuilder.ts, types.ts
    ├── types/                 # analysis.ts
    └── visualization/         # chartConfig.ts, chartFactory.ts, chartDataTransform.ts, components/ChartRenderer.tsx
```

---

## 6. Dockerを利用した開発環境の構築

Docker は Node.js および Vite 開発サーバーの実行環境を隔離するために利用します（CSV解析自体はブラウザ内の DuckDB-Wasm で実行されます）。

- ソースコードはホスト側からコンテナの `/app` にマウントされるため、編集内容が即座に反映されます（`CHOKIDAR_USEPOLLING` によるポーリング監視）。
- `node_modules` は Docker の名前付きボリューム（`node_modules`）で管理し、ホスト（macOS 等）のネイティブバイナリと混ざらないよう分離しています。
- 依存は `package-lock.json` に固定されています。イメージのビルド時は `npm ci`、コンテナ起動時は `npm install` でロックファイルと同期するため、依存を追加した場合はコンテナを再起動すれば反映されます。

| ファイル | 役割 |
| --- | --- |
| `Dockerfile` | Node 22 Alpine イメージ。依存のインストールと、起動コマンド（`npm install` → `npm run dev`）を定義 |
| `docker-compose.yml` | ポート公開・ソースのマウント・`node_modules` ボリューム・ファイル監視の設定 |
| `.dockerignore` | `node_modules` / `dist` / `.git` などをビルド対象から除外 |
| `vite.config.ts` | 開発サーバーの待ち受け設定（ホストは `DEV_SERVER_HOST`、ポートは `DEV_SERVER_PORT`、`strictPort`） |

開発サーバーは **ポート 5173 で、localhost（127.0.0.1）からのリクエストのみ** を受け付けます。同じネットワーク上の他の端末からはアクセスできません。5173 番が使用中の場合は、別ポートへずれずにエラーになります。

| 起動方法 | 待ち受け | ブラウザで開くURL |
| --- | --- | --- |
| `docker compose up` | ホストの `127.0.0.1:5173` → コンテナの 5173（コンテナ内は `0.0.0.0`） | http://localhost:5173 |
| `npm run dev`（Docker なし） | `127.0.0.1:5173` | http://localhost:5173 |

事前要件：Docker および Docker Compose がインストールされていること。

---

## 7. Docker Composeによる起動方法

```bash
docker compose up --build
```

起動後、ブラウザで以下のURLにアクセスしてください。

- http://localhost:5173

バックグラウンドで起動する場合は以下を実行します。

```bash
docker compose up -d --build
```

---

## 8. 停止方法

```bash
docker compose down
```

---

## 9. クリーンアップ方法

コンテナ・ネットワーク・`node_modules` 用名前付きボリューム・ビルドイメージを含めて完全に削除する場合は以下を実行します。

```bash
docker compose down -v --rmi local
```

---

## 10. 分析エンジンの仕組み

1. **スキーマ推定**: `DESCRIBE` と全件集計により、DuckDBの型だけでなくNULL率・ユニーク率・名称パターン（`ID` / `コード` / `番号` 等）を評価し、各カラムに `date` / `metric` / `category` / `id` / `text` / `boolean` の役割を割り当てます。
2. **プロファイリング**: 数値カラムには `MIN`, `MAX`, `AVG`, `MEDIAN`, `SUM`, `STDDEV_SAMP`, `QUANTILE_CONT` を、カテゴリには上位件数・構成比を、日付には最小/最大日とスパンを算出します。
3. **自律ルール評価**: 各専門ルールモジュールが「欠損・重複・外れ値」「分布の偏り」「カテゴリ集中度」「相関」「時系列変化」を評価し、結果を共通の型構造へ集約します。
4. **ダッシュボード合成**: 推薦エンジンがデータ構造に適合するグラフとKPIを選定し、インサイトエンジンが根拠数値付きの日本語文章を生成します。

---

## 11. DuckDB-Wasmの役割

- **WASM / Worker ローカル配信**: `@duckdb/duckdb-wasm` の `duckdb-mvp.wasm` および `duckdb-browser-mvp.worker.js` を Vite の静的アセット（`?url`）としてローカル配信し、CDNへの外部アクセスに依存しません。
- **シングルスレッド構成**: MVP要件に基づき、COOP/COEPヘッダー制約を受けにくいシングルスレッドMVPバンドルを採用しています。
- **インメモリ大量データ処理**: 全行をReactのstateに保持せず、グラフ集計・フィルター再計算・テーブルのページネーション（`LIMIT` / `OFFSET`）をすべてSQLクエリ側で実行します。
- **SQLインジェクション対策**: テーブル名・カラム名・文字列リテラルは `queryBuilder.ts` にて必ず識別子・リテラルエスケープを通した上でクエリを生成します。

---

## 12. ルールベース分析の仕組み

LLMによる推測を排し、再現性と説明可能性を担保したルールベースロジックを採用しています。

- **データ品質ルール**: NULL率（5%以上 / 30%以上）、完全重複行、IDの一意性、IQR（四分位範囲）による外れ値候補、文字列カラム内の数値混在を検出します。
- **統計・相関ルール**: 平均値と中央値の乖離率（15%以上）で分布の偏りを判定し、数値指標間のピアソン相関係数（`|r| >= 0.45`）を抽出します。相関インサイトには「因果関係を示すものではない」旨を明記します。
- **時系列ルール**: 日付範囲（45日以下→日別、180日以下→週別、それ以上→月別）に応じて自動集計し、直近期間の増減率とピーク・ボトム期間を特定します。

---

## 13. 分析・可視化ルールファイルの構成とメンテナンス

型推定（分析）とグラフ選定（可視化）は、if 文の連鎖ではなく **「ルール表」** として実装しています。ルール表は配列で、**上から順に評価し、最初に条件を満たしたルールを採用する（first-match）** のが基本です。判断ロジックを変えたいときは、該当するルール表の要素や閾値定数を編集します。

### 13.1 ルールファイル一覧

| 領域 | ファイル | 主なエクスポート | 役割 |
| --- | --- | --- | --- |
| 分析 | `src/features/analysis/schema/typeRules.ts` | `DUCKDB_TYPE_RULES`, `mapDuckdbType` | DuckDB の型名（`BIGINT`, `VARCHAR` 等）→ 推定データ型（Integer / Float / Boolean / Date / Timestamp / String / Unknown） |
| 分析 | `src/features/analysis/schema/schemaDetector.ts` | `STRING_COERCION_RULES`, `detectSchema` | 文字列カラムを日付・数値へ昇格させる判定と、スキーマ検出の全体フロー |
| 分析 | `src/features/analysis/schema/roleRules.ts` | `COLUMN_ROLE_RULES`, `ROLE_THRESHOLDS`, `inferColumnRole` | 型・カラム名・ユニーク率から役割（date / boolean / id / metric / text / category）を推定 |
| 分析 | `src/features/analysis/granularity.ts` | `recommendGranularity`, `GRANULARITY_LABELS` | データ期間から集計粒度（日別 / 週別 / 月別）を決定し、表示ラベルを提供 |
| 可視化 | `src/features/analysis/charts/chartRules.ts` | `CHART_RULES`, `CHART_RULE_THRESHOLDS`, `MAX_RECOMMENDED_CHARTS` | カラムの組み合わせから推薦グラフを最大4つ選定 |
| 可視化 | `src/features/analysis/charts/kpiRules.ts` | `KPI_RULES`, `HIGHLIGHT_KPI_RULES`, `MAX_KPI_CARDS` | KPI カード（最大4枚）の選定 |
| 可視化 | `src/lib/duckdb/chartQueryBuilder.ts` | `CHART_QUERY_STRATEGIES`, `buildChartQuery` | グラフ種別ごとの集計 SQL 生成 |
| 可視化 | `src/visualization/chartDataTransform.ts` | `CHART_DATA_TRANSFORMERS`, `toChartData` | SQL の結果行 → Recharts 用データへの変換 |
| 可視化 | `src/visualization/components/ChartRenderer.tsx` | `CHART_BODIES`（内部） | グラフ種別 → 描画関数の対応表 |

`chartRecommendationEngine.ts` は、上記のルールを呼び出す公開窓口（`recommendCharts` / `generateKpiCards`）です。

### 13.2 分析ルールの解説

**① 型推定（`DUCKDB_TYPE_RULES`）**：型名を大文字にして、含まれるキーワードで判定します。

| 順 | 条件 | 推定型 |
| --- | --- | --- |
| 1 | `INT` を含む（BIGINT / SMALLINT / HUGEINT 等） | Integer |
| 2 | `DOUBLE` / `FLOAT` / `DECIMAL` / `NUMERIC` / `REAL` を含む | Float |
| 3 | `BOOL` を含む | Boolean |
| 4 | `DATE` と完全一致 | Date |
| 5 | `TIME` を含む（TIMESTAMP 系・TIME） | Timestamp |
| 6 | `CHAR` / `TEXT` を含む | String |
| – | どれにも該当しない | Unknown |

> 注意: `INTERVAL` も `INT` を含むため Integer と判定されます（既存挙動。ルール表にコメントあり）。

**② 文字列の昇格（`STRING_COERCION_RULES`）**：String と判定されたカラムは、サンプル値（最大8件）がすべて日付形式 → 数値形式の順にパターンへ一致するかを見ます。一致した **最初のルールだけ** を DuckDB で全件検証し、変換成功率が 85% 以上なら Date / Float に昇格します。

**③ 役割推定（`COLUMN_ROLE_RULES`）**：主なルールは以下の順に評価されます（閾値は `ROLE_THRESHOLDS`）。

| 順 | ルールID | 条件（概要） | 役割 |
| --- | --- | --- | --- |
| 1 | `date-type` | Date / Timestamp 型、または日付に昇格済み | date |
| 2 | `boolean-type` | Boolean 型 | boolean |
| 3 | `id-by-name` | 名前が ID らしく（`ID` / `コード` / `番号` 等）、指標らしくない | id |
| 4 | `numeric-unique-integer-id` | 整数・10行以上・ユニーク率96%以上・指標名でない | id |
| 5 | `numeric-binary-integer-flag` | 整数・ユニーク2以下・指標名でない | boolean |
| 6 | `numeric-metric` | 数値型、または数値に昇格済み | metric |
| 7〜11 | `string-*` | 文字列の ID 名・2値・高カーディナリティ（ID / テキスト）・多値テキスト | id / boolean / text |
| – | （該当なし） | | category |

数値カラムのうち「売上」「金額」「count」など指標らしい名前（`METRIC_NAME_PATTERN`）を持つものは、ID とみなしません。逆に、指標らしい名前でない数値カラムは名前とユニーク率で ID と判定されます。そのため顧客IDや注文IDを数値指標と誤認しません。

**④ 集計粒度（`recommendGranularity`）**：データ期間が 45日以下なら日別、180日以下なら週別、それ以上は月別です。

### 13.3 可視化ルールの解説

**① グラフ推薦（`CHART_RULES`）**：役割ごとのカラム候補（`dateCols` / `metricCols` / `catCols`）をもとに、以下の順で評価します。グラフが4つに達した時点で終了します。

| 順 | ルールID | カラムの組み合わせ | 生成するグラフ |
| --- | --- | --- | --- |
| 1 | `date-metric-line` | 日付 × 指標（2指標なら複数系列） | 折れ線（推移） |
| 2 | `category-metric-bar` | カテゴリ × 指標 | 棒グラフ（合計） |
| 3 | `category-category-metric-grouped-bar` | カテゴリ2つ（ユニーク10以下 × 5以下）× 指標 | グループ化棒 |
| 4 | `metric-metric-scatter` | 指標 × 指標（最も相関の強いペアを優先） | 散布図 |
| 5 | `category-count-composition` | カテゴリ単独（ユニーク2〜7なら円、指標がなければ件数棒） | 円 / 棒 |
| 6 | `metric-histogram` | 指標単独（有効件数3件以上） | ヒストグラム |
| 7 | `date-count-line` | 日付のみ（指標なし） | 折れ線（件数推移） |

カテゴリ候補（`catCols`）は、ユニーク数 2〜40 のカテゴリ / boolean カラムです。ユニーク数 3〜12 のものが優先され、同順位ならユニーク数の少ない順に並びます。

**② KPI（`KPI_RULES`）**：表示順に「総レコード数」→「主指標の合計・平均」→「ハイライト1枚」を出します。ハイライトは `HIGHLIGHT_KPI_RULES` の先頭から評価し、最初に成立した1枚だけを表示します（前期間比 → 最上位カテゴリ → データ期間 → カテゴリのユニーク数）。

**③ SQL 生成と描画**：グラフ設定（`ChartConfig`）は次の順に処理されて画面に表示されます。

1. `CHART_QUERY_STRATEGIES` でグラフ種別に応じた集計 SQL を生成する（ヒストグラム → 散布図 → グループ化棒 → 時系列折れ線 → 汎用カテゴリ集計）。
2. `CHART_DATA_TRANSFORMERS` で結果行を Recharts 用データに変換する。
3. `ChartRenderer` の `CHART_BODIES` で描画する。

### 13.4 メンテナンス方法

**よくある変更と編集箇所**

| やりたいこと | 編集箇所 |
| --- | --- |
| 役割推定の閾値を調整したい | `roleRules.ts` の `ROLE_THRESHOLDS` |
| ID / 指標とみなすカラム名を増やしたい | `roleRules.ts` の `ID_NAME_PATTERN` / `METRIC_NAME_PATTERN` |
| 新しい役割判定ルールを足したい | `COLUMN_ROLE_RULES` の **適切な位置** に `{ id, role, when }` を追加（順序 = 優先度） |
| 推薦グラフの閾値（円グラフのカテゴリ数等）を変えたい | `chartRules.ts` の `CHART_RULE_THRESHOLDS` |
| 新しい推薦グラフを足したい | `ChartRule`（`{ id, recommend(ctx, current) }`）を定義して `CHART_RULES` に追加。条件を満たさなければ `null` を返す |
| 新しいグラフ種別を足したい | `ChartType` 型に追加し、`CHART_QUERY_STRATEGIES`・`CHART_DATA_TRANSFORMERS`・`CHART_BODIES`・`CHART_TYPE_LABELS` に対応を追加（`CHART_BODIES` は `Record<ChartType, …>` なので、追加漏れは型エラーで検出されます） |
| 集計粒度の切り替え日数を変えたい | `granularity.ts` の `GRANULARITY_BY_SPAN` |

**ルール追加時の注意**

- ルール表は **順序が優先度** です。より具体的な条件のルールほど上に置いてください。
- ルールは純粋関数として書き、DuckDB へのクエリは `schemaDetector.ts` / `rules/` / サービス層に限定します。
- 閾値は関数内に直接書かず、`*_THRESHOLDS` 定数に名前付きで追加してください。

**テストと正解データ（スナップショット）**

ルールの挙動は `src/features/analysis/characterization.test.ts` で固定しています。このテストは数千パターンの入力に対する出力（役割推定・グラフ推薦・KPI・インサイト・SQL・グラフデータ変換・スキーマ検出）を、`__snapshots__/characterization.json` と比較します。

```bash
npm install
npm run typecheck   # 型チェック（strict）
npm test            # 単体テスト + スナップショット比較
```

- **挙動を変えないリファクタリング**：`npm test` が通れば、出力が変わっていないことを確認できます。
- **意図して挙動を変える場合**：正解データを再生成し、差分をレビューしてからコミットします。

  ```bash
  UPDATE_SNAPSHOTS=1 npm test
  git diff src/features/analysis/__snapshots__/
  ```

- 実データでの確認には `sample/sales_2025.csv`（売上）または `sample/hr_2025.csv`（組織人事）を使えます（想定される役割の一覧は `sample/README.md` を参照）。

---

## 14. CSVデータのプライバシーと処理場所

- ユーザーがブラウザの File API（ドラッグ＆ドロップ / ファイル選択）で明示的に選択したファイルのみをブラウザメモリ上で処理します。
- CSVデータの内容や集計結果が外部サーバーや外部APIにアップロードされることはありません。
- コンソールログ等へCSVの実データ行を出力しない設計としています。

---

## 15. 現時点の制約

- **ファイルサイズ・ブラウザメモリ上限**: DuckDB-Wasm（シングルスレッド / 32bit WASMアドレス空間）の制約により、ブラウザのタブメモリ上限（概ね数百MB〜1GB程度のCSV、数十万〜100万行規模までが実用的目安）を超える巨大ファイルではメモリ不足エラーが発生する場合があります。
- **対応フォーマット**: カンマ区切りCSV（ヘッダー行あり）を対象としており、TSVやヘッダーなしCSV・Excel形式（`.xlsx`）の直接読み込みには未対応です。
- **文字コード**: UTF-8 / UTF-8 BOM / Shift_JIS に対応しています（EUC-JP等はブラウザ標準のTextDecoder対応範囲に依存します）。
- **シングルスレッド実行**: 初期MVPではマルチスレッド（COI/SharedArrayBuffer）を使用しないため、数百万行規模の複雑なクロス集計では数秒の待ち時間が発生する場合があります。

---

## 16. 今後の拡張候補

- Parquet / JSON / TSV / Excel（`.xlsx`）ファイルの読み込み対応
- 分析結果・チャート画像のPNG / PDF / Markdownレポート出力
- 複数CSVテーブルの結合（JOIN）およびカスタムSQLエディタモード
- ユーザー任意設定（オプトイン）による外部LLM連携での自然言語Q&A拡張
- Web Worker プールまたは DuckDB-Wasm EH/COI 構成への切り替えオプション
