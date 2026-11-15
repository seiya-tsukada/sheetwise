import { formatCompactNumber } from '@/src/features/analysis/charts/chartRecommendationEngine';
import type { AnalysisResult, ColumnRole } from '@/src/types/analysis';

interface SchemaProfilePanelProps {
  analysis: AnalysisResult;
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: '日付・時系列',
  metric: '数値指標',
  category: 'カテゴリ',
  id: 'ID（識別子）',
  text: '自由テキスト',
  boolean: '真偽値',
};

export function SchemaProfilePanel({ analysis }: SchemaProfilePanelProps) {
  const numericList = Object.values(analysis.profile.numericProfiles);
  const categoryList = Object.values(analysis.profile.categoryProfiles);
  const dateList = Object.values(analysis.profile.dateProfiles);

  return (
    <div className="space-y-6">
      {/* カラム構造推定一覧 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            自動推定スキーマ・カラム役割一覧（{analysis.schema.length}カラム）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            DuckDB型とデータのカーディナリティ・名称パターンから推定された分析上の役割
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">カラム名</th>
                <th className="py-2.5 px-3 font-semibold">推定データ型</th>
                <th className="py-2.5 px-3 font-semibold">分析上の役割</th>
                <th className="py-2.5 px-3 text-right font-semibold">NULL数 (率)</th>
                <th className="py-2.5 px-3 text-right font-semibold">ユニーク数 (率)</th>
                <th className="py-2.5 pl-3 font-semibold">サンプル値</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.schema.map((col) => (
                <tr key={col.name} className="hover:bg-slate-50/70">
                  <td className="py-2.5 pr-4 font-medium text-slate-900 whitespace-nowrap">
                    {col.name}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {col.dataType}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={
                        col.role === 'id'
                          ? 'text-slate-500'
                          : col.role === 'metric'
                            ? 'font-medium text-blue-700'
                            : col.role === 'date'
                              ? 'font-medium text-emerald-700'
                              : 'text-slate-700'
                      }
                    >
                      {ROLE_LABELS[col.role]}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {col.nullCount.toLocaleString('ja-JP')} ({(col.nullRate * 100).toFixed(1)}%)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {col.uniqueCount.toLocaleString('ja-JP')} ({(col.uniqueRate * 100).toFixed(1)}%)
                  </td>
                  <td className="py-2.5 pl-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                    {col.sampleValues.length > 0 ? col.sampleValues.join(', ') : '(すべてNULL)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 数値カラム統計量 */}
      {numericList.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              数値カラムの基本統計量
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              IDカラムを除外した分析対象指標の要約統計・四分位数・IQR外れ値候補数
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">カラム名</th>
                  <th className="py-2.5 px-3 text-right font-semibold">最小値</th>
                  <th className="py-2.5 px-3 text-right font-semibold">第1四分位</th>
                  <th className="py-2.5 px-3 text-right font-semibold">中央値</th>
                  <th className="py-2.5 px-3 text-right font-semibold">平均値</th>
                  <th className="py-2.5 px-3 text-right font-semibold">第3四分位</th>
                  <th className="py-2.5 px-3 text-right font-semibold">最大値</th>
                  <th className="py-2.5 px-3 text-right font-semibold">合計</th>
                  <th className="py-2.5 px-3 text-right font-semibold">標準偏差</th>
                  <th className="py-2.5 pl-3 text-right font-semibold">外れ値候補</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {numericList.map((num) => (
                  <tr key={num.columnName} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-4 font-medium text-slate-900 whitespace-nowrap">
                      {num.columnName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {num.min !== null ? formatCompactNumber(num.min) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {num.q1 !== null ? formatCompactNumber(num.q1) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                      {num.median !== null ? formatCompactNumber(num.median) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                      {num.mean !== null ? formatCompactNumber(num.mean) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {num.q3 !== null ? formatCompactNumber(num.q3) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {num.max !== null ? formatCompactNumber(num.max) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {num.sum !== null ? formatCompactNumber(num.sum) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      {num.stdDev !== null ? formatCompactNumber(num.stdDev) : '-'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          num.outlierCount > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'
                        }
                      >
                        {num.outlierCount.toLocaleString('ja-JP')}件
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 相関分析・日付・カテゴリ構成 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {analysis.correlations.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                数値カラム間の相関関係
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                ピアソン相関係数（r）の算出結果（※相関は因果関係を示しません）
              </p>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {analysis.correlations.slice(0, 6).map((c) => (
                <div
                  key={`${c.columnA}-${c.columnB}`}
                  className="flex items-center justify-between py-2.5 text-xs"
                >
                  <span className="font-medium text-slate-800">
                    {c.columnA} × {c.columnB}
                  </span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-slate-500">n={c.sampleSize}</span>
                    <span
                      className={`font-semibold ${
                        Math.abs(c.pearsonR) >= 0.7
                          ? 'text-blue-700'
                          : Math.abs(c.pearsonR) >= 0.45
                            ? 'text-slate-900'
                            : 'text-slate-500'
                      }`}
                    >
                      r = {c.pearsonR.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(dateList.length > 0 || categoryList.length > 0) && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                日付期間・上位カテゴリ概要
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                時系列のカバー範囲および主要カテゴリの構成比
              </p>
            </div>
            <div className="mt-3 space-y-4">
              {dateList.map((d) => (
                <div key={d.columnName} className="border-b border-slate-100 pb-3 text-xs">
                  <p className="font-semibold text-slate-900">{d.columnName}（日付軸）</p>
                  <p className="mt-1 font-mono text-slate-600 tabular-nums">
                    {d.minDate ?? '-'} 〜 {d.maxDate ?? '-'}（{d.spanDays}日間 · 推奨粒度:{' '}
                    {d.recommendedGranularity}）
                  </p>
                </div>
              ))}
              {categoryList.slice(0, 3).map((cat) => (
                <div key={cat.columnName} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{cat.columnName}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {cat.uniqueCount}種類
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {cat.topCategories.slice(0, 4).map((item) => (
                      <div
                        key={item.value}
                        className="flex items-center justify-between text-slate-600"
                      >
                        <span className="truncate pr-4">{item.value}</span>
                        <span className="font-mono tabular-nums whitespace-nowrap">
                          {item.count.toLocaleString('ja-JP')}件 ({(item.ratio * 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
