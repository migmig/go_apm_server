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

export interface AppConfig {
  server: { api_port: number };
  receiver: { grpc_port: number; http_port: number };
  processor: {
    batch_size: number;
    flush_interval: string;
    queue_size: number;
    drop_on_full: boolean;
  };
  storage: { path: string; retention_days: number };
}

export interface SystemInfo {
  version: string;
  go_version: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  data_dir_size_bytes: number;
}

export interface PartitionInfo {
  date: string;
  size_bytes: number;
  file_path: string;
}

export const api = {
  getServices: () => client.get<{services: ServiceInfo[]}>('/services').then(res => res.data.services),
  getServiceByName: (name: string) => client.get<ServiceInfo>(`/services/${encodeURIComponent(name)}`).then(res => res.data),
  getStats: (since?: string) => client.get<Stats>('/stats', { params: { since } }).then(res => res.data),
  getHealth: () => client.get('/health').then(res => res.data),
  getConfig: () => client.get<AppConfig>('/config').then(res => res.data),
  getSystem: () => client.get<SystemInfo>('/system').then(res => res.data),
  getPartitions: () => client.get<{partitions: PartitionInfo[]}>('/partitions').then(res => res.data.partitions),
};

export default client;
