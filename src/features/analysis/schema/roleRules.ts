import type { ColumnRole, InferredDataType } from '@/src/types/analysis';

const ID_NAME_PATTERN =
  /(^|[_\-\s])(id|uuid|code|cd|key|no|num|serial|sku|番号|コード|キー|品番)([_\-\s]|$)|(id|番号|コード)$/i;

const METRIC_NAME_PATTERN =
  /(sales|amount|revenue|price|cost|profit|margin|qty|quantity|count|total|sum|avg|score|rate|ratio|weight|height|duration|salary|budget|spend|ad|click|impression|conversion|age|stock|inventory|売上|金額|単価|数量|利益|原価|広告|費用|コスト|スコア|年齢|在庫|給与|年収|時間|点数|評価|件数|アクセス|クリック)/i;

/** 役割推定で使う閾値 */
export const ROLE_THRESHOLDS = {
  /** 整数ID判定: 最低行数 */
  integerIdMinRows: 10,
  /** 整数ID判定: ユニーク率の下限 */
  integerIdMinUniqueRate: 0.96,
  /** 2値フラグ判定: ユニーク数の上限 */
  binaryMaxUnique: 2,
  /** 文字列の2値フラグ判定: 最低行数 */
  stringBinaryMinRows: 5,
  /** 高カーディナリティ文字列: 最低行数 / ユニーク率 / ユニーク数 */
  highCardMinRows: 10,
  highCardMinUniqueRate: 0.85,
  highCardMinUnique: 20,
  /** 高カーディナリティ文字列のうち ID とみなすユニーク率 */
  highCardIdMinUniqueRate: 0.98,
  /** 自由テキスト判定: ユニーク数 / ユニーク率 の下限（いずれも超過） */
  textMinUniqueExclusive: 60,
  textMinUniqueRateExclusive: 0.5,
} as const;

export interface ColumnRoleInput {
  name: string;
  dataType: InferredDataType;
  rowCount: number;
  uniqueCount: number;
  uniqueRate: number;
  isDateCoercible?: boolean;
  isNumericCoercible?: boolean;
}

/** ルール評価用に前計算したカラム特徴量 */
interface ColumnFeatures extends ColumnRoleInput {
  idLikeName: boolean;
  metricLikeName: boolean;
  isDateLike: boolean;
  isNumericLike: boolean;
}

interface RoleRule {
  /** ルール識別子（デバッグ・説明用） */
  id: string;
  role: ColumnRole;
  when: (f: ColumnFeatures) => boolean;
}

const T = ROLE_THRESHOLDS;

/**
 * カラム役割の推定ルール表（上から順に評価し最初にマッチしたものを採用）。
 * どれにもマッチしない場合は 'category'。
 */
export const COLUMN_ROLE_RULES: readonly RoleRule[] = [
  // --- 型そのものから確定する役割 ---
  { id: 'date-type', role: 'date', when: (f) => f.isDateLike },
  { id: 'boolean-type', role: 'boolean', when: (f) => f.dataType === 'Boolean' },

  // --- 名前がIDらしく、指標らしくない ---
  { id: 'id-by-name', role: 'id', when: (f) => f.idLikeName && !f.metricLikeName },

  // --- 数値（または数値変換可能）カラム ---
  {
    // 整数でほぼ全行ユニーク（かつ行数10件以上）で、明確な指標名でない場合はID候補
    id: 'numeric-unique-integer-id',
    role: 'id',
    when: (f) =>
      f.isNumericLike &&
      f.dataType === 'Integer' &&
      f.rowCount >= T.integerIdMinRows &&
      f.uniqueRate >= T.integerIdMinUniqueRate &&
      !f.metricLikeName,
  },
  {
    // 2値のみの整数フラグ（0/1等）で指標名でない場合
    id: 'numeric-binary-integer-flag',
    role: 'boolean',
    when: (f) =>
      f.isNumericLike &&
      f.dataType === 'Integer' &&
      f.uniqueCount <= T.binaryMaxUnique &&
      !f.metricLikeName,
  },
  { id: 'numeric-metric', role: 'metric', when: (f) => f.isNumericLike },

  // --- 文字列カラム ---
  { id: 'string-id-by-name', role: 'id', when: (f) => f.dataType === 'String' && f.idLikeName },
  {
    id: 'string-binary-flag',
    role: 'boolean',
    when: (f) =>
      f.dataType === 'String' &&
      f.uniqueCount <= T.binaryMaxUnique &&
      f.rowCount >= T.stringBinaryMinRows,
  },
  {
    // 高カーディナリティ文字列のうち、ほぼ全件ユニークで名前に空白がないものはID
    id: 'string-high-cardinality-id',
    role: 'id',
    when: (f) =>
      isHighCardinalityString(f) &&
      f.uniqueRate >= T.highCardIdMinUniqueRate &&
      !/\s/.test(f.name),
  },
  { id: 'string-high-cardinality-text', role: 'text', when: isHighCardinalityString },
  {
    id: 'string-many-values-text',
    role: 'text',
    when: (f) =>
      f.dataType === 'String' &&
      f.uniqueCount > T.textMinUniqueExclusive &&
      f.uniqueRate > T.textMinUniqueRateExclusive,
  },
];

const DEFAULT_ROLE: ColumnRole = 'category';

/** 行数の85%以上ユニークかつ20種以上の文字列 → ID または自由テキスト */
function isHighCardinalityString(f: ColumnFeatures): boolean {
  return (
    f.dataType === 'String' &&
    f.rowCount >= T.highCardMinRows &&
    f.uniqueRate >= T.highCardMinUniqueRate &&
    f.uniqueCount >= T.highCardMinUnique
  );
}

function extractFeatures(input: ColumnRoleInput): ColumnFeatures {
  const trimmedName = input.name.trim();
  return {
    ...input,
    idLikeName: ID_NAME_PATTERN.test(trimmedName),
    metricLikeName: METRIC_NAME_PATTERN.test(trimmedName),
    isDateLike:
      input.dataType === 'Date' || input.dataType === 'Timestamp' || Boolean(input.isDateCoercible),
    isNumericLike:
      input.dataType === 'Integer' || input.dataType === 'Float' || Boolean(input.isNumericCoercible),
  };
}

/**
 * カラムの型・名称・カーディナリティから分析上の役割を推定する（純粋関数）
 */
export function inferColumnRole(input: ColumnRoleInput): ColumnRole {
  const features = extractFeatures(input);
  return COLUMN_ROLE_RULES.find((rule) => rule.when(features))?.role ?? DEFAULT_ROLE;
}
