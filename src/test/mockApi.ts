import { vi } from 'vitest';
import { applyChanges, type Change } from '../data/changes';
import { checkIntegrity } from '../data/integrity';
import type { Catalog, ResellerLead } from '../data/schema';
import { createCatalogSeed } from '../data/seed';

/*
 * In-memory stand-in for the Worker API, installed as `fetch` in unit tests.
 * Mirrors the real contract closely enough for UI flows (sessions, change
 * sets, photos, leads); the real server is covered by worker/test/integration.
 */

export const TEST_PIN = '314159';

interface MockState {
  catalog: Catalog;
  version: number;
  authenticated: boolean;
  pinLength: number;
  leads: ResellerLead[];
  media: Set<string>;
  /** Forces the next change set to fail with this status/code. */
  failNext: { status: number; code: string; message: string } | null;
  /** Simulates another device writing right before the next change set (applied to the server catalog). */
  interleaveNext: ((catalog: Catalog) => Catalog) | null;
  requests: { method: string; path: string; body: unknown }[];
}

export const mockServer: MockState = {
  catalog: createCatalogSeed(),
  version: 1,
  authenticated: false,
  pinLength: 6,
  leads: [],
  media: new Set(),
  failNext: null,
  interleaveNext: null,
  requests: [],
};

export function resetMockServer(): void {
  Object.assign(mockServer, {
    catalog: createCatalogSeed(),
    version: 1,
    authenticated: false,
    pinLength: 6,
    leads: [],
    media: new Set(),
    failNext: null,
    interleaveNext: null,
    requests: [],
  });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const error = (status: number, code: string, message: string, details?: unknown) => json({ error: { code, message, ...(details ? { details } : {}) } }, status);

async function bodyOf(init?: RequestInit): Promise<unknown> {
  if (init?.body == null) return undefined;
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body);
    } catch {
      return init.body;
    }
  }
  return init.body;
}

async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = url.pathname;
  const body = await bodyOf(init);
  mockServer.requests.push({ method, path, body });
  const s = mockServer;

  if (method === 'GET' && (path === '/api/catalog' || path.startsWith('/api/catalog/v/'))) return json({ ...s.catalog, version: s.version });
  if (path === '/api/admin/session') return json({ authenticated: s.authenticated, pinLength: s.pinLength });
  if (path === '/api/admin/login') {
    if ((body as { pin?: string }).pin !== TEST_PIN) return error(401, 'invalid_pin', 'PIN incorreto. Tente de novo.', { attemptsLeft: 4 });
    s.authenticated = true;
    return json({ authenticated: true, pinLength: s.pinLength });
  }
  if (path === '/api/leads' && method === 'POST') {
    const form = body as Record<string, unknown>;
    s.leads.unshift({ id: `lead_${s.leads.length + 1}`, name: String(form.name), whatsapp: String(form.whatsapp).replace(/\D/g, ''), city: String(form.city), uf: String(form.uf), alreadySells: !!form.alreadySells, createdAt: new Date().toISOString() });
    return json({ ok: true }, 201);
  }
  if (!s.authenticated) return error(401, 'unauthenticated', 'Sua sessão terminou. Entre de novo com o PIN.');
  if (path === '/api/admin/logout') {
    s.authenticated = false;
    return json({ authenticated: false });
  }
  if (path === '/api/admin/changes') {
    if (s.failNext) {
      const f = s.failNext;
      s.failNext = null;
      return error(f.status, f.code, f.message);
    }
    if (s.interleaveNext) {
      s.catalog = s.interleaveNext(s.catalog);
      s.version += 1;
      s.interleaveNext = null;
    }
    const { changes } = body as { baseVersion: number; changes: Change[] };
    const next = applyChanges(s.catalog, changes);
    const problem = checkIntegrity(next);
    if (problem) return error(422, 'integrity', problem);
    const from = s.version;
    s.catalog = next;
    s.version += 1;
    return json({ version: s.version, from, applied: changes.length });
  }
  if (path === '/api/admin/media') {
    const key = `media/${String(s.media.size + 1).padStart(64, '0')}.webp`;
    s.media.add(key);
    return json({ key }, 201);
  }
  if (path === '/api/admin/leads' && method === 'GET') return json({ leads: s.leads });
  if (path.startsWith('/api/admin/leads/') && method === 'DELETE') {
    const id = decodeURIComponent(path.split('/').pop()!);
    const before = s.leads.length;
    s.leads = s.leads.filter((l) => l.id !== id);
    return json({ deleted: s.leads.length < before });
  }
  if (path === '/api/admin/backup') return json({ ...s.catalog, leads: s.leads });
  if (path === '/api/admin/pin') {
    const { currentPin, newPin } = body as { currentPin: string; newPin: string };
    if (currentPin !== TEST_PIN) return error(401, 'invalid_pin', 'O PIN atual está incorreto.');
    s.pinLength = newPin.length;
    return json({ ok: true, pinLength: newPin.length });
  }
  return error(404, 'not_found', 'Não encontrado.');
}

/** Installs the mock as global fetch (call in beforeEach). */
export function installMockApi(): void {
  vi.stubGlobal('fetch', vi.fn(handle));
}
