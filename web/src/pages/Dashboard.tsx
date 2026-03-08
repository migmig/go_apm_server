import { useEffect, useState } from 'react';
import { api, Stats, ServiceInfo } from '../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, Server, FileText, AlertCircle, Clock, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsData, servicesData] = await Promise.all([
          api.getStats(),
          api.getServices()
        ]);
        setStats(statsData);
        setServices(servicesData);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500 animate-pulse font-mono">LOADING SYSTEM METRICS...</div>;

  const statCards = [
    { label: 'Total Traces', value: stats?.total_traces, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Total Spans', value: stats?.total_spans, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Error Rate', value: `${((stats?.error_rate || 0) * 100).toFixed(2)}%`, icon: AlertCircle, color: stats?.error_rate && stats.error_rate > 0.05 ? 'text-rose-500' : 'text-rose-400', bg: 'bg-rose-500/10', warning: stats?.error_rate && stats.error_rate > 0.05 },
    { label: 'Avg Latency', value: `${stats?.avg_latency_ms.toFixed(2)}ms`, icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">System Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1 font-mono uppercase tracking-tighter">Live observability stream from all nodes</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last Updated</p>
          <p className="text-xs text-slate-300 font-mono">{format(new Date(), 'HH:mm:ss')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className={`bg-[#0f172a] p-6 rounded-xl border ${card.warning ? 'border-rose-500/50' : 'border-slate-800'} shadow-sm relative overflow-hidden group`}>
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
              <div className={`${card.bg} ${card.color} p-2 rounded-lg`}>
                <card.icon size={16} />
              </div>
            </div>
            <p className={`text-3xl font-bold font-mono tracking-tight relative z-10 ${card.warning ? 'text-rose-400' : 'text-slate-100'}`}>
              {card.value ?? '-'}
            </p>
            {/* Sparkline simulation using TimeSeries data */}
            <div className="absolute bottom-0 left-0 w-full h-12 opacity-20 group-hover:opacity-40 transition-opacity">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.time_series}>
                    <Area type="monotone" dataKey={card.label === 'Error Rate' ? 'error_rate' : 'rps'} stroke={card.color.includes('blue') ? '#3b82f6' : card.color.includes('rose') ? '#f43f5e' : '#10b981'} fill={card.color.includes('blue') ? '#3b82f6' : card.color.includes('rose') ? '#f43f5e' : '#10b981'} strokeWidth={0} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#0f172a] p-8 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
             <h2 className="text-lg font-semibold text-slate-200 flex items-center">
              <Activity className="mr-3 text-blue-500" size={20} />
              Requests Per Second (RPS)
            </h2>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.time_series}>
                <defs>
                  <linearGradient id="colorRps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(unix) => format(unix * 1000, 'HH:mm')}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
                  itemStyle={{ fontSize: '12px' }}
                  labelFormatter={(unix) => format(unix * 1000, 'HH:mm:ss')}
                />
                <Area type="monotone" dataKey="rps" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRps)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f172a] p-8 rounded-xl border border-slate-800 shadow-sm flex flex-col">
          <h2 className="text-lg font-semibold text-slate-200 mb-6 flex items-center">
            <AlertCircle className="mr-3 text-rose-500" size={20} />
            Error Rate Trend
          </h2>
          <div className="flex-1 h-72 lg:h-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.time_series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(unix) => format(unix * 1000, 'HH:mm')}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                  labelFormatter={(unix) => format(unix * 1000, 'HH:mm:ss')}
                />
                <Line type="monotone" dataKey="error_rate" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-[#0f172a] rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-200">Service Performance</h2>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Across All Datacenters</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/30">
              <tr>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Service Name</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">RPS</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Error Rate</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg Latency</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">p95</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">p99</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {services.map((svc) => {
                const errorRate = svc.span_count > 0 ? svc.error_count / svc.span_count : 0;
                const isUnhealthy = errorRate > 0.05 || svc.avg_latency_ms > 500;
                
                return (
                  <tr key={svc.name} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${isUnhealthy ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                        <span className="text-sm font-bold text-slate-200">{svc.name}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap font-mono text-sm text-slate-400">
                      {(svc.span_count / 3600).toFixed(2)}
                    </td>
                    <td className={`px-8 py-4 whitespace-nowrap font-mono text-sm ${errorRate > 0.05 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                      {(errorRate * 100).toFixed(2)}%
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap font-mono text-sm text-slate-400">
                      {svc.avg_latency_ms.toFixed(2)}ms
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap font-mono text-sm text-slate-400">
                      {svc.p95_latency_ms.toFixed(2)}ms
                    </td>
                    <td className={`px-8 py-4 whitespace-nowrap font-mono text-sm ${svc.p99_latency_ms > 1000 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                      {svc.p99_latency_ms.toFixed(2)}ms
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap">
                      {isUnhealthy ? (
                        <div className="flex items-center text-rose-400 text-[10px] font-bold uppercase tracking-tighter">
                          <AlertCircle size={14} className="mr-1" /> Critical
                        </div>
                      ) : (
                        <div className="flex items-center text-emerald-400 text-[10px] font-bold uppercase tracking-tighter">
                          Healthy
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
