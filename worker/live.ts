import { DurableObject } from 'cloudflare:workers';
import { getSession, ipKey } from './auth';
import type { Env } from './env';
import { HttpError } from './http';
import type { Context } from './router';

/*
 * Real time: one Durable Object holds every visitor's WebSocket using the
 * hibernation API (idle sockets cost nothing). Writes call `publishCatalog`
 * with the new version; the hub keeps the highest version it has seen and
 * pushes it to everyone. Messages carry no personal data:
 *   {"type":"hello","version":N}    on connect
 *   {"type":"catalog","version":N}  after a catalog write
 *   {"type":"leads"}                 admin sockets only, after a lead changes
 * Clients only send "ping" (answered with "pong" without waking the object).
 */

const HUB_NAME = 'catalog';
const MAX_SOCKETS = 5000;
/**
 * Per client network (hashed). Mobile carriers put many phones behind one IPv4
 * (CGNAT), so this is generous; it only stops one source from exhausting the hub.
 * Admin sockets are always accepted.
 */
const MAX_SOCKETS_PER_NETWORK = 100;
const VERSION_KEY = 'version';

export class LiveHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async version(): Promise<number> {
    const stored = await this.ctx.storage.get<number>(VERSION_KEY);
    if (stored !== undefined) return stored;
    // First use (or storage reset): start from the database so `hello` is meaningful right away.
    try {
      const row = await this.env.DB.prepare('SELECT version FROM catalog_snapshot WHERE id = 1').first<{ version: number }>();
      if (row) {
        await this.ctx.storage.put(VERSION_KEY, row.version);
        return row.version;
      }
    } catch {
      /* fall through: clients revalidate over HTTP anyway */
    }
    return 0;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Too many connections', { status: 503 });
    const admin = request.headers.get('X-Eka-Admin') === '1';
    const network = `net:${(request.headers.get('X-Eka-Net') ?? 'unknown').replace(/[^a-f0-9]/g, '').slice(0, 32)}`;
    if (!admin && this.ctx.getWebSockets(network).length >= MAX_SOCKETS_PER_NETWORK) return new Response('Too many connections', { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [admin ? 'admin' : 'public', network]);
    server.send(JSON.stringify({ type: 'hello', version: await this.version() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Any client message other than the auto-answered "ping" is a protocol violation. */
  async webSocketMessage(ws: WebSocket): Promise<void> {
    try {
      ws.close(1008, 'Unexpected message');
    } catch {
      /* already closing */
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'Closing');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'Error');
    } catch {
      /* already closed */
    }
  }

  private broadcast(message: string, tag?: string): void {
    for (const ws of this.ctx.getWebSockets(tag)) {
      try {
        ws.send(message);
      } catch {
        /* socket closing; the runtime cleans it up */
      }
    }
  }

  /** Records `version` (never moving backwards) and pushes it to every socket. */
  async publishCatalog(version: number): Promise<void> {
    if (!Number.isInteger(version) || version <= (await this.version())) return;
    await this.ctx.storage.put(VERSION_KEY, version);
    this.broadcast(JSON.stringify({ type: 'catalog', version }));
  }

  async publishLeads(): Promise<void> {
    this.broadcast(JSON.stringify({ type: 'leads' }), 'admin');
  }
}

const hub = (env: Env) => env.LIVE.get(env.LIVE.idFromName(HUB_NAME));

/** Best effort: clients also revalidate on reconnect and on focus, so a lost notification heals. */
export async function notifyCatalog(env: Env, version: number): Promise<void> {
  try {
    await hub(env).publishCatalog(version);
  } catch (error) {
    console.error(JSON.stringify({ event: 'live.notify_failed', kind: 'catalog', error: String(error) }));
  }
}

export async function notifyLeads(env: Env): Promise<void> {
  try {
    await hub(env).publishLeads();
  } catch (error) {
    console.error(JSON.stringify({ event: 'live.notify_failed', kind: 'leads', error: String(error) }));
  }
}

/** GET /api/live — WebSocket upgrade, same-origin only; admin sockets are tagged server-side. */
export async function handleLive(ctx: Context): Promise<Response> {
  if (ctx.request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError('bad_request', 'Use WebSocket.');
  if (ctx.request.headers.get('Origin') !== ctx.url.origin) throw new HttpError('forbidden_origin');
  const admin = (await getSession(ctx)) != null;
  const network = ctx.env.PIN_PEPPER ? await ipKey(ctx.env.PIN_PEPPER, ctx.request) : 'unknown';
  // A fresh request: nothing the client sent (headers, cookies) reaches the hub except the upgrade.
  const forwarded = new Request(`https://hub.internal/live`, { headers: { Upgrade: 'websocket', 'X-Eka-Admin': admin ? '1' : '0', 'X-Eka-Net': network } });
  return hub(ctx.env).fetch(forwarded);
}
