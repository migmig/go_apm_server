export type WSStatus = 'connected' | 'disconnected' | 'reconnecting';

export type WSMessageHandler = (payload: any) => void;

export class WSManager {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Map<string, Set<WSMessageHandler>>();
  private statusListeners = new Set<(status: WSStatus) => void>();
  private status: WSStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private intentionalClose = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionalClose = false;
    this.setStatus('reconnecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: any };
        if (msg.type === 'ping') return;
        const handlers = this.listeners.get(msg.type);
        handlers?.forEach((handler) => handler(msg.payload));
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private setStatus(status: WSStatus) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  getStatus(): WSStatus {
    return this.status;
  }

  on(type: string, handler: WSMessageHandler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: string, handler: WSMessageHandler) {
    this.listeners.get(type)?.delete(handler);
  }

  onStatusChange(handler: (status: WSStatus) => void) {
    this.statusListeners.add(handler);
  }

  offStatusChange(handler: (status: WSStatus) => void) {
    this.statusListeners.delete(handler);
  }

  subscribe(channel: string, filter?: Record<string, any>) {
    this.send({ action: 'subscribe', channel, filter });
  }

  unsubscribe(channel: string) {
    this.send({ action: 'unsubscribe', channel });
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export function getWSUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
