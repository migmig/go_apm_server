import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight, ChevronDown, ChevronUp, Clock, Layers, Server } from 'lucide-react';
import type { TraceSummary } from '../../api/client';
import { cn } from '../../lib/cn';

function TraceStatusBadge({ statusCode }: { statusCode: number }) {
  const failed = statusCode === 2;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]',
        failed
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      )}
    >
      {failed ? '실패' : '성공'}
    </span>
  );
}

function TraceAttributes({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes ?? {});

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">부가 정보가 없습니다.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.slice(0, 4).map(([key, value]) => (
        <span
          key={key}
          className="inline-flex max-w-full items-center rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400"
        >
          <span className="mr-1 text-blue-300/70">{key}:</span>
          <span className="truncate">{String(value)}</span>
        </span>
      ))}
    </div>
  );
}

function TraceMobileCard({ trace }: { trace: TraceSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{trace.root_span}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center">
              <Server size={12} className="mr-1.5 text-blue-300" />
              {trace.root_service}
            </span>
            <span className="inline-flex items-center">
              <Clock size={12} className="mr-1.5 text-amber-300" />
              {trace.duration_ms.toFixed(2)} ms
            </span>
          </div>
        </div>
        <TraceStatusBadge statusCode={trace.status_code} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-[#0f172a] p-3 text-xs text-slate-400">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">요청 시간</p>
          <p className="mt-1 font-mono text-slate-300">{format(trace.start_time / 1e6, 'yyyy-MM-dd HH:mm:ss')}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Span 수</p>
          <p className="mt-1 inline-flex items-center font-mono text-slate-300">
            <Layers size={12} className="mr-1.5 text-slate-500" />
            {trace.span_count}
          </p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-[#0f172a] p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Trace ID</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-300">{trace.trace_id}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">부가 정보</p>
            <div className="mt-2">
              <TraceAttributes attributes={trace.attributes} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          {expanded ? <ChevronUp size={14} className="mr-1.5" /> : <ChevronDown size={14} className="mr-1.5" />}
          {expanded ? '접기' : '더보기'}
        </button>
        <Link
          to={`/traces/${trace.trace_id}`}
          className="inline-flex items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 transition-colors hover:border-blue-400/30 hover:bg-blue-500/15"
        >
          상세 보기
          <ArrowRight size={14} className="ml-1.5" />
        </Link>
      </div>
    </article>
  );
}

function TraceTable({ traces }: { traces: TraceSummary[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-slate-900/50">
          <tr>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">요청 시간</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">요청 ID</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">시작 서비스</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">수행 작업</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">소요 시간</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">결과</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">부가 정보</th>
            <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {traces.map((trace) => (
            <tr key={trace.trace_id} className="group transition-colors hover:bg-slate-800/40">
              <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400">
                {format(trace.start_time / 1e6, 'yyyy-MM-dd HH:mm:ss')}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <Link
                  to={`/traces/${trace.trace_id}`}
                  className="text-xs font-mono text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                >
                  {trace.trace_id.substring(0, 8)}...
                </Link>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-slate-200">{trace.root_service}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 max-w-[200px] truncate" title={trace.root_span}>
                <span className="text-sm text-slate-400 transition-colors group-hover:text-slate-200">{trace.root_span}</span>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <div className="flex items-center text-xs font-mono text-slate-300">
                  <Clock size={12} className="mr-1.5 text-slate-500" />
                  {trace.duration_ms.toFixed(2)} ms
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <TraceStatusBadge statusCode={trace.status_code} />
              </td>
              <td className="px-6 py-4">
                <TraceAttributes attributes={trace.attributes} />
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-right">
                <Link
                  to={`/traces/${trace.trace_id}`}
                  className="inline-flex items-center text-xs font-bold text-blue-400 transition-colors hover:text-blue-300"
                >
                  상세 보기
                  <ArrowRight size={14} className="ml-1" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TraceList({ traces }: { traces: TraceSummary[] }) {
  return (
    <>
      <TraceTable traces={traces} />
      <div className="space-y-4 p-4 md:hidden">
        {traces.map((trace) => (
          <TraceMobileCard key={trace.trace_id} trace={trace} />
        ))}
      </div>
    </>
  );
}
