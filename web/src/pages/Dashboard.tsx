import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Stats, ServiceInfo } from '../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, AlertCircle, Clock, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { PageEmptyState, PageErrorState, PageLoadingState, StatusBanner } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';

function formatCount(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatLatency(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return `${value.toFixed(2)}ms`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async (backgroundRefresh = false) => {
    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [statsData, servicesData] = await Promise.all([api.getStats(), api.getServices()]);
      setStats(statsData);
      setServices(servicesData);
      setLastUpdatedAt(new Date());
      setErrorMessage(null);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
      setErrorMessage(getErrorMessage(err, '대시보드 데이터를 불러오지 못했습니다. API 서버 연결을 확인해 주세요.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      void fetchData(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const hasData = stats !== null;
  const isEmpty = stats !== null && stats.total_traces === 0 && stats.total_spans === 0 && services.length === 0;
  const viewState = getAsyncViewState({
    hasData,
    isLoading: loading,
    isEmpty,
    errorMessage,
  });
  const timeSeries = stats?.time_series ?? [];

  const statCards = useMemo(
    () => {
      const errorRate = stats?.error_rate ?? 0;

      return [
        { label: '전체 요청 수', value: formatCount(stats?.total_traces), icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10', dataKey: 'rps' },
        { label: '전체 작업(Span) 수', value: formatCount(stats?.total_spans), icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', dataKey: 'rps' },
        {
          label: '에러 발생률',
          value: `${(errorRate * 100).toFixed(2)}%`,
          icon: AlertCircle,
          color: errorRate > 0.05 ? 'text-rose-500' : 'text-rose-400',
          bg: 'bg-rose-500/10',
          warning: errorRate > 0.05,
          dataKey: 'error_rate',
        },
        { label: '평균 응답 시간', value: formatLatency(stats?.avg_latency_ms), icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10', dataKey: 'rps' },
      ];
    },
    [stats],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">시스템 현황판</h1>
          <p className="mt-1 text-sm font-mono uppercase tracking-tighter text-slate-400">모든 서비스 노드의 실시간 상태를 모니터링합니다</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">마지막 업데이트</p>
          <p className="text-xs text-slate-300 font-mono">
            {lastUpdatedAt ? format(lastUpdatedAt, 'HH:mm:ss') : '미수신'}
          </p>
        </div>
      </div>

      {errorMessage && hasData ? (
        <StatusBanner
          tone="warning"
          title="마지막 정상 데이터를 유지하고 있습니다."
          description={errorMessage}
          actionLabel={refreshing ? undefined : '지금 다시 시도'}
          onAction={refreshing ? undefined : () => void fetchData()}
        />
      ) : null}

      {viewState === 'loading' ? (
        <PageLoadingState
          title="시스템 지표를 불러오는 중입니다"
          description="서비스 요약, 요청량, 에러율 데이터를 수집하고 있습니다."
        />
      ) : null}

      {viewState === 'error' ? (
        <PageErrorState
          title="대시보드를 불러오지 못했습니다"
          description={errorMessage ?? 'API 서버 연결을 확인한 뒤 다시 시도해 주세요.'}
          onAction={() => void fetchData()}
        />
      ) : null}

      {viewState === 'empty' ? (
        <PageEmptyState
          title="표시할 관측 데이터가 없습니다"
          description="샘플 데이터를 보내거나 실제 서비스에서 OTLP 데이터를 수집하면 대시보드가 채워집니다."
          actionLabel="다시 확인"
          onAction={() => void fetchData()}
        />
      ) : null}

      {viewState === 'ready' ? (
        <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className={`bg-[#0f172a] p-6 rounded-xl border ${card.warning ? 'border-rose-500/50' : 'border-slate-800'} shadow-sm relative overflow-hidden group`}>
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{card.label}</span>
              <div className={`${card.bg} ${card.color} p-2 rounded-lg`}>
                <card.icon size={16} />
              </div>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight relative z-10 ${card.warning ? 'text-rose-400' : 'text-slate-100'}`}>
              {card.value ?? '-'}
            </p>
            {/* Sparkline simulation using TimeSeries data */}
            <div className="absolute bottom-0 left-0 w-full h-12 opacity-20 group-hover:opacity-40 transition-opacity">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeries}>
                    <Area type="monotone" dataKey={card.dataKey} stroke={card.color.includes('blue') ? '#3b82f6' : card.color.includes('rose') ? '#f43f5e' : '#10b981'} fill={card.color.includes('blue') ? '#3b82f6' : card.color.includes('rose') ? '#f43f5e' : '#10b981'} strokeWidth={0} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#0f172a] p-8 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
             <h2 className="text-lg font-semibold text-slate-200 flex items-center">
              <Activity className="mr-3 text-blue-500" size={20} />
              초당 요청 수 (RPS)
            </h2>
          </div>
          <div className="h-72">
            {timeSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">데이터가 없습니다.</div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries}>
                <defs>
                  <linearGradient id="colorRps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(unix) => format(unix * 1000, 'HH:mm')}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
                  itemStyle={{ fontSize: '12px' }}
                  labelFormatter={(unix) => format(unix * 1000, 'HH:mm:ss')}
                />
                <Area type="monotone" dataKey="rps" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRps)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-[#0f172a] p-8 rounded-xl border border-slate-800 shadow-sm flex flex-col">
          <h2 className="text-lg font-semibold text-slate-200 mb-6 flex items-center">
            <AlertCircle className="mr-3 text-rose-500" size={20} />
            에러 발생률 추이
          </h2>
          <div className="flex-1 h-72 lg:h-auto">
            {timeSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">데이터가 없습니다.</div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(unix) => format(unix * 1000, 'HH:mm')}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                  labelFormatter={(unix) => format(unix * 1000, 'HH:mm:ss')}
                />
                <Line type="monotone" dataKey="error_rate" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-6 md:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-slate-200">서비스별 성능 현황</h2>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">전체 데이터 기반</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/30">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">서비스 이름</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">초당 요청(RPS)</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">에러율</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">평균 응답시간</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">상위 5% (p95)</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">상위 1% (p99)</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest md:px-6 lg:px-8">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {services.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400 md:px-6 lg:px-8">
                    아직 서비스별 성능 데이터가 없습니다.
                  </td>
                </tr>
              ) : services.map((svc) => {
                const errorRate = svc.span_count > 0 ? svc.error_count / svc.span_count : 0;
                const isUnhealthy = errorRate > 0.05 || svc.avg_latency_ms > 500;
                
                return (
                  <tr key={svc.name} className="hover:bg-slate-800/20 transition-colors">
                    <td className="whitespace-nowrap px-4 py-4 md:px-6 lg:px-8">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${isUnhealthy ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                        <span className="text-sm font-bold text-slate-200">{svc.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-400 md:px-6 lg:px-8">
                      {(svc.span_count / 3600).toFixed(2)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-4 font-mono text-sm md:px-6 lg:px-8 ${errorRate > 0.05 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                      {(errorRate * 100).toFixed(2)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-400 md:px-6 lg:px-8">
                      {svc.avg_latency_ms.toFixed(2)}ms
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-400 md:px-6 lg:px-8">
                      {svc.p95_latency_ms.toFixed(2)}ms
                    </td>
                    <td className={`whitespace-nowrap px-4 py-4 font-mono text-sm md:px-6 lg:px-8 ${svc.p99_latency_ms > 1000 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                      {svc.p99_latency_ms.toFixed(2)}ms
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 md:px-6 lg:px-8">
                      {isUnhealthy ? (
                        <div className="flex items-center text-rose-400 text-xs font-bold uppercase tracking-tighter">
                          <AlertCircle size={14} className="mr-1" /> 위급
                        </div>
                      ) : (
                        <div className="flex items-center text-emerald-400 text-xs font-bold uppercase tracking-tighter">
                          정상
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
