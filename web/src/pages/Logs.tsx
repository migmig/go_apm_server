import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Terminal, RefreshCcw, Filter } from 'lucide-react';
import { PageEmptyState, PageErrorState, PageLoadingState, StatusBanner } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';

interface LogRecord {
  timestamp: string;
  service_name: string;
  severity_text: string;
  severity_number: number;
  body: string;
  trace_id: string;
  attributes: Record<string, any>;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [searchBody, setSearchBody] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchLogs = useCallback(async (backgroundRefresh = false) => {
    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await client.get('/logs', {
        params: {
          service: serviceName,
          search: searchBody,
        },
      });
      setLogs(res.data.logs || []);
      setErrorMessage(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch logs', err);
      setErrorMessage(getErrorMessage(err, '로그를 불러오지 못했습니다. API 서버 연결을 확인해 주세요.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchBody, serviceName]);

  useEffect(() => {
    void fetchLogs();
    const interval = setInterval(() => {
      void fetchLogs(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchLogs]);

  const getSeverityRowStyle = (num: number) => {
    if (num >= 17) return 'bg-rose-500/5 border-l-rose-500'; // ERROR
    if (num >= 13) return 'bg-amber-500/5 border-l-amber-500'; // WARN
    if (num >= 9) return 'bg-blue-500/5 border-l-blue-500'; // INFO
    return 'border-l-transparent';
  };

  const getSeverityBadgeStyle = (num: number) => {
    if (num >= 17) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (num >= 13) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (num >= 9) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
  };
  const viewState = getAsyncViewState({
    hasData: logs.length > 0,
    isLoading: loading,
    isEmpty: !loading && logs.length === 0 && !errorMessage,
    errorMessage,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center">
            <Terminal className="mr-3 text-blue-500" size={24} />
            실시간 로그 기록
          </h1>
          <p className="text-slate-400 text-sm mt-1">인프라 전체에서 발생하는 로그를 실시간으로 확인합니다.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-2">
           <div className="text-left sm:mr-4 sm:text-right">
            <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <RefreshCcw size={12} className={refreshing ? 'mr-1.5 animate-spin-slow' : 'mr-1.5'} />
              자동 갱신
            </div>
            <p className="mt-1 text-xs font-mono text-slate-300">{lastUpdatedAt ? format(lastUpdatedAt, 'HH:mm:ss') : '미수신'}</p>
          </div>
          <button
            onClick={() => void fetchLogs()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            지금 갱신
          </button>
        </div>
      </div>

      {errorMessage && logs.length > 0 ? (
        <StatusBanner
          tone="warning"
          title="자동 갱신에 실패해 마지막 정상 로그를 유지하고 있습니다."
          description={errorMessage}
          actionLabel="지금 갱신"
          onAction={() => void fetchLogs()}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Filter size={16} className="text-slate-500" />
          <input
            type="text"
            placeholder="서비스 이름..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 text-slate-200 placeholder-slate-600"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-3 md:col-span-2 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Search size={16} className="text-slate-500" />
          <input
            type="text"
            placeholder="로그 내용 검색 (grep)..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 text-slate-200 placeholder-slate-600"
            value={searchBody}
            onChange={(e) => setSearchBody(e.target.value)}
          />
        </div>
        <button
          onClick={() => void fetchLogs()}
          className="md:col-span-3 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          <Search size={16} className="mr-2" />
          현재 필터로 조회
        </button>
      </div>

      <div className="relative flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#020617] font-mono text-xs shadow-2xl lg:min-h-[32rem]">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-600/50 via-indigo-600/50 to-purple-600/50"></div>
        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-1 scrollbar-hide">
          {viewState === 'loading' ? (
            <PageLoadingState
              className="min-h-[320px] border-0 bg-transparent"
              title="로그 기록을 불러오는 중입니다"
              description="실시간 로그 스트림과 검색 결과를 준비하고 있습니다."
            />
          ) : null}

          {viewState === 'error' ? (
            <PageErrorState
              className="min-h-[320px] border-0 bg-transparent"
              title="로그를 불러오지 못했습니다"
              description={errorMessage ?? '잠시 후 다시 시도해 주세요.'}
              onAction={() => void fetchLogs()}
            />
          ) : null}

          {viewState === 'empty' ? (
            <PageEmptyState
              className="min-h-[320px] border-0 bg-transparent"
              title="감지된 로그가 없습니다"
              description="서비스 이름이나 본문 검색 조건을 조정하거나 잠시 후 다시 확인해 보세요."
              actionLabel="다시 조회"
              onAction={() => void fetchLogs()}
            />
          ) : null}

          {viewState === 'ready' ? (
            logs.map((log, i) => (
              <div key={i} className={`group flex flex-col py-2 px-3 hover:bg-slate-800/40 rounded transition-colors border-l-2 ${getSeverityRowStyle(log.severity_number)}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:space-x-4 mb-1 gap-2 sm:gap-0">
                  <span className="text-slate-600 shrink-0 select-none hidden sm:block">
                    {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                  </span>
                  <span className="text-indigo-400 shrink-0 w-32 truncate font-bold">
                    {log.service_name}
                  </span>
                  <span className={`hidden sm:inline-block px-1.5 py-0.5 rounded shrink-0 w-14 text-center text-[9px] font-black border ${getSeverityBadgeStyle(log.severity_number)}`}>
                    {(log.severity_text || 'INFO').toUpperCase()}
                  </span>
                  <div className="flex items-center space-x-2 sm:hidden">
                    <span className="text-slate-600 shrink-0 select-none">
                      {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded shrink-0 text-[9px] font-black border ${getSeverityBadgeStyle(log.severity_number)}`}>
                      {(log.severity_text || 'INFO').toUpperCase()}
                    </span>
                  </div>

                  <span className="text-slate-300 break-all leading-relaxed flex-1 mt-1 sm:mt-0">
                    {log.body}
                  </span>
                  {log.trace_id && (
                    <Link 
                      to={`/traces/${log.trace_id}`}
                      className="shrink-0 text-[10px] text-slate-600 hover:text-blue-400 transition-colors border border-slate-800 rounded px-1 group-hover:border-slate-700"
                    >
                      요청:{log.trace_id.substring(0,6)}
                    </Link>
                  )}
                </div>
                {log.attributes && Object.keys(log.attributes).length > 0 && (
                  <div className="mt-2 ml-0 sm:ml-[140px] flex flex-wrap gap-1.5">
                    {Object.entries(log.attributes).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-slate-800/80 text-slate-500 border border-slate-700/50">
                        <span className="text-blue-500/70 mr-1">{k}:</span>
                        <span className="text-slate-400">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : null}
        </div>
      </div>
    </div>
  );
}
