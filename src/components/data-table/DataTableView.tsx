import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Code2, Search, Table2 } from 'lucide-react';
import { SqlQueryView } from '@/src/features/sql-query/components/SqlQueryView';
import type {
  ColumnSchema,
  GlobalFilterState,
  TableQueryParams,
  TableQueryResult,
} from '@/src/types/analysis';

type TableMode = 'table' | 'sql';

interface DataTableViewProps {
  tableName: string;
  filters: GlobalFilterState;
  schema: ColumnSchema[];
  params: TableQueryParams;
  result: TableQueryResult | null;
  loading: boolean;
  onChangeParams: (next: TableQueryParams) => void;
}

export function DataTableView({
  tableName,
  filters,
  schema,
  params,
  result,
  loading,
  onChangeParams,
}: DataTableViewProps) {
  const [mode, setMode] = useState<TableMode>('table');
  const [searchDraft, setSearchDraft] = useState(params.search);
  const [filterColumn, setFilterColumn] = useState<string>(schema[0]?.name ?? '');
  const [filterValueDraft, setFilterValueDraft] = useState<string>('');

  useEffect(() => {
    setSearchDraft(params.search);
  }, [params.search]);

  useEffect(() => {
    if (schema.length > 0 && !schema.some((s) => s.name === filterColumn)) {
      setFilterColumn(schema[0].name);
    }
  }, [filterColumn, schema]);

  const totalMatching = result?.totalMatchingRows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatching / params.pageSize));
  const currentPage = Math.min(params.page, totalPages);

  const handleSort = (colName: string) => {
    const isSame = params.sortColumn === colName;
    const nextDir: 'asc' | 'desc' =
      isSame && params.sortDirection === 'asc' ? 'desc' : 'asc';
    onChangeParams({
      ...params,
      page: 1,
      sortColumn: colName,
      sortDirection: nextDir,
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeParams({
      ...params,
      page: 1,
      search: searchDraft,
    });
  };

  const handleColumnFilterApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterColumn) return;
    const nextColFilters = { ...params.columnFilters };
    if (filterValueDraft.trim() === '') {
      delete nextColFilters[filterColumn];
    } else {
      nextColFilters[filterColumn] = filterValueDraft.trim();
    }
    onChangeParams({
      ...params,
      page: 1,
      columnFilters: nextColFilters,
    });
  };

  const handleClearColumnFilter = (colName: string) => {
    const nextColFilters = { ...params.columnFilters };
    delete nextColFilters[colName];
    if (colName === filterColumn) setFilterValueDraft('');
    onChangeParams({
      ...params,
      page: 1,
      columnFilters: nextColFilters,
    });
  };

  const activeColFilterEntries = Object.entries(params.columnFilters);

  return (
    <section
      aria-label="データテーブル"
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            CSVデータテーブル
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {mode === 'sql'
              ? 'data テーブルに SELECT 文を実行（データは変更されません）'
              : `DuckDBから現在のページ分のみをオンデマンド取得 · 該当 ${totalMatching.toLocaleString('ja-JP')} 件`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="表示モード"
            className="inline-flex rounded-lg border border-slate-300 p-0.5 text-xs"
          >
            {(
              [
                { key: 'table', label: 'テーブル', Icon: Table2 },
                { key: 'sql', label: 'SQL', Icon: Code2 },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                  mode === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {mode === 'table' && (
            <>
            {/* 全体検索 */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="テーブル全文検索"
                  placeholder="キーワードで検索..."
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="w-48 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:w-56"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                検索
              </button>
            </form>

            {/* カラム個別フィルター */}
            <form onSubmit={handleColumnFilterApply} className="flex items-center gap-1.5">
              <select
                aria-label="絞り込み対象カラム"
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                {schema.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="カラム値フィルター"
                placeholder="カラム絞り込み値..."
                value={filterValueDraft}
                onChange={(e) => setFilterValueDraft(e.target.value)}
                className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                絞込
              </button>
            </form>
            </>
          )}
        </div>
      </div>

      {mode === 'sql' ? (
        <SqlQueryView tableName={tableName} schema={schema} filters={filters} />
      ) : (
        <>

        {/* 適用中のカラムフィルター一覧 */}
        {activeColFilterEntries.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="font-medium text-slate-500">適用中の列フィルター:</span>
            {activeColFilterEntries.map(([col, val]) => (
              <button
                key={col}
                type="button"
                onClick={() => handleClearColumnFilter(col)}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span>
                  {col}: &quot;{val}&quot;
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        {/* テーブル本体 */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                {schema.map((col) => {
                  const isSorted = params.sortColumn === col.name;
                  const isNumeric = col.dataType === 'Integer' || col.dataType === 'Float';
                  return (
                    <th
                      key={col.name}
                      className={`py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap ${
                        isNumeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.name)}
                        className={`inline-flex items-center gap-1 hover:text-blue-700 cursor-pointer ${
                          isNumeric ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <span>{col.name}</span>
                        {isSorted ? (
                          params.sortDirection === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-blue-600" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-blue-600" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`}>
                    {schema.map((col) => (
                      <td key={col.name} className="px-3 py-2.5">
                        <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !result || result.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, schema.length)}
                    className="py-10 text-center text-xs text-slate-500"
                  >
                    該当するレコードが見つかりません。検索条件またはフィルターを変更してください。
                  </td>
                </tr>
              ) : (
                result.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/80">
                    {schema.map((col) => {
                      const val = row[col.name];
                      const isNull = val === null || val === undefined || val === '';
                      const isNumeric = col.dataType === 'Integer' || col.dataType === 'Float';
                      return (
                        <td
                          key={col.name}
                          className={`px-3 py-2.5 whitespace-nowrap ${
                            isNumeric ? 'text-right font-mono tabular-nums' : 'text-left'
                          } ${isNull ? 'text-slate-400 italic' : 'text-slate-800'}`}
                        >
                          {isNull
                            ? 'NULL'
                            : isNumeric && typeof val === 'number'
                              ? val.toLocaleString('ja-JP')
                              : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <label htmlFor="table-pagesize" className="text-slate-500">
              表示件数:
            </label>
            <select
              id="table-pagesize"
              value={params.pageSize}
              onChange={(e) =>
                onChangeParams({
                  ...params,
                  page: 1,
                  pageSize: Number(e.target.value),
                })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value={25}>25件</option>
              <option value={50}>50件</option>
              <option value={100}>100件</option>
            </select>
          </div>

          <div className="flex items-center gap-3 tabular-nums">
            <span>
              ページ {currentPage} / {totalPages}（全 {totalMatching.toLocaleString('ja-JP')} 件）
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => onChangeParams({ ...params, page: currentPage - 1 })}
                aria-label="前のページ"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>前へ</span>
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages || loading}
                onClick={() => onChangeParams({ ...params, page: currentPage + 1 })}
                aria-label="次のページ"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <span>次へ</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </section>
  );
}
