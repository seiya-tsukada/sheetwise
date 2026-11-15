import type {
  CategoryMetricComparison,
  ChartConfig,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  TrendAnalysisResult,
} from '@/src/types/analysis';
import { DEFAULT_GRANULARITY, GRANULARITY_LABELS } from '../granularity';

/** 1データセットあたりに推薦するグラフの最大数 */
export const MAX_RECOMMENDED_CHARTS = 4;

/** 推薦ルールで使う閾値 */
export const CHART_RULE_THRESHOLDS = {
  /** 推薦対象とするカテゴリのユニーク数レンジ */
  categoryMinUnique: 2,
  categoryMaxUnique: 40,
  /** 優先するカテゴリのユニーク数レンジ（見やすい棒グラフになる） */
  preferredCategoryMinUnique: 3,
  preferredCategoryMaxUnique: 12,
  /** グループ化棒グラフ: 主軸/系列カテゴリのユニーク数上限 */
  groupedBarMaxPrimaryUnique: 10,
  groupedBarMaxSeriesUnique: 5,
  /** 円グラフにできるカテゴリ数レンジ */
  pieMinUnique: 2,
  pieMaxUnique: 7,
  /** ヒストグラム: 優先する有効件数 / 最低有効件数 */
  histogramPreferredMinCount: 5,
  histogramMinCount: 3,
} as const;

const T = CHART_RULE_THRESHOLDS;

export interface ChartRecommendationInput {
  schema: ColumnSchema[];
  profile: DataProfile;
  correlations: CorrelationResult[];
  categoryComparisons: CategoryMetricComparison[];
  trends: TrendAnalysisResult[];
}

/** ルールが参照するカラムの組み合わせ候補（前計算済み） */
export interface ChartRuleContext extends ChartRecommendationInput {
  dateCols: ColumnSchema[];
  metricCols: ColumnSchema[];
  /** 推薦に適したカテゴリ（boolean含む）。見やすさ順にソート済み */
  catCols: ColumnSchema[];
  uniqueCountOf: (col: ColumnSchema) => number;
}

/**
 * グラフ推薦ルール。カラムの組み合わせが条件を満たせば ChartConfig を返す。
 * `current` はそれまでのルールで採用済みのグラフ。
 */
export interface ChartRule {
  id: string;
  recommend: (ctx: ChartRuleContext, current: readonly ChartConfig[]) => ChartConfig | null;
}

export function buildChartRuleContext(input: ChartRecommendationInput): ChartRuleContext {
  const { schema, profile } = input;
  const uniqueCountOf = (c: ColumnSchema) =>
    profile.categoryProfiles[c.name]?.uniqueCount ?? c.uniqueCount;
  const isPreferredCardinality = (uniq: number) =>
    uniq >= T.preferredCategoryMinUnique && uniq <= T.preferredCategoryMaxUnique;

  const catCols = schema
    .filter((c) => {
      if (c.role !== 'category' && c.role !== 'boolean') return false;
      const uniq = uniqueCountOf(c);
      return uniq >= T.categoryMinUnique && uniq <= T.categoryMaxUnique;
    })
    .sort((a, b) => {
      const ua = uniqueCountOf(a);
      const ub = uniqueCountOf(b);
      // 3〜12種類程度のカテゴリを優先し、同順位ならユニーク数の少ない順
      const scoreA = isPreferredCardinality(ua) ? 0 : 1;
      const scoreB = isPreferredCardinality(ub) ? 0 : 1;
      return scoreA - scoreB || ua - ub;
    });

  return {
    ...input,
    dateCols: schema.filter((c) => c.role === 'date'),
    metricCols: schema.filter((c) => c.role === 'metric'),
    catCols,
    uniqueCountOf,
  };
}

// ---------------------------------------------------------------------------
// Rules（評価順 = 優先度順）
// ---------------------------------------------------------------------------

/** Date × Metric → 折れ線（2指標あれば複数系列） */
const trendLineRule: ChartRule = {
  id: 'date-metric-line',
  recommend: ({ dateCols, metricCols, profile, trends }) => {
    const [primaryDate] = dateCols;
    const [primaryMetric, secondaryMetric] = metricCols;
    if (!primaryDate || !primaryMetric) return null;

    const gran =
      trends[0]?.granularity ??
      profile.dateProfiles[primaryDate.name]?.recommendedGranularity ??
      DEFAULT_GRANULARITY;
    const granLabel = GRANULARITY_LABELS[gran];
    const metricLabel = secondaryMetric
      ? `${primaryMetric.name}・${secondaryMetric.name}`
      : primaryMetric.name;

    return {
      id: 'chart-trend-line',
      title: `${granLabel} ${metricLabel} の推移`,
      type: 'line',
      xAxis: primaryDate.name,
      yAxis: primaryMetric.name,
      secondaryYAxis: secondaryMetric?.name,
      aggregation: 'SUM',
      sort: 'label_asc',
      limit: 60,
      granularity: gran,
      reason: '日付カラムと数値指標が存在するため時系列推移を優先表示しています',
    };
  },
};

/** Category × Metric → 棒グラフ */
const categoryBarRule: ChartRule = {
  id: 'category-metric-bar',
  recommend: ({ catCols, metricCols, categoryComparisons, uniqueCountOf }) => {
    const [primaryCat] = catCols;
    const [primaryMetric] = metricCols;
    if (!primaryCat || !primaryMetric) return null;

    const comp = categoryComparisons.find(
      (c) => c.categoryColumn === primaryCat.name && c.metricColumn === primaryMetric.name
    );

    return {
      id: 'chart-category-bar',
      title: `${primaryCat.name} 別 ${primaryMetric.name}（合計）`,
      type: 'bar',
      xAxis: primaryCat.name,
      yAxis: primaryMetric.name,
      aggregation: 'SUM',
      sort: 'value_desc',
      limit: Math.min(12, Math.max(5, uniqueCountOf(primaryCat))),
      reason: comp
        ? `${primaryCat.name}ごとの指標比較に最適（上位3カテゴリで${(comp.top3Share * 100).toFixed(0)}%）`
        : 'カテゴリ間の数値比較に適した棒グラフを選択しました',
    };
  },
};

/** Category × Category × Metric → グループ化棒グラフ（両カテゴリが低カーディナリティの場合） */
const groupedBarRule: ChartRule = {
  id: 'category-category-metric-grouped-bar',
  recommend: ({ catCols, metricCols, uniqueCountOf }) => {
    const [catA, catB] = catCols;
    const [metric] = metricCols;
    if (!catA || !catB || !metric) return null;
    if (
      uniqueCountOf(catA) > T.groupedBarMaxPrimaryUnique ||
      uniqueCountOf(catB) > T.groupedBarMaxSeriesUnique
    ) {
      return null;
    }

    return {
      id: 'chart-grouped-bar',
      title: `${catA.name} × ${catB.name} 別 ${metric.name}`,
      type: 'grouped_bar',
      xAxis: catA.name,
      yAxis: metric.name,
      groupBy: catB.name,
      aggregation: 'SUM',
      sort: 'value_desc',
      limit: 10,
      reason: '2つのカテゴリ軸によるクロス集計比較のためグループ化棒グラフを選択しました',
    };
  },
};

/** Metric × Metric → 散布図（最も相関の強いペア、なければ先頭2指標） */
const scatterRule: ChartRule = {
  id: 'metric-metric-scatter',
  recommend: ({ metricCols, correlations }) => {
    if (metricCols.length < 2) return null;
    const bestCorr = correlations[0];
    const colA = bestCorr ? bestCorr.columnA : metricCols[0].name;
    const colB = bestCorr ? bestCorr.columnB : metricCols[1].name;

    return {
      id: 'chart-scatter',
      title: `${colA} と ${colB} の散布図`,
      type: 'scatter',
      xAxis: colA,
      yAxis: colB,
      aggregation: 'SUM',
      sort: 'value_desc',
      limit: 250,
      reason: bestCorr
        ? `2つの数値指標間の関係性（r = ${bestCorr.pearsonR.toFixed(2)}）を可視化しています`
        : '複数の数値カラム間の関係性を確認するため散布図を選択しました',
    };
  },
};

/**
 * Category × Count → 構成比。
 * カテゴリ数が少なければ円グラフ、多くて数値指標もなければ件数棒グラフ。
 */
const categoryCompositionRule: ChartRule = {
  id: 'category-count-composition',
  recommend: ({ catCols, metricCols, uniqueCountOf }, current) => {
    if (catCols.length === 0) return null;

    // 棒グラフ（Category × 先頭Metric）でまだ使われていないカテゴリを優先、なければ先頭
    const primaryMetricName = metricCols[0]?.name ?? '';
    const isUsedInBar = (c: ColumnSchema) =>
      current.some(
        (chart) => chart.type === 'bar' && chart.xAxis === c.name && chart.yAxis === primaryMetricName
      );
    const targetCat = catCols.find((c) => !isUsedInBar(c)) ?? catCols[0];
    const uniq = uniqueCountOf(targetCat);

    if (uniq >= T.pieMinUnique && uniq <= T.pieMaxUnique) {
      return {
        id: 'chart-category-pie',
        title: `${targetCat.name} の構成比（件数）`,
        type: 'pie',
        xAxis: targetCat.name,
        yAxis: '*',
        aggregation: 'COUNT',
        sort: 'value_desc',
        limit: uniq,
        reason: `カテゴリ数が${uniq}件と少なく構成比の把握に適しているため円グラフを選択しました`,
      };
    }

    if (metricCols.length === 0) {
      return {
        id: 'chart-category-count-bar',
        title: `${targetCat.name} 別 レコード件数`,
        type: 'bar',
        xAxis: targetCat.name,
        yAxis: '*',
        aggregation: 'COUNT',
        sort: 'value_desc',
        limit: 12,
        reason: 'カテゴリ数が多いため円グラフを避け、棒グラフで上位件数を表示しています',
      };
    }

    return null;
  },
};

/** Metric 単独 → ヒストグラム */
const histogramRule: ChartRule = {
  id: 'metric-histogram',
  recommend: ({ metricCols, profile }) => {
    if (metricCols.length === 0) return null;
    const validCountOf = (c: ColumnSchema) => profile.numericProfiles[c.name]?.count ?? 0;
    const targetMetric =
      metricCols.find((m) => validCountOf(m) >= T.histogramPreferredMinCount) ?? metricCols[0];
    if (validCountOf(targetMetric) < T.histogramMinCount) return null;

    return {
      id: 'chart-histogram',
      title: `${targetMetric.name} の分布（ヒストグラム）`,
      type: 'histogram',
      xAxis: targetMetric.name,
      yAxis: '*',
      aggregation: 'COUNT',
      sort: 'label_asc',
      limit: 12,
      reason: '数値のばらつきや偏り（分布形状）を把握するためヒストグラムを選択しました',
    };
  },
};

/** Date のみ（数値指標なし）→ レコード件数の推移 */
const dateCountLineRule: ChartRule = {
  id: 'date-count-line',
  recommend: ({ dateCols, metricCols, profile }) => {
    const [primaryDate] = dateCols;
    if (!primaryDate || metricCols.length > 0) return null;

    return {
      id: 'chart-date-count',
      title: `${primaryDate.name} 別 レコード件数推移`,
      type: 'line',
      xAxis: primaryDate.name,
      yAxis: '*',
      aggregation: 'COUNT',
      sort: 'label_asc',
      limit: 60,
      granularity:
        profile.dateProfiles[primaryDate.name]?.recommendedGranularity ?? DEFAULT_GRANULARITY,
      reason: '日付カラムのレコード発生頻度の推移を表示しています',
    };
  },
};

/** 評価順に並んだグラフ推薦ルール */
export const CHART_RULES: readonly ChartRule[] = [
  trendLineRule,
  categoryBarRule,
  groupedBarRule,
  scatterRule,
  categoryCompositionRule,
  histogramRule,
  dateCountLineRule,
];

/**
 * ルールを順に評価し、最大 MAX_RECOMMENDED_CHARTS 個のグラフを推薦する
 */
export function applyChartRules(
  input: ChartRecommendationInput,
  rules: readonly ChartRule[] = CHART_RULES
): ChartConfig[] {
  const ctx = buildChartRuleContext(input);
  const charts: ChartConfig[] = [];
  for (const rule of rules) {
    if (charts.length >= MAX_RECOMMENDED_CHARTS) break;
    const chart = rule.recommend(ctx, charts);
    if (chart) charts.push(chart);
  }
  return charts;
}
