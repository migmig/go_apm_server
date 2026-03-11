import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type ServiceInfo, type TraceSummary, type LogRecord } from '../api/client';
import client from '../api/client';
import { Activity, AlertCircle, ArrowRight, ChevronLeft, Clock, Layers, Zap } from 'lucide-react';
import { PageEmptyState, PageErrorState, PageLoadingState } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';
import TraceList from '../components/traces/TraceList';
import LogItem from '../components/logs/LogItem';
import StatCard from '../components/ui/StatCard';
import { getServiceHealth } from '../lib/health';

export default function ServiceDetail() {
  const { serviceName } = useParams();
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!serviceName) return;
    setLoading(true);
    try {
      const [svc, tracesRes, logsRes] = await Promise.all([
        api.getServiceByName(serviceName),
        client.get('/traces', { params: { service: serviceName, limit: 10 } }),
        client.get('/logs', { params: { service: serviceName, limit: 10 } }),
      ]);
      setService(svc);
      setTraces(tracesRes.data.traces ?? []);
      setLogs(logsRes.data.logs ?? []);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, '서비스 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [serviceName]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasData = service !== null;
  const viewState = getAsyncViewState({
    hasData,
    isLoading: loading,
    isEmpty: hasData && service.span_count === 0,
    errorMessage,
  });

  if (viewState === 'loading') {
    return (
      <PageLoadingState
        title="서비스 정보를 불러오는 중입니다"
        description="성능 지표와 최근 트레이스, 로그를 수집하고 있습니다."
      />
    );
  }

  if (viewState === 'error') {
    return (
      <PageErrorState
        title="서비스 정보를 불러오지 못했습니다"
        description={errorMessage ?? 'API 서버 연결을 확인한 뒤 다시 시도해 주세요.'}
        onAction={() => void fetchData()}
      />
    );
  }

  if (viewState === 'empty' || !service) {
    return (
      <PageEmptyState
        title="서비스 데이터가 없습니다"
        description={`${serviceName} 서비스의 관측 데이터가 아직 수집되지 않았습니다.`}
        actionLabel="다시 확인"
        onAction={() => void fetchData()}
      />
    );
  }

  const { errorRate, isUnhealthy } = getServiceHealth(service.span_count, service.error_count, service.avg_latency_ms);

  const statCards = [
    { label: 'Span 수', value: new Intl.NumberFormat('ko-KR').format(service.span_count), icon: Layers, colorClass: 'text-blue-400', bgClass: 'bg-blue-500/10' },
    { label: '에러 수', value: new Intl.NumberFormat('ko-KR').format(service.error_count), icon: AlertCircle, colorClass: errorRate > 0.05 ? 'text-rose-500' : 'text-rose-400', bgClass: 'bg-rose-500/10', warning: errorRate > 0.05 },
    { label: '평균 응답시간', value: `${service.avg_latency_ms.toFixed(2)}ms`, icon: Clock, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
    { label: 'P99 응답시간', value: `${service.p99_latency_ms.toFixed(2)}ms`, icon: Zap, colorClass: service.p99_latency_ms > 1000 ? 'text-amber-400' : 'text-amber-400', bgClass: 'bg-amber-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-3">
              <h1 className="text-lg font-bold text-slate-100 font-mono">{serviceName}</h1>
              {isUnhealthy ? (
                <span className="w-fit px-2 py-0.5 bg-rose-500/10 text-rose-400 text-xs font-bold rounded border border-rose-500/20 uppercase tracking-widest">
                  위급
                </span>
              ) : (
                <span className="w-fit px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded border border-emerald-500/20 uppercase tracking-widest">
                  정상
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 sm:flex-row sm:items-center sm:space-x-4">
              <span className="flex items-center"><Layers size={12} className="mr-1.5 text-blue-500" /> {service.span_count}개의 Span</span>
              <span className="flex items-center"><AlertCircle size={12} className="mr-1.5 text-rose-500" /> 에러율 {(errorRate * 100).toFixed(2)}%</span>
              <span className="flex items-center"><Clock size={12} className="mr-1.5 text-emerald-500" /> 평균 {service.avg_latency_ms.toFixed(2)}ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            colorClass={card.colorClass}
            bgClass={card.bgClass}
            warning={card.warning}
          />
        ))}
      </div>

      {/* Recent Traces */}
      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-6 md:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center">
            <Activity className="mr-3 text-blue-500" size={20} />
            최근 트레이스
          </h2>
          <Link
            to={`/traces?service=${encodeURIComponent(serviceName ?? '')}`}
            className="inline-flex items-center text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
          >
            전체 보기
            <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
        {traces.length > 0 ? (
          <TraceList traces={traces} />
        ) : (
          <div className="px-4 py-10 text-center text-sm text-slate-400 md:px-6 lg:px-8">
            이 서비스의 트레이스 데이터가 없습니다.
          </div>
        )}
      </div>

      {/* Recent Logs */}
      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-6 md:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center">
            <AlertCircle className="mr-3 text-amber-500" size={20} />
            최근 로그
          </h2>
          <Link
            to={`/logs?service=${encodeURIComponent(serviceName ?? '')}`}
            className="inline-flex items-center text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
          >
            전체 보기
            <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
        {logs.length > 0 ? (
          <div className="space-y-3 p-4 md:p-6 lg:p-8">
            {logs.map((log, i) => (
              <LogItem key={`${log.timestamp}-${i}`} log={log} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-slate-400 md:px-6 lg:px-8">
            이 서비스의 로그 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
