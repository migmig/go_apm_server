import { useEffect, useState } from 'react';
import { client } from '../api/client';
import { format } from 'date-fns';
import { Search } from 'lucide-react';

interface LogRecord {
  timestamp: number;
  service_name: string;
  severity_text: string;
  severity_number: number;
  body: string;
  trace_id: string;
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
          service_name: serviceName,
          search_body: searchBody
        } 
      });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  }

  const getSeverityColor = (num: number) => {
    if (num >= 17) return 'text-red-600 bg-red-50'; // ERROR
    if (num >= 13) return 'text-orange-600 bg-orange-50'; // WARN
    if (num >= 9) return 'text-blue-600 bg-blue-50'; // INFO
    return 'text-gray-600 bg-gray-50'; // DEBUG/TRACE
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center space-x-2 flex-1">
          <Search size={20} className="text-gray-400" />
          <input
            type="text"
            placeholder="Service name..."
            className="w-1/3 border-gray-200 rounded-md text-sm"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search log body..."
            className="flex-1 border-gray-200 rounded-md text-sm"
            value={searchBody}
            onChange={(e) => setSearchBody(e.target.value)}
          />
        </div>
        <button
          onClick={fetchLogs}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden font-mono text-sm">
        <div className="p-4 h-[600px] overflow-y-auto space-y-2">
          {loading && logs.length === 0 ? (
            <div className="text-gray-500">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-gray-500">No logs found.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex space-x-4 border-b border-gray-800 pb-2 last:border-0">
                <span className="text-gray-500 shrink-0">
                  {format(log.timestamp / 1e6, 'HH:mm:ss.SSS')}
                </span>
                <span className="text-blue-400 shrink-0 w-24 truncate">
                  {log.service_name}
                </span>
                <span className={`px-1.5 rounded shrink-0 w-12 text-center text-[10px] font-bold ${getSeverityColor(log.severity_number)}`}>
                  {log.severity_text || 'INFO'}
                </span>
                <span className="text-gray-300 break-all">
                  {log.body}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
