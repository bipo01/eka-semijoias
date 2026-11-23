import { apiUrl } from './api';

/*
 * Live updates over WebSocket (/api/live). Messages:
 *   {"type":"hello","version":N} | {"type":"catalog","version":N} | {"type":"leads"}
 * Keeps one connection alive with a heartbeat, reconnects with exponential
 * backoff + jitter, and reconnects at once when the tab becomes visible or the
 * network comes back. Missed updates heal through `hello` and the HTTP
 * revalidation the caller runs on (re)connect.
 */

export interface LiveHandlers {
  onVersion(version: number): void;
  onLeads?(): void;
  /** Called after every (re)connection, so the caller can revalidate over HTTP. */
  onConnected?(): void;
}

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export interface LiveConnection {
  close(): void;
  /** Opens a fresh socket (e.g. after logging in, so the server tags it as admin). */
  reconnect(): void;
}

export function connectLive(handlers: LiveHandlers): LiveConnection {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return { close: () => undefined, reconnect: () => undefined };
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;
  let pongTimer: number | undefined;

  const url = () => {
    const u = new URL(apiUrl('/api/live'), window.location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  };

  function clearTimers() {
    window.clearTimeout(reconnectTimer);
    window.clearInterval(heartbeatTimer);
    window.clearTimeout(pongTimer);
  }

  function scheduleReconnect(immediate = false) {
    if (stopped) return;
    window.clearTimeout(reconnectTimer);
    const delay = immediate ? 0 : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) * (0.5 + Math.random() / 2);
    attempt++;
    reconnectTimer = window.setTimeout(open, delay);
  }

  function drop() {
    if (!socket) return;
    const s = socket;
    socket = null;
    s.onopen = s.onclose = s.onerror = s.onmessage = null;
    try {
      s.close();
    } catch {
      /* already closed */
    }
  }

  function open() {
    if (stopped || socket) return;
    if (document.visibilityState === 'hidden') return; // reconnect when visible
    let ws: WebSocket;
    try {
      ws = new WebSocket(url());
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send('ping');
        window.clearTimeout(pongTimer);
        pongTimer = window.setTimeout(() => {
          // No pong: the connection is dead even if the browser has not noticed.
          drop();
          scheduleReconnect(true);
        }, PONG_TIMEOUT_MS);
      }, HEARTBEAT_MS);
      handlers.onConnected?.();
    };
    ws.onmessage = (event) => {
      if (event.data === 'pong') {
        window.clearTimeout(pongTimer);
        return;
      }
      let message: { type?: string; version?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if ((message.type === 'hello' || message.type === 'catalog') && typeof message.version === 'number') handlers.onVersion(message.version);
      else if (message.type === 'leads') handlers.onLeads?.();
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      clearTimers();
      scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (!socket) scheduleReconnect(true);
  };
  const onOnline = () => {
    drop();
    scheduleReconnect(true);
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  open();

  return {
    close() {
      stopped = true;
      clearTimers();
      drop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    },
    reconnect() {
      drop();
      clearTimers();
      attempt = 0;
      scheduleReconnect(true);
    },
  };
}
