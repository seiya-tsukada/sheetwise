import { Filter, RotateCcw } from 'lucide-react';
import type { AnalysisResult, GlobalFilterState } from '@/src/types/analysis';

interface FilterBarProps {
  analysis: AnalysisResult;
  filters: GlobalFilterState;
  onApplyFilters: (next: GlobalFilterState) => void;
  isFiltering: boolean;
}

export function FilterBar({
  analysis,
  filters,
  onApplyFilters,
  isFiltering,
}: FilterBarProps) {
  const categoryCols = analysis.schema
    .filter((c) => {
      if (c.role !== 'category' && c.role !== 'boolean') return false;
      const prof = analysis.profile.categoryProfiles[c.name];
      const uniq = prof?.uniqueCount ?? c.uniqueCount;
      return uniq >= 2 && uniq <= 25;
    })
    .slice(0, 2);

  const dateCol = analysis.schema.find((c) => c.role === 'date');
  const dateProfile = dateCol ? analysis.profile.dateProfiles[dateCol.name] : undefined;

  const metricCol = analysis.schema.find((c) => c.role === 'metric');
  const metricProfile = metricCol ? analysis.profile.numericProfiles[metricCol.name] : undefined;

  const hasActiveFilter =
    Object.values(filters.categoryFilters).some((v) => v.length > 0) ||
    Boolean(filters.dateFilter?.start || filters.dateFilter?.end) ||
    filters.numericFilter?.min !== undefined ||
    filters.numericFilter?.max !== undefined;

  if (categoryCols.length === 0 && !dateCol && !metricCol) {
    return null;
  }

  const handleCategoryChange = (colName: string, value: string) => {
    const nextCat = { ...filters.categoryFilters };
    if (value === '') {
      delete nextCat[colName];
    } else {
      nextCat[colName] = [value];
    }
    onApplyFilters({
      ...filters,
      categoryFilters: nextCat,
    });
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    if (!dateCol) return;
    const current = filters.dateFilter ?? { column: dateCol.name };
    const updated = {
      ...current,
      column: dateCol.name,
      [field]: value || undefined,
    };
    if (!updated.start && !updated.end) {
      onApplyFilters({ ...filters, dateFilter: undefined });
    } else {
      onApplyFilters({ ...filters, dateFilter: updated });
    }
  };

  const handleNumericChange = (field: 'min' | 'max', rawVal: string) => {
    if (!metricCol) return;
    const parsed = rawVal.trim() === '' ? undefined : Number(rawVal);
    if (parsed !== undefined && !Number.isFinite(parsed)) return;

    const current = filters.numericFilter ?? { column: metricCol.name };
    const updated = {
      ...current,
      column: metricCol.name,
      [field]: parsed,
    };
    if (updated.min === undefined && updated.max === undefined) {
      onApplyFilters({ ...filters, numericFilter: undefined });
    } else {
      onApplyFilters({ ...filters, numericFilter: updated });
    }
  };

  return (
    <section
      aria-label="グローバルフィルター"
      className="rounded-xl border border-slate-200 bg-white px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Filter className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <span>ダッシュボード全体フィルター</span>
          {isFiltering && (
            <span className="text-blue-600 font-normal">· 再集計中...</span>
          )}
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() =>
              onApplyFilters({
                categoryFilters: {},
                dateFilter: undefined,
                numericFilter: undefined,
              })
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>フィルターをリセット</span>
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categoryCols.map((col) => {
          const catProf = analysis.profile.categoryProfiles[col.name];
          const options = catProf?.topCategories ?? [];
          const selected = filters.categoryFilters[col.name]?.[0] ?? '';

          return (
            <div key={col.name} className="flex flex-col gap-1">
              <label
                htmlFor={`filter-cat-${col.name}`}
                className="text-xs font-medium text-slate-600 truncate"
              >
                {col.name}
              </label>
              <select
                id={`filter-cat-${col.name}`}
                value={selected}
                onChange={(e) => handleCategoryChange(col.name, e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">すべて</option>
                {options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value === '(欠損)' ? '__NULL__' : opt.value}
                  >
                    {opt.value} ({opt.count})
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        {dateCol && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600 truncate">
              {dateCol.name}（期間）
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label={`${dateCol.name} 開始日`}
                value={filters.dateFilter?.start ?? ''}
                min={dateProfile?.minDate ?? undefined}
                max={dateProfile?.maxDate ?? undefined}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 tabular-nums focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">〜</span>
              <input
                type="date"
                aria-label={`${dateCol.name} 終了日`}
                value={filters.dateFilter?.end ?? ''}
                min={dateProfile?.minDate ?? undefined}
                max={dateProfile?.maxDate ?? undefined}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 tabular-nums focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {metricCol && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600 truncate">
              {metricCol.name}（範囲）
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                aria-label={`${metricCol.name} 最小値`}
                placeholder={
                  metricProfile?.min !== null && metricProfile?.min !== undefined
                    ? `最小 ${metricProfile.min}`
                    : '最小'
                }
                value={filters.numericFilter?.min ?? ''}
                onChange={(e) => handleNumericChange('min', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 tabular-nums focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">〜</span>
              <input
                type="number"
                aria-label={`${metricCol.name} 最大値`}
                placeholder={
                  metricProfile?.max !== null && metricProfile?.max !== undefined
                    ? `最大 ${metricProfile.max}`
                    : '最大'
                }
                value={filters.numericFilter?.max ?? ''}
                onChange={(e) => handleNumericChange('max', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 tabular-nums focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
