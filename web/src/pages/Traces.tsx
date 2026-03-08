import { useEffect, useState } from 'react';
import client from '../api/client';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Filter, RefreshCw, Clock, ArrowRight } from 'lucide-react';

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

export default function Traces() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceName, setServiceName] = useState('');

  useEffect(() => {
    fetchTraces();
  }, []);

  async function fetchTraces() {
    setLoading(true);
    try {
      const res = await client.get('/traces', { params: { service_name: serviceName } });
      setTraces(res.data.traces || []);
    } catch (err) {
      console.error('Failed to fetch traces', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Trace Explorer</h1>
          <p className="text-slate-400 text-sm mt-1">Investigate end-to-end request flows across your services.</p>
        </div>
        <button
          onClick={fetchTraces}
          disabled={loading}
          className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3 flex-1 bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
          <Search size={18} className="text-slate-500" />
          <input
            type="text"
            placeholder="Filter by service name..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm py-2.5 text-slate-200 placeholder-slate-600"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchTraces()}
          />
        </div>
        <div className="h-10 w-px bg-slate-800 hidden md:block"></div>
        <button
          onClick={fetchTraces}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          Execute Query
        </button>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trace ID</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Root Service</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Operation</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duration</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attributes</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500 animate-pulse">Scanning traces...</td></tr>
              ) : traces.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500 italic">No traces matching the criteria were found.</td></tr>
              ) : (
                traces.map((trace) => (
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
                        {trace.status_code === 2 ? 'Error' : 'Success'}
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
                          <span className="text-[8px] text-slate-600">+{Object.keys(trace.attributes).length - 3} more</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link 
                        to={`/traces/${trace.trace_id}`} 
                        className="inline-flex items-center text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors group/link"
                      >
                        Details
                        <ArrowRight size={14} className="ml-1 group-hover/link:translate-x-1 transition-transform" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
