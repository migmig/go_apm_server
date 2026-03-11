import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Terminal, RefreshCcw, Filter, Play, Pause } from 'lucide-react';
import { PageEmptyState, PageErrorState, PageLoadingState } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';
import { useWSChannel, useWSMessage, useWSStatus } from '../hooks/useWebSocket';
import { getLogSeverityStyle } from '../lib/theme';
import { Virtuoso } from 'react-virtuoso';
import toast from 'react-hot-toast';
import LogAttributes from '../components/ui/LogAttributes';
import HighlightText from '../components/ui/HighlightText';
import CopyButton from '../components/ui/CopyButton';

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
  const [searchParams] = useSearchParams();
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serviceName, setServiceName] = useState(searchParams.get('service') || '');
  const [searchBody, setSearchBody] = useState('');
  const [traceIdFilter, setTraceIdFilter] = useState(searchParams.get('trace_id') || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [streaming, setStreaming] = useState(false);
  const wsStatus = useWSStatus();
  const { subscribe, unsubscribe } = useWSChannel('logs', false);

  const toggleStreaming = useCallback(() => {
    if (streaming) {
      unsubscribe();
      setStreaming(false);
    } else {
      subscribe({ service: serviceName });
      setStreaming(true);
    }
  }, [streaming, subscribe, unsubscribe, serviceName]);

  useWSMessage('logs', useCallback((payload: LogRecord[]) => {
    if (!streaming) return;
    setLogs((prev) => {
      const newLogs = [...payload, ...prev];
      return newLogs.slice(0, 500);
    });
    setLastUpdatedAt(new Date());
  }, [streaming]));

  // 필터 변경 시 재구독
  useEffect(() => {
    if (!streaming) return;
    unsubscribe();
    subscribe({ service: serviceName });
  }, [serviceName, streaming, subscribe, unsubscribe]);

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
          trace_id: traceIdFilter,
        },
      });
      setLogs(res.data.logs || []);
      setErrorMessage(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch logs', err);
      const msg = getErrorMessage(err, '로그를 불러오지 못했습니다. API 서버 연결을 확인해 주세요.');
      if (backgroundRefresh) {
        toast.error(msg, { id: 'logs-poll' });
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchBody, serviceName]);

  useEffect(() => {
    if (streaming) return;

    void fetchLogs();
    const interval = setInterval(() => {
      void fetchLogs(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchLogs, streaming]);


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
            <div className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-400">
              <RefreshCcw size={12} className={refreshing ? 'mr-1.5 animate-spin-slow' : 'mr-1.5'} />
              자동 갱신
            </div>
            <p className="mt-1 text-xs font-mono text-slate-300">{lastUpdatedAt ? format(lastUpdatedAt, 'HH:mm:ss') : '미수신'}</p>
          </div>
          <button
            onClick={toggleStreaming}
            disabled={wsStatus !== 'connected'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${streaming
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {streaming ? <Pause size={16} /> : <Play size={16} />}
            {streaming ? '스트리밍 중지' : '실시간 스트리밍'}
          </button>
          <button
            onClick={() => void fetchLogs()}
            disabled={streaming}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            지금 갱신
          </button>
        </div>
      </div>



      <form onSubmit={(e) => { e.preventDefault(); void fetchLogs(); }} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm">
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
        <div className="flex items-center space-x-3 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Search size={16} className="text-slate-500" />
          <input
            type="text"
            placeholder="로그 내용 검색 (grep)..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 text-slate-200 placeholder-slate-600"
            value={searchBody}
            onChange={(e) => setSearchBody(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-3 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Terminal size={16} className="text-slate-500" />
          <input
            type="text"
            placeholder="Trace ID 필터..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 text-slate-200 placeholder-slate-600"
            value={traceIdFilter}
            onChange={(e) => setTraceIdFilter(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="md:col-span-3 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          <Search size={16} className="mr-2" />
          현재 필터로 조회
        </button>
      </form>

      <div className="relative flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#020617] font-mono text-xs shadow-2xl lg:min-h-[32rem]">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-600/50 via-indigo-600/50 to-purple-600/50"></div>

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
          <Virtuoso
            data={logs}
            followOutput={streaming ? 'smooth' : false}
            style={{ height: '70vh' }}
            className="p-4 scrollbar-hide"
            itemContent={(index, log) => (
              <div className={`group flex flex-col py-2 px-3 hover:bg-slate-800/40 rounded transition-colors border-l-2 mb-1 ${getLogSeverityStyle(log.severity_number).row}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:space-x-4 mb-1 gap-2 sm:gap-0">
                  <span className="text-slate-500 shrink-0 select-none hidden sm:block">
                    {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                  </span>
                  <span className="text-indigo-400 shrink-0 w-32 truncate font-bold">
                    {log.service_name}
                  </span>
                  <span className={`hidden sm:inline-block px-1.5 py-0.5 rounded shrink-0 w-14 text-center text-[10px] font-black border ${getLogSeverityStyle(log.severity_number).badge}`}>
                    {(log.severity_text || 'INFO').toUpperCase()}
                  </span>
                  <div className="flex items-center space-x-2 sm:hidden">
                    <span className="text-slate-500 shrink-0 select-none">
                      {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded shrink-0 text-[10px] font-black border ${getLogSeverityStyle(log.severity_number).badge}`}>
                      {(log.severity_text || 'INFO').toUpperCase()}
                    </span>
                  </div>

                  <span className="text-slate-300 break-all leading-relaxed flex-1 mt-1 sm:mt-0">
                    <HighlightText text={log.body} highlight={searchBody} />
                  </span>
                  {log.trace_id && (
                    <div className="flex items-center gap-1.5 shrink-0 mt-1 sm:mt-0">
                      <Link
                        to={`/traces/${log.trace_id}`}
                        className="text-xs text-slate-500 hover:text-blue-400 transition-colors border border-slate-800 rounded px-1 group-hover:border-slate-700"
                      >
                        요청:{log.trace_id.substring(0, 6)}
                      </Link>
                      <CopyButton value={log.trace_id} iconSize={12} className="p-0.5 rounded text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
                {log.attributes && Object.keys(log.attributes).length > 0 && (
                  <div className="mt-2 ml-0 sm:ml-[140px]">
                    <LogAttributes attributes={log.attributes} />
                  </div>
                )}
              </div>
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
