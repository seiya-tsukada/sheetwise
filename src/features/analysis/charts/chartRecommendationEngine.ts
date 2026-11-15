import type {
  CategoryMetricComparison,
  ChartConfig,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  KpiCardData,
  TrendAnalysisResult,
} from '@/src/types/analysis';

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString('ja-JP');
  }
  return value.toLocaleString('ja-JP', {
    maximumFractionDigits: 2,
  });
}

/**
 * データ構造と分析結果に応じてKPIカードを自動生成する（純粋関数）
 */
export function generateKpiCards(
  schema: ColumnSchema[],
  profile: DataProfile,
  trends: TrendAnalysisResult[],
  categoryComparisons: CategoryMetricComparison[]
): KpiCardData[] {
  const kpis: KpiCardData[] = [];
  const { overview, numericProfiles, dateProfiles } = profile;

  const isFiltered = overview.filteredRows !== overview.totalRows;
  kpis.push({
    id: 'kpi-records',
    label: isFiltered ? '対象レコード数' : '総レコード数',
    value: `${overview.filteredRows.toLocaleString('ja-JP')} 件`,
    subtext: isFiltered
      ? `全 ${overview.totalRows.toLocaleString('ja-JP')} 件中`
      : `${overview.totalColumns} カラム / 重複 ${overview.duplicateRows.toLocaleString('ja-JP')} 件`,
  });

  const metricCols = schema.filter((c) => c.role === 'metric');
  const primaryMetric = metricCols[0];
  const primaryNum = primaryMetric ? numericProfiles[primaryMetric.name] : undefined;

  if (primaryMetric && primaryNum && primaryNum.sum !== null && primaryNum.mean !== null) {
    kpis.push({
      id: 'kpi-primary-sum',
      label: `${primaryMetric.name}（合計）`,
      value: formatCompactNumber(primaryNum.sum),
      subtext: `最大値 ${formatCompactNumber(primaryNum.max ?? 0)} / 最小値 ${formatCompactNumber(primaryNum.min ?? 0)}`,
    });

    kpis.push({
      id: 'kpi-primary-avg',
      label: `${primaryMetric.name}（平均）`,
      value: formatCompactNumber(primaryNum.mean),
      subtext:
        primaryNum.median !== null
          ? `中央値 ${formatCompactNumber(primaryNum.median)}`
          : undefined,
    });
  }

  // 時系列トレンドの前期間比があれば表示
  const primaryTrend = trends[0];
  if (
    primaryTrend &&
    primaryTrend.changeRate !== null &&
    primaryTrend.latestPeriod &&
    primaryTrend.previousPeriod
  ) {
    const pct = primaryTrend.changeRate * 100;
    const sign = pct > 0 ? '+' : '';
    kpis.push({
      id: 'kpi-trend-delta',
      label: `${primaryTrend.metricColumn} 前期間比`,
      value: `${sign}${pct.toFixed(1)}%`,
      subtext: `${primaryTrend.previousPeriod} → ${primaryTrend.latestPeriod}`,
      deltaText:
        pct > 0 ? '増加傾向' : pct < 0 ? '減少傾向' : '横ばい',
      deltaTone: pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral',
    });
  } else if (categoryComparisons[0] && categoryComparisons[0].topItems[0]) {
    const comp = categoryComparisons[0];
    const topItem = comp.topItems[0];
    kpis.push({
      id: 'kpi-top-category',
      label: `最上位 ${comp.categoryColumn}`,
      value: topItem.category,
      subtext: `${comp.metricColumn} 構成比 ${(topItem.share * 100).toFixed(1)}%`,
    });
  } else if (Object.values(dateProfiles)[0]) {
    const dp = Object.values(dateProfiles)[0];
    kpis.push({
      id: 'kpi-date-span',
      label: `${dp.columnName}（データ期間）`,
      value: `${dp.spanDays.toLocaleString('ja-JP')} 日間`,
      subtext: dp.minDate && dp.maxDate ? `${dp.minDate} 〜 ${dp.maxDate}` : undefined,
    });
  } else {
    const firstCat = schema.find((c) => c.role === 'category');
    if (firstCat) {
      const catProf = profile.categoryProfiles[firstCat.name];
      const top = catProf?.topCategories[0];
      kpis.push({
        id: 'kpi-cat-diversity',
        label: `${firstCat.name}（ユニーク数）`,
        value: `${(catProf?.uniqueCount ?? firstCat.uniqueCount).toLocaleString('ja-JP')} 種`,
        subtext: top ? `最多: ${top.value} (${(top.ratio * 100).toFixed(1)}%)` : undefined,
      });
    }
  }

  return kpis.slice(0, 4);
}

/**
 * データ構造と分析結果に基づき最適なグラフ群（最大4個、不適切な場合は無理に生成しない）を推薦する
 */
export function recommendCharts(
  schema: ColumnSchema[],
  profile: DataProfile,
  correlations: CorrelationResult[],
  categoryComparisons: CategoryMetricComparison[],
  trends: TrendAnalysisResult[]
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const usedSignatures = new Set<string>();

  const dateCols = schema.filter((c) => c.role === 'date');
  const metricCols = schema.filter((c) => c.role === 'metric');
  const catCols = schema
    .filter((c) => {
      if (c.role !== 'category' && c.role !== 'boolean') return false;
      const uniq = profile.categoryProfiles[c.name]?.uniqueCount ?? c.uniqueCount;
      return uniq >= 2 && uniq <= 40;
    })
    .sort((a, b) => {
      const ua = profile.categoryProfiles[a.name]?.uniqueCount ?? a.uniqueCount;
      const ub = profile.categoryProfiles[b.name]?.uniqueCount ?? b.uniqueCount;
      // 3〜12種類程度のカテゴリを優先
      const scoreA = ua >= 3 && ua <= 12 ? 0 : 1;
      const scoreB = ub >= 3 && ub <= 12 ? 0 : 1;
      return scoreA - scoreB || ua - ub;
    });

  // Rule 1: Date × Metric (複数指標があれば Multi-series Line Chart)
  if (dateCols.length > 0 && metricCols.length > 0) {
    const primaryDate = dateCols[0];
    const dateProf = profile.dateProfiles[primaryDate.name];
    const gran = trends[0]?.granularity ?? dateProf?.recommendedGranularity ?? 'month';
    const primaryMetric = metricCols[0];
    const secondaryMetric = metricCols.length >= 2 ? metricCols[1] : undefined;

    const granLabel = gran === 'day' ? '日別' : gran === 'week' ? '週別' : '月別';
    const title = secondaryMetric
      ? `${granLabel} ${primaryMetric.name}・${secondaryMetric.name} の推移`
      : `${granLabel} ${primaryMetric.name} の推移`;

    charts.push({
      id: 'chart-trend-line',
      title,
      type: 'line',
      xAxis: primaryDate.name,
      yAxis: primaryMetric.name,
      secondaryYAxis: secondaryMetric?.name,
      aggregation: 'SUM',
      sort: 'label_asc',
      limit: 60,
      granularity: gran,
      reason: '日付カラムと数値指標が存在するため時系列推移を優先表示しています',
    });
    usedSignatures.add(`line:${primaryDate.name}:${primaryMetric.name}`);
  }

  // Rule 2: Category × Metric -> Bar Chart
  if (catCols.length > 0 && metricCols.length > 0) {
    const primaryCat = catCols[0];
    const primaryMetric = metricCols[0];
    const comp = categoryComparisons.find(
      (c) => c.categoryColumn === primaryCat.name && c.metricColumn === primaryMetric.name
    );
    const uniq = profile.categoryProfiles[primaryCat.name]?.uniqueCount ?? primaryCat.uniqueCount;

    charts.push({
      id: 'chart-category-bar',
      title: `${primaryCat.name} 別 ${primaryMetric.name}（合計）`,
      type: 'bar',
      xAxis: primaryCat.name,
      yAxis: primaryMetric.name,
      aggregation: 'SUM',
      sort: 'value_desc',
      limit: Math.min(12, Math.max(5, uniq)),
      reason: comp
        ? `${primaryCat.name}ごとの指標比較に最適（上位3カテゴリで${(comp.top3Share * 100).toFixed(0)}%）`
        : 'カテゴリ間の数値比較に適した棒グラフを選択しました',
    });
    usedSignatures.add(`bar:${primaryCat.name}:${primaryMetric.name}`);
  }

  // Rule 3: Category × Metric × Secondary Category -> Grouped Bar Chart (両方が低カーディナリティの場合)
  if (catCols.length >= 2 && metricCols.length > 0) {
    const catA = catCols[0];
    const catB = catCols[1];
    const uniqA = profile.categoryProfiles[catA.name]?.uniqueCount ?? catA.uniqueCount;
    const uniqB = profile.categoryProfiles[catB.name]?.uniqueCount ?? catB.uniqueCount;

    if (uniqA <= 10 && uniqB <= 5) {
      const metric = metricCols[0];
      charts.push({
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
      });
    }
  }

  // Rule 4: Numeric × Numeric -> Scatter Chart (相関が中〜強、または数値が2つ以上あり枠が空いている場合)
  if (metricCols.length >= 2 && charts.length < 4) {
    const bestCorr = correlations[0];
    const colA = bestCorr ? bestCorr.columnA : metricCols[0].name;
    const colB = bestCorr ? bestCorr.columnB : metricCols[1].name;

    charts.push({
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
    });
  }

  // Rule 5: Category × Count -> Pie Chart (カテゴリ数が7以下の場合のみ) または Bar Chart
  if (catCols.length > 0 && charts.length < 4) {
    // まだ使われていないカテゴリを優先、なければ先頭カテゴリ
    const unusedCat =
      catCols.find((c) => !usedSignatures.has(`bar:${c.name}:${metricCols[0]?.name ?? ''}`)) ||
      catCols[0];
    const uniq = profile.categoryProfiles[unusedCat.name]?.uniqueCount ?? unusedCat.uniqueCount;

    if (uniq >= 2 && uniq <= 7) {
      charts.push({
        id: 'chart-category-pie',
        title: `${unusedCat.name} の構成比（件数）`,
        type: 'pie',
        xAxis: unusedCat.name,
        yAxis: '*',
        aggregation: 'COUNT',
        sort: 'value_desc',
        limit: uniq,
        reason: `カテゴリ数が${uniq}件と少なく構成比の把握に適しているため円グラフを選択しました`,
      });
    } else if (metricCols.length === 0) {
      charts.push({
        id: 'chart-category-count-bar',
        title: `${unusedCat.name} 別 レコード件数`,
        type: 'bar',
        xAxis: unusedCat.name,
        yAxis: '*',
        aggregation: 'COUNT',
        sort: 'value_desc',
        limit: 12,
        reason: 'カテゴリ数が多いため円グラフを避け、棒グラフで上位件数を表示しています',
      });
    }
  }

  // Rule 6: Numeric単独 -> Histogram (枠が空いていて数値指標がある場合)
  if (metricCols.length > 0 && charts.length < 4) {
    // すでに散布図などで主軸を使っていない数値、または先頭数値
    const targetMetric =
      metricCols.find((m) => profile.numericProfiles[m.name]?.count >= 5) ?? metricCols[0];
    if ((profile.numericProfiles[targetMetric.name]?.count ?? 0) >= 3) {
      charts.push({
        id: 'chart-histogram',
        title: `${targetMetric.name} の分布（ヒストグラム）`,
        type: 'histogram',
        xAxis: targetMetric.name,
        yAxis: '*',
        aggregation: 'COUNT',
        sort: 'label_asc',
        limit: 12,
        reason: '数値のばらつきや偏り（分布形状）を把握するためヒストグラムを選択しました',
      });
    }
  }

  // Dateのみで数値指標がない場合は日別/月別レコード件数推移を追加
  if (dateCols.length > 0 && metricCols.length === 0 && charts.length < 4) {
    const primaryDate = dateCols[0];
    const gran = profile.dateProfiles[primaryDate.name]?.recommendedGranularity ?? 'month';
    charts.push({
      id: 'chart-date-count',
      title: `${primaryDate.name} 別 レコード件数推移`,
      type: 'line',
      xAxis: primaryDate.name,
      yAxis: '*',
      aggregation: 'COUNT',
      sort: 'label_asc',
      limit: 60,
      granularity: gran,
      reason: '日付カラムのレコード発生頻度の推移を表示しています',
    });
  }

  return charts.slice(0, 4);
}
