import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight, ChevronDown, ChevronUp, Clock, Layers, Server } from 'lucide-react';
import type { TraceSummary } from '../../api/client';
import { cn } from '../../lib/cn';
import { getTraceStatusStyle } from '../../lib/theme';
import CopyButton from '../ui/CopyButton';

function TraceStatusBadge({ statusCode }: { statusCode: number }) {
  const style = getTraceStatusStyle(statusCode);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]',
        style.text,
      )}
    >
      {style.label}
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
            <div className="mt-1 flex items-center gap-2">
              <p className="break-all font-mono text-xs text-slate-300">{trace.trace_id}</p>
              <CopyButton value={trace.trace_id} className="shrink-0" />
            </div>
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

type SortField = 'start_time' | 'duration_ms' | 'status_code';
type SortOrder = 'asc' | 'desc';

interface TraceTableProps {
  traces: TraceSummary[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

function TraceTable({ traces, sortField, sortOrder, onSort }: TraceTableProps) {
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="ml-1 inline-block w-3" />;
    return sortOrder === 'asc' ? <ChevronUp size={12} className="ml-1 inline-block" /> : <ChevronDown size={12} className="ml-1 inline-block" />;
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="cursor-pointer px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center">
        {label}
        {getSortIcon(field)}
      </div>
    </th>
  );

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-slate-900/50">
          <tr>
            <SortableHeader field="start_time" label="요청 시간" />
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">요청 ID</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">시작 서비스</th>
            <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">수행 작업</th>
            <SortableHeader field="duration_ms" label="소요 시간" />
            <SortableHeader field="status_code" label="결과" />
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
                <div className="flex items-center gap-2">
                  <Link
                    to={`/traces/${trace.trace_id}`}
                    className="text-xs font-mono text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                  >
                    {trace.trace_id.substring(0, 8)}...
                  </Link>
                  <CopyButton value={trace.trace_id} iconSize={12} className="opacity-0 group-hover:opacity-100 transition-opacity p-1" />
                </div>
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
  const [sortField, setSortField] = useState<SortField>('start_time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // default to desc for new sorted field
    }
  };

  const sortedTraces = useMemo(() => {
    return [...traces].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'start_time') {
        comparison = a.start_time - b.start_time;
      } else if (sortField === 'duration_ms') {
        comparison = a.duration_ms - b.duration_ms;
      } else if (sortField === 'status_code') {
        // ERROR(2) > UNSET(0) > OK(1)
        const order = { 2: 3, 0: 2, 1: 1 };
        comparison = (order[a.status_code as keyof typeof order] || 0) - (order[b.status_code as keyof typeof order] || 0);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [traces, sortField, sortOrder]);

  return (
    <>
      <TraceTable traces={sortedTraces} sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
      <div className="space-y-4 p-4 md:hidden">
        {/* 모바일에서도 일단 정렬 버튼 추가 필요 시 기능 추가 가능. 현재는 목록만 정렬 됨 */}
        <div className="flex items-center justify-end mb-2 text-xs text-slate-400">
          <span className="mr-2">정렬 기준:</span>
          <select 
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
            value={`${sortField}|${sortOrder}`}
            onChange={(e) => {
              const [valField, valOrder] = e.target.value.split('|');
              setSortField(valField as SortField);
              setSortOrder(valOrder as SortOrder);
            }}
          >
            <option value="start_time|desc">요청 시간 (최신순)</option>
            <option value="start_time|asc">요청 시간 (오래된순)</option>
            <option value="duration_ms|desc">소요 시간 (오래 걸린순)</option>
            <option value="duration_ms|asc">소요 시간 (짧게 걸린순)</option>
            <option value="status_code|desc">결과 (에러 우선)</option>
          </select>
        </div>
        {sortedTraces.map((trace) => (
          <TraceMobileCard key={trace.trace_id} trace={trace} />
        ))}
      </div>
    </>
  );
}
