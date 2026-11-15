import type { KpiCardData } from '@/src/types/analysis';

interface KpiStripProps {
  kpis: KpiCardData[];
  isUpdating?: boolean;
}

export function KpiStrip({ kpis, isUpdating }: KpiStripProps) {
  if (kpis.length === 0) return null;

  return (
    <section aria-label="主要KPI" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const deltaColor =
          kpi.deltaTone === 'positive'
            ? 'text-emerald-700'
            : kpi.deltaTone === 'negative'
              ? 'text-red-700'
              : 'text-slate-600';

        return (
          <div
            key={kpi.id}
            className={`rounded-xl border border-slate-200 bg-white p-5 transition-opacity ${
              isUpdating ? 'opacity-65' : 'opacity-100'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 truncate">{kpi.label}</p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {kpi.value}
              </p>
              {kpi.deltaText && (
                <span className={`text-xs font-semibold whitespace-nowrap ${deltaColor}`}>
                  {kpi.deltaText}
                </span>
              )}
            </div>
            {kpi.subtext && (
              <p className="mt-1.5 text-xs text-slate-500 tabular-nums truncate">
                {kpi.subtext}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
