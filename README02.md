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
        ├──► schemaDetector.ts (型・役割推定)
        ├──► dataProfiler.ts   (基本統計・重複・NULL・外れ値)
        ├──► rules/            (品質・相関・分布・時系列ルール)
        ├──► insightEngine.ts  (根拠数値付きインサイト生成)
        └──► chartRecommendationEngine.ts (最適グラフ・KPI選定)
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
    │   │   ├── charts/        # chartRecommendationEngine.ts
    │   │   ├── insights/      # insightEngine.ts
    │   │   ├── profiling/     # dataProfiler.ts
    │   │   ├── rules/         # dataQualityRules.ts, statisticalRules.ts, trendRules.ts
    │   │   ├── schema/        # schemaDetector.ts
    │   │   ├── services/      # analysisService.ts
    │   │   ├── types/
    │   │   └── index.ts
    │   ├── csv-import/
    │   │   ├── components/    # CsvUploadView.tsx
    │   │   └── services/      # csvImportService.ts, sampleDatasets.ts
    │   └── dashboard/
    │       ├── components/    # DashboardWorkspace.tsx
    │       └── hooks/         # useDashboardState.ts
    ├── lib/
    │   └── duckdb/            # duckdbInitializer.ts, duckdbClient.ts, csvLoader.ts, queryBuilder.ts, types.ts
    ├── types/                 # analysis.ts
    └── visualization/         # chartConfig.ts, chartFactory.ts, components/ChartRenderer.tsx
```

---

## 6. Dockerを利用した開発環境の構築

Docker は Node.js および Vite 開発サーバーの実行環境を隔離するために利用します（CSV解析自体はブラウザ内の DuckDB-Wasm で実行されます）。

- ソースコードはホスト側からコンテナの `/app` にマウントされるため、編集内容が即座に反映されます。
- `node_modules` は Docker の名前付きボリューム（`node_modules`）で管理されます。

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
- **時系列ルール**: 日付範囲（60日以下→日別、180日以下→週別、それ以上→月別）に応じて自動集計し、直近期間の増減率とピーク・ボトム期間を特定します。

---

## 13. CSVデータのプライバシーと処理場所

- ユーザーがブラウザの File API（ドラッグ＆ドロップ / ファイル選択）で明示的に選択したファイルのみをブラウザメモリ上で処理します。
- CSVデータの内容や集計結果が外部サーバーや外部APIにアップロードされることはありません。
- コンソールログ等へCSVの実データ行を出力しない設計としています。

---

## 14. 現時点の制約

- **ファイルサイズ・ブラウザメモリ上限**: DuckDB-Wasm（シングルスレッド / 32bit WASMアドレス空間）の制約により、ブラウザのタブメモリ上限（概ね数百MB〜1GB程度のCSV、数十万〜100万行規模までが実用的目安）を超える巨大ファイルではメモリ不足エラーが発生する場合があります。
- **対応フォーマット**: カンマ区切りCSV（ヘッダー行あり）を対象としており、TSVやヘッダーなしCSV・Excel形式（`.xlsx`）の直接読み込みには未対応です。
- **文字コード**: UTF-8 / UTF-8 BOM / Shift_JIS に対応しています（EUC-JP等はブラウザ標準のTextDecoder対応範囲に依存します）。
- **シングルスレッド実行**: 初期MVPではマルチスレッド（COI/SharedArrayBuffer）を使用しないため、数百万行規模の複雑なクロス集計では数秒の待ち時間が発生する場合があります。

---

## 15. 今後の拡張候補

- Parquet / JSON / TSV / Excel（`.xlsx`）ファイルの読み込み対応
- 分析結果・チャート画像のPNG / PDF / Markdownレポート出力
- 複数CSVテーブルの結合（JOIN）およびカスタムSQLエディタモード
- ユーザー任意設定（オプトイン）による外部LLM連携での自然言語Q&A拡張
- Web Worker プールまたは DuckDB-Wasm EH/COI 構成への切り替えオプション
