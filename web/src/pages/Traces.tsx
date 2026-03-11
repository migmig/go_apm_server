import { useEffect, useState, useCallback, useRef } from 'react';
import client, { type TraceSummary } from '../api/client';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, RefreshCw, Loader2, CalendarDays, X } from 'lucide-react';
import { PageEmptyState, PageErrorState, PageLoadingState, StatusBanner } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';
import { useWSChannel, useWSMessage } from '../hooks/useWebSocket';
import TraceList from '../components/traces/TraceList';

const PAGE_SIZE = 50;

export default function Traces() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
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
    setLoadMoreError(null);

    try {
      const params: Record<string, any> = {
        service: serviceName,
        limit: PAGE_SIZE,
        offset: 0,
      };
      if (startParam) params.start = startParam;
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
    setLoadMoreError(null);
    const nextOffset = offset + PAGE_SIZE;

    try {
      const params: Record<string, any> = {
        service: serviceName,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };
      if (startParam) params.start = startParam;
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
      setLoadMoreError(getErrorMessage(err, '추가 요청 데이터를 불러오지 못했습니다.'));
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

      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3 flex-1 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Search size={18} className="text-slate-500" />
          <input
            type="text"
            placeholder="서비스 이름으로 검색..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2.5 text-slate-200 placeholder-slate-600"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="h-10 w-px bg-slate-800 hidden md:block"></div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          <span className="inline-flex items-center">
            <RefreshCw size={16} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />
            조회하기
          </span>
        </button>
      </div>

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

      {errorMessage && traces.length > 0 ? (
        <StatusBanner
          tone="warning"
          title="마지막으로 성공한 요청 목록을 유지하고 있습니다."
          description={errorMessage}
          actionLabel="다시 조회"
          onAction={() => void fetchTraces()}
        />
      ) : null}

      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
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
        
        {viewState === 'ready' && loadMoreError ? (
          <div className="border-t border-slate-800 bg-slate-900/20 p-4">
            <StatusBanner
              tone="error"
              title="추가 데이터를 더 불러오지 못했습니다."
              description={loadMoreError}
              actionLabel="다시 시도"
              onAction={() => void loadMore()}
            />
          </div>
        ) : null}

        {viewState === 'ready' && !hasMore && traces.length > 0 && (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-900/20 border-t border-slate-800">
            모든 데이터를 확인했습니다.
          </div>
        )}
      </div>
    </div>
  );
}
