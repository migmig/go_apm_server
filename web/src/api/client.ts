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
  avg_latency: number;
}

export interface Stats {
  total_traces: number;
  total_spans: number;
  total_logs: number;
  service_count: number;
  error_rate: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
}

export const api = {
  getServices: () => client.get<ServiceInfo[]>('/services').then(res => res.data),
  getStats: (since?: string) => client.get<Stats>('/stats', { params: { since } }).then(res => res.data),
  getHealth: () => client.get('/health').then(res => res.data),
};

export default client;
