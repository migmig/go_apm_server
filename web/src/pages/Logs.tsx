import { useEffect, useState } from 'react';
import client from '../api/client';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Terminal, RefreshCcw, Filter } from 'lucide-react';

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
  const [serviceName, setServiceName] = useState('');
  const [searchBody, setSearchBody] = useState('');

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchLogs() {
    try {
      const res = await client.get('/logs', { 
        params: { 
          service: serviceName,
          search: searchBody
        } 
      });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center">
            <Terminal className="mr-3 text-blue-500" size={24} />
            실시간 로그 기록
          </h1>
          <p className="text-slate-400 text-sm mt-1">인프라 전체에서 발생하는 로그를 실시간으로 확인합니다.</p>
        </div>
        <div className="flex items-center space-x-2">
           <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-4">
            <RefreshCcw size={12} className="mr-1.5 animate-spin-slow" />
            실시간 갱신 중
          </div>
          <button
            onClick={fetchLogs}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            지금 갱신
          </button>
        </div>
      </div>

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
      </div>

      <div className="flex-1 bg-[#020617] rounded-xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col font-mono text-xs relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-600/50 via-indigo-600/50 to-purple-600/50"></div>
        <div className="overflow-y-auto p-4 space-y-1 scrollbar-hide">
          {loading && logs.length === 0 ? (
             <div className="flex items-center justify-center h-64 text-slate-600 italic">
               로그 기록을 불러오는 중...
             </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-600 italic">
              감지된 로그가 없습니다. 데이터를 기다리는 중...
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`group flex flex-col py-2 px-3 hover:bg-slate-800/40 rounded transition-colors border-l-2 ${getSeverityRowStyle(log.severity_number)}`}>
                <div className="flex items-center space-x-4 mb-1">
                  <span className="text-slate-600 shrink-0 select-none">
                    {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                  </span>
                  <span className="text-indigo-400 shrink-0 w-32 truncate font-bold">
                    {log.service_name}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded shrink-0 w-14 text-center text-[9px] font-black border ${getSeverityBadgeStyle(log.severity_number)}`}>
                    {(log.severity_text || 'INFO').toUpperCase()}
                  </span>
                  <span className="text-slate-300 break-all leading-relaxed flex-1">
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
                  <div className="flex flex-wrap gap-1.5 ml-[180px]">
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
          )}
        </div>
      </div>
    </div>
  );
}
