import { Upload } from 'lucide-react';

export type DashboardSectionTab = 'overview' | 'charts' | 'schema' | 'table';

interface AppHeaderProps {
  hasDataset: boolean;
  activeTab: DashboardSectionTab;
  onChangeTab: (tab: DashboardSectionTab) => void;
  onResetToUpload: () => void;
}

export function AppHeader({
  hasDataset,
  activeTab,
  onChangeTab,
  onResetToUpload,
}: AppHeaderProps) {
  const tabs: { id: DashboardSectionTab; label: string }[] = [
    { id: 'overview', label: '概要・インサイト' },
    { id: 'charts', label: 'グラフ分析' },
    { id: 'schema', label: 'スキーマ詳細' },
    { id: 'table', label: 'データテーブル' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 md:gap-8 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (hasDataset) onChangeTab('overview');
          }}
          className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Sheetwise
        </a>

        {hasDataset ? (
          <nav
            aria-label="分析ビュー切り替え"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChangeTab(tab.id)}
                  className={`relative py-4 text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-blue-600 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              );
            })}
          </nav>
        ) : null}

        <div className="flex items-center shrink-0">
          {hasDataset ? (
            <button
              type="button"
              onClick={onResetToUpload}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-slate-900 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">CSV変更</span>
              <span className="hidden sm:inline">別のCSVを読み込む</span>
            </button>
          ) : null}
        </div>
      </div>

      {hasDataset && (
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                className={`text-xs font-medium whitespace-nowrap shrink-0 px-2 py-1 rounded ${
                  active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
