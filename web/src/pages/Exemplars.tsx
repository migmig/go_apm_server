import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Exemplar } from '../api/client';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { GitBranch, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { PageEmptyState, PageErrorState, PageLoadingState } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';

interface ChartPoint {
  timestamp: number;
  value: number;
  trace_id: string;
  span_id: string;
  metric_type: string;
}

const METRIC_TYPE_COLORS: Record<string, string> = {
  histogram: '#3b82f6',
  exponential_histogram: '#8b5cf6',
  sum: '#f59e0b',
  gauge: '#10b981',
};

function MetricTypeLabel({ type }: { type: string }) {
  const color = METRIC_TYPE_COLORS[type] ?? '#64748b';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

export default function Exemplars() {
  const [exemplars, setExemplars] = useState<Exemplar[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metricName, setMetricName] = useState('');
  const [inputValue, setInputValue] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const now = Date.now();
      const oneHourAgo = now - 3600_000;
      const data = await api.getExemplars({
        metric_name: metricName || undefined,
        start: String(oneHourAgo),
        end: String(now),
        limit: 200,
      });
      setExemplars(data);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, 'Exemplar 데이터를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [metricName]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const chartData: ChartPoint[] = exemplars.map((e) => ({
    timestamp: Math.floor(e.timestamp / 1e6),
    value: e.value,
    trace_id: e.trace_id,
    span_id: e.span_id,
    metric_type: e.metric_type,
  }));

  const viewState = getAsyncViewState({
    hasData: exemplars.length > 0 || !loading,
    isLoading: loading,
    isEmpty: exemplars.length === 0 && !loading,
    errorMessage,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Exemplars</h1>
          <p className="mt-1 text-sm text-slate-400">
            메트릭에서 추출된 Exemplar 포인트를 통해 관련 트레이스로 바로 이동할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="메트릭 이름으로 필터 (예: http.server.duration)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setMetricName(inputValue);
          }}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => setMetricName(inputValue)}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          검색
        </button>
      </div>

      {viewState === 'loading' && (
        <PageLoadingState title="Exemplar 데이터를 불러오는 중입니다" description="메트릭-트레이스 연관 데이터를 수집하고 있습니다." />
      )}
      {viewState === 'error' && (
        <PageErrorState title="Exemplar를 불러오지 못했습니다" description={errorMessage ?? ''} onAction={fetchData} />
      )}
      {viewState === 'empty' && (
        <PageEmptyState
          title="표시할 Exemplar 데이터가 없습니다"
          description="OTLP 메트릭에 Exemplar가 포함된 데이터를 수집하면 여기에 표시됩니다."
          actionLabel="다시 확인"
          onAction={fetchData}
        />
      )}

      {viewState === 'ready' && (
        <>
          <div className="bg-[#0f172a] p-6 rounded-xl border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center">
                <GitBranch className="mr-3 text-blue-500" size={20} />
                Exemplar 타임라인
              </h2>
              <span className="text-xs text-slate-400 font-mono">{exemplars.length}건</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis
                    dataKey="timestamp"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(ts) => format(ts, 'HH:mm')}
                  />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                    labelFormatter={(ts) => format(ts, 'HH:mm:ss')}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value.toFixed(4)}`,
                      `${props.payload.metric_type} (trace: ${props.payload.trace_id.slice(0, 8)}...)`,
                    ]}
                  />
                  <Line type="monotone" dataKey="value" stroke="#334155" strokeWidth={1} dot={false} />
                  <Scatter dataKey="value" fill="#3b82f6">
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={METRIC_TYPE_COLORS[entry.metric_type] ?? '#64748b'}
                      />
                    ))}
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(METRIC_TYPE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {type.replace('_', ' ')}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
            <div className="border-b border-slate-800 px-4 py-5 md:px-6 lg:px-8">
              <h2 className="text-lg font-semibold text-slate-200">Exemplar 목록</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900/30">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6">시간</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6">메트릭</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6">타입</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6">값</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {exemplars.map((e, i) => (
                    <tr key={`${e.trace_id}-${e.span_id}-${i}`} className="hover:bg-slate-800/20 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400 md:px-6">
                        {format(Math.floor(e.timestamp / 1e6), 'HH:mm:ss.SSS')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-200 md:px-6 font-medium">
                        {e.metric_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 md:px-6">
                        <MetricTypeLabel type={e.metric_type} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-300 md:px-6">
                        {e.value.toFixed(4)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 md:px-6">
                        <Link
                          to={`/traces/${e.trace_id}?span_id=${e.span_id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {e.trace_id.slice(0, 12)}...
                          <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
