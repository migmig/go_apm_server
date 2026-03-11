import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/cn';

type StatTone = 'neutral' | 'success' | 'warning' | 'danger';

const toneStyles: Record<StatTone, { border: string; chip: string; value: string }> = {
  neutral: {
    border: 'border-slate-800',
    chip: 'bg-blue-500/10 text-blue-300',
    value: 'text-slate-100',
  },
  success: {
    border: 'border-emerald-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300',
    value: 'text-emerald-300',
  },
  warning: {
    border: 'border-amber-500/20',
    chip: 'bg-amber-500/10 text-amber-300',
    value: 'text-amber-300',
  },
  danger: {
    border: 'border-rose-500/30',
    chip: 'bg-rose-500/10 text-rose-300',
    value: 'text-rose-300',
  },
};

interface StatCardProps {
  hasChartData?: boolean;
  icon: LucideIcon;
  label: string;
  sparkline?: React.ReactNode;
  tone?: StatTone;
  value: string;
}

export default function StatCard({
  hasChartData = false,
  icon: Icon,
  label,
  sparkline,
  tone = 'neutral',
  value,
}: StatCardProps) {
  const styles = toneStyles[tone];

  return (
    <div className={cn('min-h-[11.5rem] rounded-2xl border bg-[#0f172a] p-5 shadow-sm', styles.border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className={cn('mt-4 font-mono text-lg font-bold tracking-tight sm:text-xl lg:text-2xl', styles.value)}>
            {value}
          </p>
        </div>
        <div className={cn('rounded-xl p-2.5', styles.chip)}>
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-8 h-14">
        {hasChartData && sparkline ? (
          sparkline
        ) : (
          <div className="flex h-full items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-3 text-xs text-slate-500">
            <Inbox size={14} className="shrink-0" />
            <span>No Data</span>
          </div>
        )}
      </div>
    </div>
  );
}
