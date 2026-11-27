import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { E2E_PIN } from '../playwright.config';

/**
 * One admin login for the whole run, saved as a storage state that specs can reuse
 * (`test.use({ storageState: ADMIN_STATE })`). The panel caps PIN attempts per hour for the
 * whole server (devices seen before are exempt): every spec typing the PIN again would
 * eventually lock the run out, as a real attacker would be.
 */
export const ADMIN_STATE = join(tmpdir(), 'eka-e2e', 'admin-state.json');

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:4173/';
  const origin = new URL(baseURL).origin;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { 'CF-Connecting-IP': '10.250.250.250', Origin: origin } });
  const res = await api.post('/api/admin/login', { data: { pin: E2E_PIN } });
  if (!res.ok()) throw new Error(`admin login for the e2e run failed: ${res.status()} ${await res.text()}`);
  // The store's Pix, saved once before any spec runs, with the exact values the payment spec types in
  // the panel (stored as below). Specs that set it again then change nothing, so no catalog version bump
  // lands in the middle of another spec's open editor ("atualizado em outro aparelho").
  const catalog = (await (await api.get('/api/catalog')).json()) as { version: number; settings: Record<string, unknown> };
  if (!catalog.settings.pix) {
    const pix = { key: '+5565999998888', name: 'EKA SEMIJOIAS', city: 'CUIABA' };
    const saved = await api.post('/api/admin/changes', { data: { baseVersion: catalog.version, changes: [{ kind: 'settings', op: 'upsert', data: { ...catalog.settings, pix } }] } });
    if (!saved.ok()) throw new Error(`saving the Pix for the e2e run failed: ${saved.status()} ${await saved.text()}`);
  }
  mkdirSync(join(tmpdir(), 'eka-e2e'), { recursive: true });
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
}
