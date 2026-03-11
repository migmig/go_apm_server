import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { LogRecord } from '../../api/client';
import { cn } from '../../lib/cn';
import { getLogSeverityStyle } from '../../lib/theme';

export default function LogItem({ log }: { log: LogRecord }) {
  const severity = getLogSeverityStyle(log.severity_number);

  return (
    <article
      className={cn(
        'rounded-xl border border-slate-800/80 border-l-2 px-4 py-3 transition-colors hover:bg-slate-800/30',
        severity.row,
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <span className="truncate font-semibold text-indigo-300">{log.service_name}</span>
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em]',
                severity.badge,
              )}
            >
              {(log.severity_text || 'INFO').toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="font-mono">{format(new Date(log.timestamp), 'HH:mm:ss.SSS')}</span>
            {log.trace_id ? (
              <Link
                to={`/traces/${log.trace_id}`}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] text-blue-300 transition-colors hover:border-slate-600 hover:text-blue-200"
              >
                trace:{log.trace_id.substring(0, 6)}
              </Link>
            ) : null}
          </div>
        </div>

        <p className="whitespace-pre-wrap break-all text-sm leading-6 text-slate-200">
          {log.body}
        </p>

        {Object.keys(log.attributes ?? {}).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(log.attributes).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex max-w-full items-center rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400"
              >
                <span className="mr-1 text-blue-300/70">{key}:</span>
                <span className="truncate">{String(value)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
