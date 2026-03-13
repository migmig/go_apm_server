import { useEffect, useState, useCallback, useRef } from 'react';
import client, { type TraceSummary } from '../api/client';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, RefreshCw, Loader2, CalendarDays, X, ChevronDown, ChevronUp, Filter, Database } from 'lucide-react';
import { PageEmptyState, PageErrorState, PageLoadingState } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';
import { useWSChannel, useWSMessage } from '../hooks/useWebSocket';
import TraceList from '../components/traces/TraceList';
import toast from 'react-hot-toast';

const PAGE_SIZE = 50;

export default function Traces() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [statusCode, setStatusCode] = useState('');
  const [minDuration, setMinDuration] = useState('');
  const [timePreset, setTimePreset] = useState('');
  
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [httpMethod, setHttpMethod] = useState('');
  const [httpRoute, setHttpRoute] = useState('');
  const [httpStatusCode, setHttpStatusCode] = useState('');
  const [dbSystem, setDbSystem] = useState('');
  const [dbOp, setDbOp] = useState('');

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  useWSChannel('traces');

  useWSMessage('traces', useCallback((payload: TraceSummary[]) => {
    setTraces((prev) => {
      const newTraces = [...payload, ...prev];
      return newTraces.slice(0, 200);
    });
    setLastUpdatedAt(new Date());
  }, []));

  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const dateLabel = searchParams.get('date');

  const clearDateFilter = () => {
    setSearchParams({});
  };

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);

    try {
      const params: Record<string, any> = {
        service: serviceName,
        limit: PAGE_SIZE,
        offset: 0,
      };
      if (statusCode) params.status = statusCode;
      if (minDuration) params.min_duration = minDuration;
      if (httpMethod) params.http_method = httpMethod;
      if (httpRoute) params.http_route = httpRoute;
      if (httpStatusCode) params.http_status_code = httpStatusCode;
      if (dbSystem) params.db_system = dbSystem;
      if (dbOp) params.db_operation = dbOp;
      
      let computedStart = startParam;
      if (timePreset && !startParam) {
         // handle preset
         const now = Date.now();
         if (timePreset === '5m') computedStart = String(now - 5 * 60 * 1000);
         else if (timePreset === '15m') computedStart = String(now - 15 * 60 * 1000);
         else if (timePreset === '1h') computedStart = String(now - 60 * 60 * 1000);
         else if (timePreset === '24h') computedStart = String(now - 24 * 60 * 60 * 1000);
      }
      
      if (computedStart) params.start = computedStart;
      if (endParam) params.end = endParam;

      const res = await client.get('/traces', { params });
      const data = res.data.traces || [];
      setTraces(data);
      setHasMore(data.length >= PAGE_SIZE);
      setErrorMessage(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch traces', err);
      setErrorMessage(getErrorMessage(err, '요청 목록을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.'));
    } finally {
      setLoading(false);
    }
  }, [serviceName, startParam, endParam]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;

    try {
      const params: Record<string, any> = {
        service: serviceName,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };
      if (statusCode) params.status = statusCode;
      if (minDuration) params.min_duration = minDuration;
      if (httpMethod) params.http_method = httpMethod;
      if (httpRoute) params.http_route = httpRoute;
      if (httpStatusCode) params.http_status_code = httpStatusCode;
      if (dbSystem) params.db_system = dbSystem;
      if (dbOp) params.db_operation = dbOp;

      let computedStart = startParam;
      if (timePreset && !startParam) {
         const now = Date.now();
         if (timePreset === '5m') computedStart = String(now - 5 * 60 * 1000);
         else if (timePreset === '15m') computedStart = String(now - 15 * 60 * 1000);
         else if (timePreset === '1h') computedStart = String(now - 60 * 60 * 1000);
         else if (timePreset === '24h') computedStart = String(now - 24 * 60 * 60 * 1000);
      }

      if (computedStart) params.start = computedStart;
      if (endParam) params.end = endParam;

      const res = await client.get('/traces', { params });
      const newData = res.data.traces || [];

      if (newData.length === 0) {
        setHasMore(false);
      } else {
        setTraces((prev) => [...prev, ...newData]);
        setOffset(nextOffset);
        if (newData.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.error('Failed to load more traces', err);
      toast.error(getErrorMessage(err, '추가 요청 데이터를 불러오지 못했습니다.'), { id: 'traces-loadmore' });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, offset, serviceName, startParam, endParam]);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });

    if (node) observer.current.observe(node);
  }, [hasMore, loadMore, loading, loadingMore]);

  useEffect(() => {
    void fetchTraces();

    return () => observer.current?.disconnect();
  }, [fetchTraces]);

  const handleSearch = () => {
    void fetchTraces();
  };
  const viewState = getAsyncViewState({
    hasData: traces.length > 0,
    isLoading: loading,
    isEmpty: !loading && traces.length === 0 && !errorMessage,
    errorMessage,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">서비스 요청 추적</h1>
          <p className="text-slate-400 text-sm mt-1">서비스 간의 전체 요청 흐름을 상세히 추적하고 분석합니다.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">마지막 조회</p>
          <p className="text-xs font-mono text-slate-300">{lastUpdatedAt ? format(lastUpdatedAt, 'HH:mm:ss') : '미수신'}</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-col gap-4 bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center space-x-3 flex-1 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
            <Search size={18} className="text-slate-500" />
            <input
              type="text"
              aria-label="서비스 이름 검색 폼"
              placeholder="서비스 이름으로 검색..."
              className="w-full bg-transparent border-none focus:ring-0 text-sm py-2.5 text-slate-200 placeholder-slate-600"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select
              title="상태 필터"
              aria-label="상태 코드 필터"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50"
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
            >
              <option value="">모든 상태</option>
              <option value="1">성공 (OK)</option>
              <option value="2">오류 (Error)</option>
            </select>

            <input
              type="number"
              aria-label="최소 지연 시간 필터"
              placeholder="최소 지연 (ms)"
              className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 placeholder-slate-600"
              value={minDuration}
              onChange={(e) => setMinDuration(e.target.value)}
            />

            <select
              title="시간 필터"
              aria-label="상대 시간 프리셋 필터"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 disabled:opacity-50"
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value)}
              disabled={!!startParam || !!endParam || !!dateLabel}
            >
              <option value="">전체 시간</option>
              <option value="5m">최근 5분</option>
              <option value="15m">최근 15분</option>
              <option value="1h">최근 1시간</option>
              <option value="24h">최근 24시간</option>
            </select>
          </div>
          <div className="h-10 w-px bg-slate-800 hidden md:block"></div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              showAdvanced ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <Filter size={16} />
            고급 검색
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="submit"
            aria-label="검색 조건으로 조회"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            <span className="inline-flex items-center">
              <RefreshCw size={16} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />
              조회하기
            </span>
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-800/50">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">HTTP Method / Route</label>
              <div className="flex gap-2">
                <select
                  value={httpMethod}
                  onChange={(e) => setHttpMethod(e.target.value)}
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50"
                >
                  <option value="">Method</option>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
                <input
                  type="text"
                  placeholder="e.g. /api/v1/users"
                  value={httpRoute}
                  onChange={(e) => setHttpRoute(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">HTTP Status Code</label>
              <input
                type="number"
                placeholder="e.g. 200, 404, 500"
                value={httpStatusCode}
                onChange={(e) => setHttpStatusCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 placeholder-slate-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Database size={12} />
                Database (System / Op)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. redis, mysql"
                  value={dbSystem}
                  onChange={(e) => setDbSystem(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 placeholder-slate-600"
                />
                <input
                  type="text"
                  placeholder="e.g. get, set, select"
                  value={dbOp}
                  onChange={(e) => setDbOp(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 placeholder-slate-600"
                />
              </div>
            </div>
          </div>
        )}
      </form>

      {dateLabel && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5">
          <CalendarDays size={16} className="text-blue-400" />
          <span className="text-sm text-blue-300 font-medium">
            <span className="font-bold">{dateLabel}</span> 파티션 데이터를 조회하고 있습니다
          </span>
          <button
            onClick={clearDateFilter}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 rounded px-2 py-1 border border-slate-700"
          >
            <X size={12} />
            필터 해제
          </button>
        </div>
      )}



      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden" aria-live="polite">
        {viewState === 'loading' ? (
          <PageLoadingState
            className="min-h-[420px] rounded-none border-0"
            title="요청 목록을 불러오는 중입니다"
            description="트레이스 요약과 서비스 필터를 준비하고 있습니다."
          />
        ) : null}

        {viewState === 'error' ? (
          <PageErrorState
            className="min-h-[420px] rounded-none border-0 bg-transparent"
            title="요청 목록을 불러오지 못했습니다"
            description={errorMessage ?? '잠시 후 다시 시도해 주세요.'}
            onAction={() => void fetchTraces()}
          />
        ) : null}

        {viewState === 'empty' ? (
          <PageEmptyState
            className="min-h-[420px] rounded-none border-0 bg-transparent"
            title="조건에 맞는 요청이 없습니다"
            description="서비스 필터를 비우거나 다른 시점의 데이터를 다시 조회해 보세요."
            actionLabel="다시 조회"
            onAction={() => void fetchTraces()}
          />
        ) : null}

        {viewState === 'ready' ? (
          <TraceList traces={traces} />
        ) : null}

        {/* Infinite Scroll Trigger */}
        {viewState === 'ready' && hasMore && traces.length > 0 && (
          <div ref={lastElementRef} className="py-8 flex justify-center border-t border-slate-800 bg-slate-900/20">
            {loadingMore ? (
              <div className="flex items-center space-x-2 text-slate-400 text-sm">
                <Loader2 size={18} className="animate-spin text-blue-500" />
                <span>데이터를 더 불러오는 중...</span>
              </div>
            ) : (
              <div className="h-4" />
            )}
          </div>
        )}



        {viewState === 'ready' && !hasMore && traces.length > 0 && (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-900/20 border-t border-slate-800">
            모든 데이터를 확인했습니다.
          </div>
        )}
      </div>
    </div>
  );
}
