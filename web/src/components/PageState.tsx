import { AlertTriangle, Inbox, Loader2, RefreshCcw } from 'lucide-react';
import { cn } from '../lib/cn';

type BannerTone = 'info' | 'warning' | 'error' | 'success';

interface ActionProps {
  actionLabel?: string;
  onAction?: () => void;
}

interface PanelProps extends ActionProps {
  className?: string;
  description?: string;
  title: string;
}

const bannerStyles: Record<BannerTone, string> = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
};

const bannerIconStyles: Record<BannerTone, string> = {
  info: 'bg-blue-500/15 text-blue-300',
  warning: 'bg-amber-500/15 text-amber-300',
  error: 'bg-rose-500/15 text-rose-300',
  success: 'bg-emerald-500/15 text-emerald-300',
};

function PanelAction({ actionLabel, onAction }: ActionProps) {
  if (!actionLabel || !onAction) {
    return null;
  }

  return (
    <button
      onClick={onAction}
      className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
    >
      <RefreshCcw size={14} className="mr-2" />
      {actionLabel}
    </button>
  );
}

export function PageLoadingState({
  title,
  description = '잠시만 기다려 주세요.',
  className,
}: Omit<PanelProps, 'actionLabel' | 'onAction'>) {
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#0f172a] px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 rounded-full bg-blue-500/10 p-3 text-blue-300">
        <Loader2 size={24} className="animate-spin" />
      </div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function PageEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: PanelProps) {
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#0f172a] px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 rounded-full bg-slate-800 p-3 text-slate-300">
        <Inbox size={24} />
      </div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p> : null}
      <div className="mt-5">
        <PanelAction actionLabel={actionLabel} onAction={onAction} />
      </div>
    </div>
  );
}

export function PageErrorState({
  title,
  description,
  actionLabel = '다시 시도',
  onAction,
  className,
}: PanelProps) {
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/5 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 rounded-full bg-rose-500/10 p-3 text-rose-300">
        <AlertTriangle size={24} />
      </div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-slate-300">{description}</p> : null}
      <div className="mt-5">
        <PanelAction actionLabel={actionLabel} onAction={onAction} />
      </div>
    </div>
  );
}

interface StatusBannerProps extends ActionProps {
  description?: string;
  title: string;
  tone?: BannerTone;
}

export function StatusBanner({
  title,
  description,
  tone = 'info',
  actionLabel,
  onAction,
}: StatusBannerProps) {
  return (
    <div className={cn('rounded-xl border px-4 py-4', bannerStyles[tone])}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn('rounded-lg p-2', bannerIconStyles[tone])}>
            <AlertTriangle size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {description ? <p className="mt-1 text-sm text-current/80">{description}</p> : null}
          </div>
        </div>
        <div className="shrink-0">
          <PanelAction actionLabel={actionLabel} onAction={onAction} />
        </div>
      </div>
    </div>
  );
}
