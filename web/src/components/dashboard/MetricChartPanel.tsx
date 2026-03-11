import { Inbox } from 'lucide-react';

interface MetricChartPanelProps {
  children?: React.ReactNode;
  emptyLabel?: string;
  title: React.ReactNode;
}

export default function MetricChartPanel({
  children,
  emptyLabel = '표시할 시계열 데이터가 없습니다.',
  title,
}: MetricChartPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-sm md:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-100">{title}</div>
      </div>
      <div className="h-72">
        {children ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 px-6 text-center text-sm text-slate-500">
            <div className="flex flex-col items-center gap-3">
              <Inbox size={18} />
              <span>{emptyLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
