import type { QueryExecutor } from '@/src/lib/duckdb/types';
import { buildWhereClause, escapeIdentifier } from '@/src/lib/duckdb/queryBuilder';
import type {
  ColumnSchema,
  DataProfile,
  DataQualityIssue,
  GlobalFilterState,
} from '@/src/types/analysis';

export interface TypeInconsistencyCheck {
  columnName: string;
  nonNumericCount: number;
  totalNonNullCount: number;
}

/**
 * 文字列カラム内に数値と非数値が混在していないかチェックする
 */
export async function detectTypeInconsistencies(
  executor: QueryExecutor,
  tableName: string,
  schema: ColumnSchema[],
  filters?: GlobalFilterState
): Promise<TypeInconsistencyCheck[]> {
  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema);
  const andPrefix = whereClause ? `${whereClause} AND` : 'WHERE';
  const results: TypeInconsistencyCheck[] = [];

  const stringCols = schema.filter((c) => c.dataType === 'String' && c.role !== 'id');

  for (const col of stringCols) {
    try {
      const ident = escapeIdentifier(col.name);
      const res = await executor.query<{
        non_null_cnt: number;
        numeric_cnt: number;
      }>(`
        SELECT
          COUNT(${ident}) AS non_null_cnt,
          COUNT(TRY_CAST(REPLACE(CAST(${ident} AS VARCHAR), ',', '') AS DOUBLE)) AS numeric_cnt
        FROM ${tbl}
        ${andPrefix} ${ident} IS NOT NULL AND TRIM(CAST(${ident} AS VARCHAR)) <> ''
      `);

      const totalNonNullCount = Number(res[0]?.non_null_cnt ?? 0);
      const numericCount = Number(res[0]?.numeric_cnt ?? 0);

      // 大半が数値（60%以上99.9%未満）なのに一部非数値文字列が混在している場合
      if (
        totalNonNullCount >= 5 &&
        numericCount > 0 &&
        numericCount < totalNonNullCount &&
        numericCount / totalNonNullCount >= 0.6
      ) {
        results.push({
          columnName: col.name,
          nonNumericCount: totalNonNullCount - numericCount,
          totalNonNullCount,
        });
      }
    } catch {
      // ignore
    }
  }

  return results;
}

/**
 * プロファイル結果とスキーマからデータ品質ルールを評価する（純粋関数）
 */
export function evaluateDataQualityRules(
  schema: ColumnSchema[],
  profile: DataProfile,
  typeInconsistencies: TypeInconsistencyCheck[] = []
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const totalRows = Math.max(1, profile.overview.filteredRows);

  // 1. NULL率の高いカラムを検出
  for (const col of schema) {
    if (col.nullRate >= 0.3) {
      issues.push({
        id: `null-high-${col.name}`,
        columnName: col.name,
        kind: 'high_null',
        severity: 'high',
        title: `「${col.name}」の欠損率が非常に高い状態です`,
        description: `${col.nullCount.toLocaleString()}件（${(col.nullRate * 100).toFixed(1)}%）がNULL値です。集計結果に偏りが生じる可能性があります。`,
        metricValue: col.nullRate * 100,
        metricLabel: `${(col.nullRate * 100).toFixed(1)}% 欠損`,
      });
    } else if (col.nullRate >= 0.05) {
      issues.push({
        id: `null-med-${col.name}`,
        columnName: col.name,
        kind: 'high_null',
        severity: 'medium',
        title: `「${col.name}」に欠損値（NULL）が含まれています`,
        description: `${col.nullCount.toLocaleString()}件（${(col.nullRate * 100).toFixed(1)}%）が欠損しています。`,
        metricValue: col.nullRate * 100,
        metricLabel: `${(col.nullRate * 100).toFixed(1)}% 欠損`,
      });
    }
  }

  // 2. 重複レコードの検出
  if (profile.overview.duplicateRows > 0) {
    const dupRate = (profile.overview.duplicateRows / totalRows) * 100;
    issues.push({
      id: 'dup-rows',
      kind: 'duplicates',
      severity: dupRate >= 5 ? 'high' : 'medium',
      title: `全カラム一致の重複レコードが ${profile.overview.duplicateRows.toLocaleString()}件 あります`,
      description: `対象レコードの ${dupRate.toFixed(1)}% が完全重複しています。合計や件数集計時に二重計上される可能性があります。`,
      metricValue: profile.overview.duplicateRows,
      metricLabel: `${profile.overview.duplicateRows.toLocaleString()}件 重複`,
    });
  }

  // 3. IDカラムの一意性確認
  const idCols = schema.filter((c) => c.role === 'id');
  for (const idCol of idCols) {
    if (idCol.rowCount > 0 && idCol.nullCount === 0 && idCol.uniqueCount === idCol.rowCount) {
      issues.push({
        id: `id-unique-${idCol.name}`,
        columnName: idCol.name,
        kind: 'id_uniqueness',
        severity: 'low',
        title: `「${idCol.name}」カラムには重複がありません`,
        description: `全 ${idCol.rowCount.toLocaleString()}件 に対してユニーク数が ${idCol.uniqueCount.toLocaleString()}件 であり、主キー候補として一意性が保たれています。`,
        metricValue: idCol.uniqueCount,
        metricLabel: '100% 一意',
      });
    }
  }

  // 4. ユニーク数が極端に多いカテゴリ・テキストカラムの検出
  for (const col of schema) {
    if (
      (col.role === 'category' || col.role === 'text') &&
      col.uniqueCount >= 25 &&
      col.uniqueRate >= 0.7
    ) {
      issues.push({
        id: `high-card-${col.name}`,
        columnName: col.name,
        kind: 'high_cardinality',
        severity: 'low',
        title: `「${col.name}」のユニーク値が多数存在します`,
        description: `${col.uniqueCount.toLocaleString()}種類の値（ユニーク率 ${(col.uniqueRate * 100).toFixed(1)}%）が含まれるため、円グラフ等での可視化には不向きです。`,
        metricValue: col.uniqueCount,
        metricLabel: `${col.uniqueCount.toLocaleString()} 種類`,
      });
    }
  }

  // 5. データ型の不整合検出
  for (const inc of typeInconsistencies) {
    issues.push({
      id: `type-mismatch-${inc.columnName}`,
      columnName: inc.columnName,
      kind: 'type_inconsistency',
      severity: 'medium',
      title: `「${inc.columnName}」に数値以外の値が混在しています`,
      description: `有効値 ${inc.totalNonNullCount.toLocaleString()}件のうち ${inc.nonNumericCount.toLocaleString()}件が数値として解釈できず、文字列カラムとして扱われています。`,
      metricValue: inc.nonNumericCount,
      metricLabel: `${inc.nonNumericCount}件 非数値混在`,
    });
  }

  // 6. 外れ値候補の検出
  for (const numProfile of Object.values(profile.numericProfiles)) {
    if (numProfile.outlierCount > 0) {
      const ratio =
        numProfile.count > 0 ? (numProfile.outlierCount / numProfile.count) * 100 : 0;
      issues.push({
        id: `outlier-${numProfile.columnName}`,
        columnName: numProfile.columnName,
        kind: 'outliers',
        severity: ratio >= 5 ? 'medium' : 'low',
        title: `「${numProfile.columnName}」で外れ値候補（${numProfile.outlierCount.toLocaleString()}件）を検出`,
        description: `四分位範囲（IQR法）に基づく基準外のデータが ${numProfile.outlierCount.toLocaleString()}件（${ratio.toFixed(1)}%）存在します。平均値が外れ値に引き上げられている可能性があります。`,
        metricValue: numProfile.outlierCount,
        metricLabel: `${numProfile.outlierCount.toLocaleString()}件 外れ値候補`,
      });
    }
  }

  return issues;
}
