import type { LogRecord } from '../../api/client';
import LogItem from './LogItem';

export default function LogList({ logs }: { logs: LogRecord[] }) {
  return (
    <div className="space-y-3">
      {logs.map((log, index) => (
        <LogItem key={`${log.timestamp}-${log.trace_id}-${index}`} log={log} />
      ))}
    </div>
  );
}
