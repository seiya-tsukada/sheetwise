import type {
  CategoryMetricComparison,
  ColumnSchema,
  DataProfile,
  KpiCardData,
  TrendAnalysisResult,
} from '@/src/types/analysis';
import { formatCompactNumber } from '../formatters';

export const MAX_KPI_CARDS = 4;

export interface KpiRuleInput {
  schema: ColumnSchema[];
  profile: DataProfile;
  trends: TrendAnalysisResult[];
  categoryComparisons: CategoryMetricComparison[];
}

/** 条件を満たせば 0 枚以上の KPI カードを返すルール */
type KpiRule = (input: KpiRuleInput) => KpiCardData[];

const ja = (n: number) => n.toLocaleString('ja-JP');

/** 総レコード数（常に表示） */
const recordCountKpi: KpiRule = ({ profile: { overview } }) => {
  const isFiltered = overview.filteredRows !== overview.totalRows;
  return [
    {
      id: 'kpi-records',
      label: isFiltered ? '対象レコード数' : '総レコード数',
      value: `${ja(overview.filteredRows)} 件`,
      subtext: isFiltered
        ? `全 ${ja(overview.totalRows)} 件中`
        : `${overview.totalColumns} カラム / 重複 ${ja(overview.duplicateRows)} 件`,
    },
  ];
};

/** 主指標（先頭の metric）の合計・平均 */
const primaryMetricKpis: KpiRule = ({ schema, profile }) => {
  const primaryMetric = schema.find((c) => c.role === 'metric');
  const num = primaryMetric ? profile.numericProfiles[primaryMetric.name] : undefined;
  if (!primaryMetric || !num || num.sum === null || num.mean === null) return [];

  return [
    {
      id: 'kpi-primary-sum',
      label: `${primaryMetric.name}（合計）`,
      value: formatCompactNumber(num.sum),
      subtext: `最大値 ${formatCompactNumber(num.max ?? 0)} / 最小値 ${formatCompactNumber(num.min ?? 0)}`,
    },
    {
      id: 'kpi-primary-avg',
      label: `${primaryMetric.name}（平均）`,
      value: formatCompactNumber(num.mean),
      subtext: num.median !== null ? `中央値 ${formatCompactNumber(num.median)}` : undefined,
    },
  ];
};

// ---------------------------------------------------------------------------
// ハイライトKPI: 以下の候補を順に評価し、最初に成立した1枚だけを表示する
// ---------------------------------------------------------------------------

type HighlightKpiRule = (input: KpiRuleInput) => KpiCardData | null;

function describeDelta(pct: number): { text: string; tone: KpiCardData['deltaTone'] } {
  if (pct > 0) return { text: '増加傾向', tone: 'positive' };
  if (pct < 0) return { text: '減少傾向', tone: 'negative' };
  return { text: '横ばい', tone: 'neutral' };
}

/** 時系列トレンドの前期間比 */
const trendDeltaKpi: HighlightKpiRule = ({ trends }) => {
  const trend = trends[0];
  if (!trend || trend.changeRate === null || !trend.latestPeriod || !trend.previousPeriod) {
    return null;
  }
  const pct = trend.changeRate * 100;
  const delta = describeDelta(pct);

  return {
    id: 'kpi-trend-delta',
    label: `${trend.metricColumn} 前期間比`,
    value: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
    subtext: `${trend.previousPeriod} → ${trend.latestPeriod}`,
    deltaText: delta.text,
    deltaTone: delta.tone,
  };
};

/** 指標構成比が最大のカテゴリ */
const topCategoryKpi: HighlightKpiRule = ({ categoryComparisons }) => {
  const comp = categoryComparisons[0];
  const topItem = comp?.topItems[0];
  if (!comp || !topItem) return null;
  return {
    id: 'kpi-top-category',
    label: `最上位 ${comp.categoryColumn}`,
    value: topItem.category,
    subtext: `${comp.metricColumn} 構成比 ${(topItem.share * 100).toFixed(1)}%`,
  };
};

/** 日付カラムのデータ期間 */
const dateSpanKpi: HighlightKpiRule = ({ profile }) => {
  const dp = Object.values(profile.dateProfiles)[0];
  if (!dp) return null;
  return {
    id: 'kpi-date-span',
    label: `${dp.columnName}（データ期間）`,
    value: `${ja(dp.spanDays)} 日間`,
    subtext: dp.minDate && dp.maxDate ? `${dp.minDate} 〜 ${dp.maxDate}` : undefined,
  };
};

/** 先頭カテゴリのユニーク数 */
const categoryDiversityKpi: HighlightKpiRule = ({ schema, profile }) => {
  const firstCat = schema.find((c) => c.role === 'category');
  if (!firstCat) return null;
  const catProf = profile.categoryProfiles[firstCat.name];
  const top = catProf?.topCategories[0];
  return {
    id: 'kpi-cat-diversity',
    label: `${firstCat.name}（ユニーク数）`,
    value: `${ja(catProf?.uniqueCount ?? firstCat.uniqueCount)} 種`,
    subtext: top ? `最多: ${top.value} (${(top.ratio * 100).toFixed(1)}%)` : undefined,
  };
};

export const HIGHLIGHT_KPI_RULES: readonly HighlightKpiRule[] = [
  trendDeltaKpi,
  topCategoryKpi,
  dateSpanKpi,
  categoryDiversityKpi,
];

const highlightKpi: KpiRule = (input) => {
  for (const rule of HIGHLIGHT_KPI_RULES) {
    const card = rule(input);
    if (card) return [card];
  }
  return [];
};

/** 表示順に並んだ KPI ルール */
export const KPI_RULES: readonly KpiRule[] = [recordCountKpi, primaryMetricKpis, highlightKpi];

export function applyKpiRules(input: KpiRuleInput): KpiCardData[] {
  return KPI_RULES.flatMap((rule) => rule(input)).slice(0, MAX_KPI_CARDS);
}
