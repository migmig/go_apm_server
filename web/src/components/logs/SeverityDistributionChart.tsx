import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { LogRecord } from '../../pages/Logs';

interface Props {
  logs: LogRecord[];
}

export default function SeverityDistributionChart({ logs }: Props) {
  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    // Group logs by time bucket (e.g., minute or 10-second intervals based on span)
    // For simplicity, let's group by second if total span < 2 minutes, else by minute
    const timestamps = logs.map(l => new Date(l.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const spanMs = maxTime - minTime;

    let bucketSizeMs = 60000; // 1 minute default
    let formatStr = 'HH:mm';

    if (spanMs < 2 * 60 * 1000) {
      bucketSizeMs = 10000; // 10 seconds
      formatStr = 'HH:mm:ss';
    } else if (spanMs > 24 * 60 * 60 * 1000) {
      bucketSizeMs = 3600000; // 1 hour
      formatStr = 'MM/dd HH:mm';
    }

    const buckets: Record<number, { time: number; error: number; warn: number; info: number }> = {};

    logs.forEach(log => {
      const time = new Date(log.timestamp).getTime();
      const bucketTime = Math.floor(time / bucketSizeMs) * bucketSizeMs;
      
      if (!buckets[bucketTime]) {
        buckets[bucketTime] = { time: bucketTime, error: 0, warn: 0, info: 0 };
      }

      if (log.severity_number >= 17) {
        buckets[bucketTime].error++;
      } else if (log.severity_number >= 13) {
        buckets[bucketTime].warn++;
      } else {
        buckets[bucketTime].info++;
      }
    });

    return Object.values(buckets)
      .sort((a, b) => a.time - b.time)
      .map(b => ({
        ...b,
        formattedTime: format(new Date(b.time), formatStr),
      }));
  }, [logs]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-24 w-full bg-[#0f172a] border-b border-slate-800 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <XAxis 
            dataKey="formattedTime" 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            tickLine={false} 
            axisLine={false} 
            minTickGap={30}
          />
          <YAxis 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            tickLine={false} 
            axisLine={false} 
            allowDecimals={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: '12px' }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
          />
          <Bar dataKey="error" stackId="a" fill="#f43f5e" name="Error" />
          <Bar dataKey="warn" stackId="a" fill="#f59e0b" name="Warn" />
          <Bar dataKey="info" stackId="a" fill="#3b82f6" name="Info" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
