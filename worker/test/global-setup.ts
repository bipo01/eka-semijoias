import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * Starts a real local Worker (workerd + local D1 + Durable Object) on a fresh,
 * temporary database for the integration suite. INTEGRATION_URL skips this
 * and targets an already running server instead.
 */

let child: ChildProcess | undefined;
/** Shared with api.test.ts (signs the simulated Mercado Pago notifications). */
export const MP_WEBHOOK_SECRET = 'integration-webhook-secret';
let dir: string | undefined;

export async function setup(): Promise<void> {
  if (process.env.INTEGRATION_URL) return;
  const port = 8800 + Math.floor(Math.random() * 100);
  dir = mkdtempSync(join(tmpdir(), 'eka-worker-'));
  const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', dir], { encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (migrate.status !== 0) throw new Error(`migrations failed: ${migrate.stderr || migrate.stdout}`);
  // Local-only secrets passed explicitly, so the suite does not depend on a .dev.vars file (CI has none).
  // Web Push and Mercado Pago point at a mock server the test file starts on MOCK_PORT.
  const mockPort = 9100 + Math.floor(Math.random() * 200);
  const vapid = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const { kty, crv, d, x, y } = (await crypto.subtle.exportKey('jwk', vapid.privateKey)) as JsonWebKey;
  const vars = [
    'PIN_PEPPER:integration-pepper-0123456789abcdef0123456789abcdef',
    'ADMIN_INITIAL_PIN:314159',
    'DEV_INSECURE_COOKIES:1',
    `VAPID_PRIVATE_KEY:${JSON.stringify({ kty, crv, d, x, y })}`,
    'MP_ACCESS_TOKEN:TEST-integration-token',
    `MP_WEBHOOK_SECRET:${MP_WEBHOOK_SECRET}`,
    `MP_API_BASE:http://127.0.0.1:${mockPort}`,
    `DEV_PUSH_ORIGIN:http://127.0.0.1:${mockPort}`,
  ].flatMap((v) => ['--var', v]);
  process.env.MOCK_PORT = String(mockPort);
  child = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', dir, '--log-level', 'warn', ...vars], {
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`wrangler dev did not start:\n${output}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  process.env.INTEGRATION_URL = url;
}

export async function teardown(): Promise<void> {
  child?.kill('SIGTERM');
  if (dir) rmSync(dir, { recursive: true, force: true });
}
