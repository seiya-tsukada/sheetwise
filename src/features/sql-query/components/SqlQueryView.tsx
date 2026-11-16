import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, History, Loader2, Play } from 'lucide-react';
import { escapeIdentifier } from '@/src/lib/duckdb/queryBuilder';
import { buildSqlTemplates, USER_SQL_TABLE_ALIAS } from '@/src/lib/duckdb/sqlQueryBuilder';
import type { ColumnSchema, GlobalFilterState } from '@/src/types/analysis';
import { runUserSql, userSqlErrorMessage, type UserSqlResult } from '../services/sqlQueryService';
import { SqlEditor, type SqlEditorHandle } from './SqlEditor';

interface SqlQueryViewProps {
  tableName: string;
  schema: ColumnSchema[];
  filters: GlobalFilterState;
}

const DRAFT_KEY = 'sheetwise.sql.draft';
const HISTORY_KEY = 'sheetwise.sql.history';
const HISTORY_LIMIT = 20;
const PAGE_SIZE = 50;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

function countActiveFilters(filters: GlobalFilterState): number {
  const categories = Object.values(filters.categoryFilters).filter((v) => v && v.length > 0).length;
  return categories + (filters.dateFilter ? 1 : 0) + (filters.numericFilter ? 1 : 0);
}

function isNumericType(type: string): boolean {
  return /^(Int|Uint|Float|Decimal)/i.test(type);
}

function formatCell(val: unknown, numeric: boolean): string {
  if (val === null || val === undefined) return 'NULL';
  if (numeric && typeof val === 'number') {
    return val.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
  }
  return String(val);
}

/** 識別子として素のまま書ける名前はそのまま、それ以外はダブルクォートで囲む */
function columnToken(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : escapeIdentifier(name);
}

export function SqlQueryView({ tableName, schema, filters }: SqlQueryViewProps) {
  const templates = useMemo(() => buildSqlTemplates(schema), [schema]);
  const columnNames = useMemo(() => schema.map((c) => c.name), [schema]);
  const editorRef = useRef<SqlEditorHandle>(null);

  const [sql, setSql] = useState<string>(() =>
    readStorage(DRAFT_KEY, templates[0]?.sql ?? `SELECT * FROM ${USER_SQL_TABLE_ALIAS} LIMIT 100`)
  );
  const [history, setHistory] = useState<string[]>(() => readStorage(HISTORY_KEY, []));
  const [applyFilters, setApplyFilters] = useState(true);
  const [result, setResult] = useState<UserSqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRunSql, setLastRunSql] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeFilterCount = countActiveFilters(filters);

  const handleChange = useCallback((next: string) => {
    setSql(next);
    writeStorage(DRAFT_KEY, next);
  }, []);

  const execute = useCallback(
    async (targetSql: string, page: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await runUserSql({
          sql: targetSql,
          tableName,
          schema,
          filters: applyFilters ? filters : undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        setResult(res);
        setLastRunSql(targetSql);
        if (page === 1) {
          setHistory((prev) => {
            const trimmed = targetSql.trim();
            const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, HISTORY_LIMIT);
            writeStorage(HISTORY_KEY, next);
            return next;
          });
        }
      } catch (err) {
        setError(userSqlErrorMessage(err));
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [applyFilters, filters, schema, tableName]
  );

  const handleRun = useCallback(() => {
    if (!loading) void execute(sql, 1);
  }, [execute, loading, sql]);

  const handleSelectSql = (next: string) => {
    handleChange(next);
    setHistoryOpen(false);
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.totalRows / result.pageSize)) : 1;
  const currentPage = result?.page ?? 1;
  const goToPage = (page: number) => {
    if (lastRunSql !== null) void execute(lastRunSql, page);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-2">
          <SqlEditor
            ref={editorRef}
            value={sql}
            columns={columnNames}
            onChange={handleChange}
            onRun={handleRun}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={applyFilters}
                onChange={(e) => setApplyFilters(e.target.checked)}
                className="h-3.5 w-3.5 accent-slate-900"
              />
              <span>
                ダッシュボードのフィルターを適用
                <span className="text-slate-400">
                  {activeFilterCount > 0 ? `（${activeFilterCount} 件適用中）` : '（未設定）'}
                </span>
              </span>
            </label>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>履歴</span>
                </button>
                {historyOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-[min(28rem,80vw)] rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {history.length === 0 ? (
                      <p className="px-3 py-2 text-slate-500">実行したSQLがここに残ります。</p>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto">
                        {history.map((h) => (
                          <li key={h}>
                            <button
                              type="button"
                              onClick={() => handleSelectSql(h)}
                              className="block w-full truncate rounded px-3 py-1.5 text-left font-mono text-[11px] text-slate-700 hover:bg-slate-50 cursor-pointer"
                              title={h}
                            >
                              {h.replace(/\s+/g, ' ')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRun}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>実行</span>
                <kbd className="ml-0.5 font-sans text-[10px] text-slate-400">⌘↵</kbd>
              </button>
            </div>
          </div>
        </div>

        <aside
          aria-label="列一覧"
          className="rounded-lg border border-slate-200 p-3 text-xs lg:max-h-[260px] lg:overflow-y-auto"
        >
          <p className="text-slate-500">
            テーブル: <code className="rounded bg-slate-100 px-1 font-mono text-slate-800">{USER_SQL_TABLE_ALIAS}</code>
          </p>
          <ul className="mt-2 space-y-0.5">
            {schema.map((col) => (
              <li key={col.name}>
                <button
                  type="button"
                  onClick={() => editorRef.current?.insert(columnToken(col.name))}
                  title="クリックでカーソル位置に挿入"
                  className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50 cursor-pointer"
                >
                  <span className="truncate text-slate-800">{col.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{col.duckdbType}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">クリックでカーソル位置に挿入</p>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500">テンプレート:</span>
        {templates.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => handleSelectSql(t.sql)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <pre className="whitespace-pre-wrap break-words font-mono">{error}</pre>
        </div>
      )}

      {result && (
        <>
          <p className="text-xs text-slate-500 tabular-nums">
            {result.totalRows.toLocaleString('ja-JP')} 行 · {result.elapsedMs.toLocaleString('ja-JP')} ms
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  {result.columns.map((col) => (
                    <th
                      key={col.name}
                      className={`py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap ${
                        isNumericType(col.type) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-50' : ''}`}>
                {result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(1, result.columns.length)}
                      className="py-10 text-center text-xs text-slate-500"
                    >
                      結果は0行でした。
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80">
                      {result.columns.map((col) => {
                        const val = row[col.name];
                        const numeric = isNumericType(col.type);
                        const isNull = val === null || val === undefined;
                        return (
                          <td
                            key={col.name}
                            className={`px-3 py-2.5 whitespace-nowrap ${
                              numeric ? 'text-right font-mono tabular-nums' : 'text-left'
                            } ${isNull ? 'text-slate-400 italic' : 'text-slate-800'}`}
                          >
                            {formatCell(val, numeric)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 tabular-nums">
              <span>
                ページ {currentPage} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => goToPage(currentPage - 1)}
                  aria-label="前のページ"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>前へ</span>
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => goToPage(currentPage + 1)}
                  aria-label="次のページ"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <span>次へ</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!result && !error && (
        <p className="py-6 text-center text-xs text-slate-500">
          SQLを書いて「実行」を押すと、ここに結果が表示されます。
        </p>
      )}
    </div>
  );
}
