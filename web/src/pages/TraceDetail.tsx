import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { client } from '../api/client';
import { format } from 'date-fns';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_name: string;
  span_name: string;
  start_time: number;
  end_time: number;
  duration_ns: number;
  status_code: number;
  attributes: Record<string, any>;
}

export default function TraceDetail() {
  const { traceId } = useParams();
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrace() {
      try {
        const res = await client.get(`/traces/${traceId}`);
        setSpans(res.data.spans || []);
      } catch (err) {
        console.error('Failed to fetch trace detail', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrace();
  }, [traceId]);

  if (loading) return <div className="p-8">Loading trace detail...</div>;
  if (spans.length === 0) return <div className="p-8">Trace not found.</div>;

  const minStart = Math.min(...spans.map(s => s.start_time));
  const maxEnd = Math.max(...spans.map(s => s.end_time));
  const totalDuration = maxEnd - minStart;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h1 className="text-xl font-bold truncate">Trace: {traceId}</h1>
        <div className="mt-2 text-sm text-gray-500 flex space-x-4">
          <span>Spans: {spans.length}</span>
          <span>Total Duration: {(totalDuration / 1e6).toFixed(2)}ms</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex text-xs font-semibold text-gray-500 uppercase">
          <div className="w-1/3">Service & Span</div>
          <div className="w-2/3">Timeline</div>
        </div>
        <div className="divide-y divide-gray-100">
          {spans.map((span) => {
            const left = ((span.start_time - minStart) / totalDuration) * 100;
            const width = (span.duration_ns / totalDuration) * 100;
            
            return (
              <div key={span.span_id} className="flex p-4 hover:bg-gray-50 items-center">
                <div className="w-1/3 pr-4 truncate">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-tighter">{span.service_name}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{span.span_name}</p>
                </div>
                <div className="w-2/3 relative h-6 bg-gray-50 rounded overflow-hidden">
                  <div 
                    className={`absolute h-full rounded ${span.status_code === 2 ? 'bg-red-400' : 'bg-blue-400'}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                  >
                    <span className="absolute left-full ml-2 text-[10px] whitespace-nowrap leading-6 text-gray-500">
                      {(span.duration_ns / 1e6).toFixed(2)}ms
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
