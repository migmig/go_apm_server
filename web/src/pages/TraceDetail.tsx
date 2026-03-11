import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { ChevronLeft, Clock, Server, Layers, Info, AlertCircle } from 'lucide-react';
import { getServiceColor } from '../lib/theme';
import LogAttributes from '../components/ui/LogAttributes';
import CopyButton from '../components/ui/CopyButton';

interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_name: string;
  span_name: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  status_code: number;
  attributes: Record<string, any>;
}

interface SpanNode extends Span {
  children: SpanNode[];
  depth: number;
}



export default function TraceDetail() {
  const { traceId } = useParams();
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  const handleSelectSpan = useCallback((span: Span) => {
    setSelectedSpan(span);
  }, []);

  // Auto-scroll to selected span row
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSpan]);

  useEffect(() => {
    async function fetchTrace() {
      try {
        const res = await client.get(`/traces/${traceId}`);
        const rawSpans = res.data.spans || [];
        setSpans(rawSpans);
        if (rawSpans.length > 0) {
          setSelectedSpan(rawSpans[0]);
        }
      } catch (err) {
        console.error('Failed to fetch trace detail', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrace();
  }, [traceId]);

  // Build tree and flatten it for rendering
  const flattenedNodes = useMemo(() => {
    if (spans.length === 0) return [];

    const nodesMap: Record<string, SpanNode> = {};
    spans.forEach(s => {
      nodesMap[s.span_id] = { ...s, children: [], depth: 0 };
    });

    const roots: SpanNode[] = [];
    spans.forEach(s => {
      const node = nodesMap[s.span_id];
      if (s.parent_span_id && nodesMap[s.parent_span_id]) {
        nodesMap[s.parent_span_id].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const result: SpanNode[] = [];
    const traverse = (node: SpanNode, depth: number) => {
      node.depth = depth;
      result.push(node);
      // Sort children by start time
      node.children.sort((a, b) => a.start_time - b.start_time);
      node.children.forEach(child => traverse(child, depth + 1));
    };

    roots.sort((a, b) => a.start_time - b.start_time);
    roots.forEach(r => traverse(r, 0));
    return result;
  }, [spans]);

  const traceStats = useMemo(() => {
    if (spans.length === 0) return { minStart: 0, maxEnd: 0, totalDuration: 0 };
    const minStart = Math.min(...spans.map(s => s.start_time));
    const maxEnd = Math.max(...spans.map(s => s.end_time));
    return { minStart, maxEnd, totalDuration: maxEnd - minStart };
  }, [spans]);

  if (loading) return <div className="flex items-center justify-center h-full text-slate-400 animate-pulse font-mono">요청 구조 재구성 중...</div>;
  if (spans.length === 0) return <div className="p-8 text-center text-slate-400">요청 ID <span className="font-mono text-slate-300">{traceId}</span>를 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link to="/traces" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-3">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 font-mono">{traceId}</h1>
                {traceId && <CopyButton value={traceId} />}
              </div>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs font-bold rounded border border-blue-500/20 uppercase tracking-widest">요청 상세</span>
            </div>
            <div className="mt-2 flex flex-col gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 sm:flex-row sm:items-center sm:space-x-4">
              <span className="flex items-center"><Layers size={12} className="mr-1.5 text-blue-500" /> {spans.length} 개의 작업</span>
              <span className="flex items-center"><Clock size={12} className="mr-1.5 text-blue-500" /> 총 소요 시간: {(traceStats.totalDuration / 1e6).toFixed(2)}ms</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Waterfall Chart */}
        <div className="flex flex-col overflow-x-auto rounded-xl border border-slate-800 bg-[#0f172a] shadow-sm xl:col-span-3 xl:max-h-[72vh]">
          <div className="flex flex-col xl:flex-1 h-full">
            <div className="p-3 bg-slate-900/50 border-b border-slate-800 flex text-xs font-bold text-slate-400 uppercase tracking-widest">
              <div className="w-64 shrink-0 border-r border-slate-800 px-2">서비스 및 작업명</div>
              <div className="flex-1 px-4 flex justify-between">
                <span>진행 시간표 (Timeline)</span>
                <span>{(traceStats.totalDuration / 1e6).toFixed(2)} ms</span>
              </div>
            </div>

            <div className="divide-y divide-slate-800/30 overflow-y-auto scrollbar-hide xl:flex-1">
              {flattenedNodes.map((span) => {
                const left = traceStats.totalDuration > 0 ? ((span.start_time - traceStats.minStart) / traceStats.totalDuration) * 100 : 0;
                const width = traceStats.totalDuration > 0 ? Math.max(((span.duration_ms * 1e6) / traceStats.totalDuration) * 100, 0.2) : 0.2;
                const isSelected = selectedSpan?.span_id === span.span_id;
                const hasError = span.status_code === 2;

                return (
                  <div
                    key={span.span_id}
                    ref={isSelected ? selectedRowRef : undefined}
                    onClick={() => handleSelectSpan(span)}
                    className={`flex group cursor-pointer transition-all ${isSelected ? 'bg-blue-600/20 ring-1 ring-inset ring-blue-500/50' : 'hover:bg-slate-800/30'}`}
                  >
                    {/* Operation Info */}
                    <div className="w-64 shrink-0 p-3 border-r border-slate-800/50 flex flex-col justify-center min-w-0 relative">
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}
                      <div
                        className="truncate"
                        style={{ paddingLeft: `${span.depth * 16}px` }}
                      >
                        <div className="flex items-center mb-0.5">
                          {span.depth > 0 && (
                            <div className="absolute left-0 w-px bg-slate-700/50 h-full" style={{ left: `${(span.depth * 16) - 8}px` }}></div>
                          )}
                          <span className={`text-[10px] font-black uppercase px-1 rounded mr-2 ${getServiceColor(span.service_name)} text-white`}>
                            {span.service_name}
                          </span>
                          {hasError && <AlertCircle size={12} className="text-rose-500 shrink-0" />}
                        </div>
                        <div className={`text-xs font-medium truncate ${isSelected ? 'text-blue-400' : 'text-slate-300'}`}>
                          {span.span_name}
                        </div>
                      </div>
                    </div>

                    {/* Timeline Bar */}
                    <div className="flex-1 p-3 relative flex items-center min-w-[200px]">
                      <div className="absolute inset-0 flex justify-between px-4 pointer-events-none">
                        {[0, 25, 50, 75, 100].map(p => (
                          <div key={p} className="h-full w-px bg-slate-800/30"></div>
                        ))}
                      </div>

                      <div
                        className={`h-5 rounded-sm relative flex items-center transition-all duration-500 group-hover:brightness-110 ${getServiceColor(span.service_name)} ${hasError ? 'ring-2 ring-rose-500 ring-offset-2 ring-offset-[#0f172a]' : 'shadow-lg shadow-black/20'}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: '4px'
                        }}
                      >
                        {/* Duration label inside or outside based on width */}
                        <span className={`absolute whitespace-nowrap text-[10px] font-bold font-mono ${width > 15 ? 'left-2 text-white' : 'left-full ml-3 text-slate-400'}`}>
                          {span.duration_ms.toFixed(2)} ms
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Metadata Sidebar */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] shadow-sm xl:max-h-[72vh]">
          <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center">
            <Info size={16} className="mr-2 text-blue-400" />
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-widest">상세 정보 (Metadata)</h2>
          </div>

          {selectedSpan ? (
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center">
                  <Server size={12} className="mr-2" /> 컨텍스트
                </h3>
                <div className="space-y-3">
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">서비스</p>
                    <p className="text-sm font-bold text-slate-200">{selectedSpan.service_name}</p>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">수행 작업</p>
                    <p className="text-sm font-bold text-blue-400 font-mono">{selectedSpan.span_name}</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center">
                  <Layers size={12} className="mr-2" /> 부가 정보 (Attributes)
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(selectedSpan.attributes).length > 0 ? (
                    <LogAttributes attributes={selectedSpan.attributes} />
                  ) : (
                    <div className="text-center p-8 border border-dashed border-slate-800 rounded-lg">
                      <p className="text-slate-500 italic text-xs">기록된 부가 정보가 없습니다.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                <Layers className="text-slate-500" size={24} />
              </div>
              <p className="text-slate-400 text-sm font-medium">타임라인에서 작업을 선택하여 상세 정보를 확인하세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
