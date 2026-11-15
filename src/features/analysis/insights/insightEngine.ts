import { formatCompactNumber } from '@/src/features/analysis/charts/chartRecommendationEngine';
import type {
  CategoryMetricComparison,
  ChartConfig,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  DataQualityIssue,
  DistributionBiasResult,
  Insight,
  TrendAnalysisResult,
} from '@/src/types/analysis';

export interface InsightEngineInput {
  schema: ColumnSchema[];
  profile: DataProfile;
  qualityIssues: DataQualityIssue[];
  correlations: CorrelationResult[];
  categoryComparisons: CategoryMetricComparison[];
  distributionBiases: DistributionBiasResult[];
  trends: TrendAnalysisResult[];
  recommendedCharts: ChartConfig[];
}

/**
 * 分析結果のみを根拠としてルールベースでインサイト文章を生成する（LLM不使用・純粋関数）
 * 根拠となる集計結果を持たないインサイトは生成しない
 */
export function generateInsights(input: InsightEngineInput): Insight[] {
  const {
    schema,
    profile,
    qualityIssues,
    correlations,
    categoryComparisons,
    distributionBiases,
    trends,
    recommendedCharts,
  } = input;

  const insights: Insight[] = [];
  const findChartId = (type: ChartConfig['type'], col?: string) =>
    recommendedCharts.find(
      (c) => c.type === type && (!col || c.xAxis === col || c.yAxis === col)
    )?.id;

  // 1. Overview インサイト（必ずデータ構造・件数の実測値に基づく）
  const metricCount = schema.filter((c) => c.role === 'metric').length;
  const catCount = schema.filter((c) => c.role === 'category').length;
  const dateCount = schema.filter((c) => c.role === 'date').length;

  insights.push({
    id: 'insight-overview-structure',
    title: `${profile.overview.filteredRows.toLocaleString('ja-JP')}件のレコードと${profile.overview.totalColumns}カラムを自動プロファイリング`,
    description: `数値指標 ${metricCount}件・カテゴリ ${catCount}件・日付 ${dateCount}件を検出し、データ構造に応じた分析を適用しました。`,
    category: 'Overview',
    severity: 'low',
    evidence: [
      {
        label: '対象レコード数',
        value: `${profile.overview.filteredRows.toLocaleString('ja-JP')}件`,
      },
      {
        label: '欠損を含むカラム',
        value: `${profile.overview.columnsWithNulls}個`,
      },
      {
        label: '重複レコード',
        value: `${profile.overview.duplicateRows.toLocaleString('ja-JP')}件`,
      },
    ],
    targetColumns: [],
  });

  // 2. Trend インサイト（時系列分析結果がある場合）
  for (const trend of trends.slice(0, 2)) {
    const granLabel =
      trend.granularity === 'day'
        ? '日次'
        : trend.granularity === 'week'
          ? '週次'
          : '月次';

    if (
      trend.changeRate !== null &&
      trend.latestPeriod &&
      trend.previousPeriod &&
      trend.latestValue !== null &&
      trend.previousValue !== null
    ) {
      const pct = Math.abs(trend.changeRate * 100).toFixed(1);
      const changeVerb =
        trend.changeRate > 0.01
          ? `前期間比で ${pct}% 増加`
          : trend.changeRate < -0.01
            ? `前期間比で ${pct}% 減少`
            : '前期間とほぼ横ばい';

      insights.push({
        id: `insight-trend-change-${trend.metricColumn}`,
        title: `直近期間（${trend.latestPeriod}）の${trend.metricColumn}は${changeVerb}しています`,
        description: `${granLabel}集計において、${trend.previousPeriod}（${formatCompactNumber(trend.previousValue)}）から${trend.latestPeriod}（${formatCompactNumber(trend.latestValue)}）へ推移しました。`,
        category: 'Trend',
        severity: Math.abs(trend.changeRate) >= 0.15 ? 'high' : 'medium',
        evidence: [
          { label: `${trend.previousPeriod}`, value: formatCompactNumber(trend.previousValue) },
          { label: `${trend.latestPeriod}`, value: formatCompactNumber(trend.latestValue) },
          {
            label: '増減率',
            value: `${trend.changeRate >= 0 ? '+' : ''}${(trend.changeRate * 100).toFixed(1)}%`,
          },
        ],
        targetColumns: [trend.dateColumn, trend.metricColumn],
        relatedChartId: findChartId('line', trend.dateColumn),
      });
    }

    if (trend.peakPeriod && trend.troughPeriod && trend.points.length >= 3) {
      insights.push({
        id: `insight-trend-peak-${trend.metricColumn}`,
        title: `${trend.metricColumn}が最も高い期間は ${trend.peakPeriod.period} です`,
        description: `対象期間中で最大値は ${trend.peakPeriod.period}（${formatCompactNumber(trend.peakPeriod.value)}）、最小値は ${trend.troughPeriod.period}（${formatCompactNumber(trend.troughPeriod.value)}）でした。`,
        category: 'Trend',
        severity: 'medium',
        evidence: [
          {
            label: `最大 (${trend.peakPeriod.period})`,
            value: formatCompactNumber(trend.peakPeriod.value),
          },
          {
            label: `最小 (${trend.troughPeriod.period})`,
            value: formatCompactNumber(trend.troughPeriod.value),
          },
        ],
        targetColumns: [trend.dateColumn, trend.metricColumn],
        relatedChartId: findChartId('line', trend.dateColumn),
      });
    }
  }

  // 3. Comparison インサイト（カテゴリ×数値比較）
  for (const comp of categoryComparisons.slice(0, 2)) {
    if (comp.topItems.length >= 3 && comp.overallSum > 0) {
      const top3Pct = (comp.top3Share * 100).toFixed(1);
      const top3Names = comp.topItems
        .slice(0, 3)
        .map((i) => i.category)
        .join('・');

      insights.push({
        id: `insight-comp-concentration-${comp.categoryColumn}-${comp.metricColumn}`,
        title: `${comp.metricColumn}の約${Math.round(comp.top3Share * 100)}%が${comp.categoryColumn}の上位3項目に集中しています`,
        description: `上位3カテゴリ（${top3Names}）の合計が全体の ${top3Pct}% を占めています。`,
        category: 'Comparison',
        severity: comp.top3Share >= 0.7 ? 'high' : 'medium',
        evidence: [
          { label: '上位3カテゴリ占有率', value: `${top3Pct}%` },
          {
            label: `1位: ${comp.topItems[0].category}`,
            value: formatCompactNumber(comp.topItems[0].sum),
          },
        ],
        targetColumns: [comp.categoryColumn, comp.metricColumn],
        relatedChartId: findChartId('bar', comp.categoryColumn),
      });
    }

    const topMeanItem = [...comp.topItems].sort((a, b) => b.mean - a.mean)[0];
    if (topMeanItem && comp.overallMean > 0) {
      const diffRatio = ((topMeanItem.mean - comp.overallMean) / Math.abs(comp.overallMean)) * 100;
      if (diffRatio >= 15) {
        insights.push({
          id: `insight-comp-mean-${comp.categoryColumn}-${comp.metricColumn}`,
          title: `「${topMeanItem.category}」の${comp.metricColumn}平均は全体平均を ${diffRatio.toFixed(1)}% 上回っています`,
          description: `${comp.categoryColumn}「${topMeanItem.category}」の平均値（${formatCompactNumber(topMeanItem.mean)}）は全体平均（${formatCompactNumber(comp.overallMean)}）と比較して高い水準です。`,
          category: 'Comparison',
          severity: 'medium',
          evidence: [
            { label: `${topMeanItem.category} 平均`, value: formatCompactNumber(topMeanItem.mean) },
            { label: '全体平均', value: formatCompactNumber(comp.overallMean) },
            { label: '全体平均比', value: `+${diffRatio.toFixed(1)}%` },
          ],
          targetColumns: [comp.categoryColumn, comp.metricColumn],
          relatedChartId: findChartId('bar', comp.categoryColumn),
        });
      }
    }
  }

  // カテゴリのみで数値指標がない場合の件数比較インサイト
  if (categoryComparisons.length === 0) {
    const firstCat = Object.values(profile.categoryProfiles)[0];
    if (firstCat && firstCat.topCategories.length >= 2) {
      const top = firstCat.topCategories[0];
      insights.push({
        id: `insight-cat-mode-${firstCat.columnName}`,
        title: `「${firstCat.columnName}」では「${top.value}」が最多（${(top.ratio * 100).toFixed(1)}%）です`,
        description: `${firstCat.uniqueCount}種類のうち「${top.value}」が ${top.count.toLocaleString('ja-JP')}件を占めています。`,
        category: 'Comparison',
        severity: 'medium',
        evidence: [
          { label: '最頻カテゴリ', value: top.value },
          { label: '件数', value: `${top.count.toLocaleString('ja-JP')}件` },
          { label: '構成比', value: `${(top.ratio * 100).toFixed(1)}%` },
        ],
        targetColumns: [firstCat.columnName],
        relatedChartId: findChartId('pie', firstCat.columnName) ?? findChartId('bar', firstCat.columnName),
      });
    }
  }

  // 4. Correlation インサイト（因果関係の断定を明示的に禁止）
  for (const corr of correlations.filter((c) => Math.abs(c.pearsonR) >= 0.45).slice(0, 2)) {
    const dirLabel = corr.direction === 'positive' ? '正の相関' : '負の相関';
    const strengthLabel = corr.strength === 'strong' ? '強い' : '中程度の';

    insights.push({
      id: `insight-corr-${corr.columnA}-${corr.columnB}`,
      title: `${corr.columnA} と ${corr.columnB} には${strengthLabel}${dirLabel}が見られます`,
      description: `相関係数 r = ${corr.pearsonR.toFixed(2)}（有効データ ${corr.sampleSize.toLocaleString('ja-JP')}件）が算出されました。ただし、この相関関係は因果関係を示すものではありません。`,
      category: 'Correlation',
      severity: corr.strength === 'strong' ? 'high' : 'medium',
      evidence: [
        { label: 'ピアソン相関係数 (r)', value: corr.pearsonR.toFixed(3) },
        { label: '相関の方向', value: dirLabel },
        { label: '標本数', value: `${corr.sampleSize.toLocaleString('ja-JP')}件` },
      ],
      targetColumns: [corr.columnA, corr.columnB],
      relatedChartId: findChartId('scatter'),
    });
  }

  // 5. Distribution インサイト（平均と中央値の乖離）
  for (const bias of distributionBiases.slice(0, 2)) {
    const skewText =
      bias.skewDirection === 'right'
        ? '一部の大きな値により平均値が引き上げられています（右に裾が長い分布）'
        : '一部の小さな値により平均値が押し下げられています（左に裾が長い分布）';

    insights.push({
      id: `insight-dist-${bias.columnName}`,
      title: `「${bias.columnName}」の分布に偏りが見られます（平均 ${formatCompactNumber(bias.mean)} / 中央値 ${formatCompactNumber(bias.median)}）`,
      description: `${skewText}。代表値としては中央値（${formatCompactNumber(bias.median)}）の確認も推奨されます。`,
      category: 'Distribution',
      severity: bias.divergenceRatio >= 0.35 ? 'medium' : 'low',
      evidence: [
        { label: '平均値', value: formatCompactNumber(bias.mean) },
        { label: '中央値', value: formatCompactNumber(bias.median) },
        { label: '乖離率', value: `${(bias.divergenceRatio * 100).toFixed(1)}%` },
      ],
      targetColumns: [bias.columnName],
      relatedChartId: findChartId('histogram', bias.columnName),
    });
  }

  // 6. Data Quality & Anomaly インサイト
  for (const issue of qualityIssues) {
    const isAnomaly = issue.kind === 'outliers';
    insights.push({
      id: `insight-dq-${issue.id}`,
      title: issue.title,
      description: issue.description,
      category: isAnomaly ? 'Anomaly' : 'Data Quality',
      severity: issue.severity,
      evidence: [{ label: issue.metricLabel.split(' ')[1] || '検出値', value: issue.metricLabel }],
      targetColumns: issue.columnName ? [issue.columnName] : [],
    });
  }

  // 重要度順に並び替え（high -> medium -> low）
  const weight = { high: 0, medium: 1, low: 2 };
  return insights.sort((a, b) => weight[a.severity] - weight[b.severity]);
}
