import { useEffect, useState, useCallback, useRef } from 'react';
import client from '../api/client';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, RefreshCw, Clock, ArrowRight, Loader2 } from 'lucide-react';

interface TraceSummary {
  trace_id: string;
  root_service: string;
  root_span: string;
  span_count: number;
  duration_ms: number;
  status_code: number;
  start_time: number;
  attributes: Record<string, any>;
}

const PAGE_SIZE = 50;

export default function Traces() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  useEffect(() => {
    fetchTraces();
  }, []);

  async function fetchTraces() {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    try {
      const res = await client.get('/traces', { 
        params: { 
          service: serviceName,
          limit: PAGE_SIZE,
          offset: 0
        } 
      });
      const data = res.data.traces || [];
      setTraces(data);
      if (data.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to fetch traces', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;
    try {
      const res = await client.get('/traces', { 
        params: { 
          service: serviceName,
          limit: PAGE_SIZE,
          offset: nextOffset
        } 
      });
      const newData = res.data.traces || [];
      if (newData.length === 0) {
        setHasMore(false);
      } else {
        setTraces(prev => [...prev, ...newData]);
        setOffset(nextOffset);
        if (newData.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.error('Failed to load more traces', err);
    } finally {
      setLoadingMore(false);
    }
  }

  const handleSearch = () => {
    fetchTraces();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">서비스 요청 추적</h1>
          <p className="text-slate-400 text-sm mt-1">서비스 간의 전체 요청 흐름을 상세히 추적하고 분석합니다.</p>
        </div>
        <button
          onClick={fetchTraces}
          disabled={loading}
          className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span>새로고침</span>
        </button>
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
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          조회하기
        </button>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">요청 시간</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">요청 ID</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">시작 서비스</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">수행 작업</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">소요 시간</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">결과</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">부가 정보</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && traces.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500 animate-pulse">요청 데이터를 불러오는 중...</td></tr>
              ) : traces.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500 italic">조건에 맞는 요청이 없습니다.</td></tr>
              ) : (
                <>
                  {traces.map((trace) => (
                    <tr key={trace.trace_id} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-mono">
                        {format(trace.start_time / 1e6, 'MMM dd, HH:mm:ss.SSS')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono text-slate-500 group-hover:text-slate-300 transition-colors">{trace.trace_id.substring(0, 8)}...</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                          <span className="text-sm font-semibold text-slate-200">{trace.root_service}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">{trace.root_span}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-xs text-slate-300 font-mono">
                          <Clock size={12} className="mr-1.5 text-slate-500" />
                          {trace.duration_ms.toFixed(2)} ms
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] leading-4 font-bold rounded-md uppercase tracking-tighter ${
                          trace.status_code === 2 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {trace.status_code === 2 ? '실패' : '성공'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {trace.attributes && Object.entries(trace.attributes).slice(0, 3).map(([k, v]) => (
                            <span key={k} className="inline-flex items-center px-1 py-0.5 rounded text-[8px] bg-slate-800 text-slate-500 border border-slate-700/50 truncate max-w-full">
                              <span className="text-blue-500/50 mr-0.5">{k}:</span>{String(v)}
                            </span>
                          ))}
                          {trace.attributes && Object.keys(trace.attributes).length > 3 && (
                            <span className="text-[8px] text-slate-600">+{Object.keys(trace.attributes).length - 3}개 더보기</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link 
                          to={`/traces/${trace.trace_id}`} 
                          className="inline-flex items-center text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors group/link"
                        >
                          상세 보기
                          <ArrowRight size={14} className="ml-1 group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Infinite Scroll Trigger */}
        {hasMore && traces.length > 0 && (
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
        
        {!hasMore && traces.length > 0 && (
          <div className="py-6 text-center text-xs text-slate-500 bg-slate-900/20 border-t border-slate-800">
            모든 데이터를 확인했습니다.
          </div>
        )}
      </div>
    </div>
  );
}
