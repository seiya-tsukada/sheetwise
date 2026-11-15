import { useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  GitCompare,
  Info,
  Layers,
  TrendingUp,
} from 'lucide-react';
import type { Insight, InsightCategory } from '@/src/types/analysis';

interface InsightsSectionProps {
  insights: Insight[];
  onFocusChart?: (chartId: string) => void;
}

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  Overview: 'データ概要',
  Trend: '時系列トレンド',
  Comparison: 'カテゴリ比較',
  Distribution: '分布の偏り',
  Correlation: '相関分析',
  'Data Quality': 'データ品質',
  Anomaly: '異常値候補',
};

function SeverityIndicator({ severity }: { severity: Insight['severity'] }) {
  if (severity === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>重要</span>
      </span>
    );
  }
  if (severity === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        <span>注目</span>
      </span>
    );
  }
  return <span className="text-xs font-medium text-slate-500">参考</span>;
}

function CategoryIcon({ category }: { category: InsightCategory }) {
  switch (category) {
    case 'Trend':
      return <TrendingUp className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'Comparison':
      return <BarChart2 className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'Correlation':
      return <GitCompare className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'Data Quality':
    case 'Anomaly':
      return <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />;
    default:
      return <Layers className="h-4 w-4 text-slate-600" aria-hidden="true" />;
  }
}

export function InsightsSection({ insights, onFocusChart }: InsightsSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | InsightCategory>('ALL');

  const availableCategories = Array.from(new Set(insights.map((i) => i.category)));
  const filtered =
    selectedCategory === 'ALL'
      ? insights
      : insights.filter((i) => i.category === selectedCategory);

  return (
    <section aria-label="自動生成インサイト" className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            自律分析インサイト（{insights.length}件）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            DuckDBの実集計値を根拠にルールベースで自動抽出された所見
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            すべて
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">
          該当カテゴリのインサイトはありません。
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((insight) => (
            <article key={insight.id} className="py-4 first:pt-4 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <CategoryIcon category={insight.category} />
                  <span className="font-medium text-slate-700">
                    {CATEGORY_LABELS[insight.category]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <SeverityIndicator severity={insight.severity} />
                  {insight.targetColumns.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {insight.targetColumns.join(', ')}
                      </span>
                    </>
                  )}
                </div>

                {insight.relatedChartId && onFocusChart && (
                  <button
                    type="button"
                    onClick={() => onFocusChart(insight.relatedChartId!)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer"
                  >
                    関連グラフを見る →
                  </button>
                )}
              </div>

              <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                {insight.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {insight.description}
              </p>

              {insight.evidence.length > 0 && (
                <dl className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                  {insight.evidence.map((ev, idx) => (
                    <div key={`${insight.id}-ev-${idx}`} className="flex items-center gap-1.5">
                      <dt className="text-slate-500">{ev.label}:</dt>
                      <dd className="font-mono font-semibold text-slate-800 tabular-nums">
                        {ev.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
