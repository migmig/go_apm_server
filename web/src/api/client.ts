import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ServiceInfo {
  name: string;
  span_count: number;
  error_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
}

export interface Stats {
  total_traces: number;
  total_spans: number;
  total_logs: number;
  service_count: number;
  error_rate: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
  time_series: StatsDataPoint[];
}

export interface StatsDataPoint {
  timestamp: number;
  rps: number;
  error_rate: number;
}

export interface TraceSummary {
  trace_id: string;
  root_service: string;
  root_span: string;
  span_count: number;
  duration_ms: number;
  status_code: number;
  start_time: number;
  attributes: Record<string, any>;
}

export interface LogRecord {
  timestamp: string;
  service_name: string;
  severity_text: string;
  severity_number: number;
  body: string;
  trace_id: string;
  attributes: Record<string, any>;
}

export const api = {
  getServices: () => client.get<{services: ServiceInfo[]}>('/services').then(res => res.data.services),
  getStats: (since?: string) => client.get<Stats>('/stats', { params: { since } }).then(res => res.data),
  getHealth: () => client.get('/health').then(res => res.data),
};

export default client;
