import { z } from 'zod';
import { PIN_MIN, pinProblem } from '../src/lib/pin';
import { hmacHex, randomToken, safeEqual, sha256Hex, toHex, randomBytes } from './crypto';
import { withReadRetry } from './db';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import type { Context } from './router';

/*
 * Admin authentication: a 6–8 digit PIN verified only on the server.
 * - Stored as HMAC-SHA256(PIN_PEPPER, salt:pin). The pepper is a Worker secret,
 *   so the database alone cannot be used to brute-force the small PIN space.
 * - Until a PIN is stored, only the ADMIN_INITIAL_PIN secret is accepted
 *   (there is no public default PIN).
 * - Failed attempts are throttled per IP (escalating lockout) and globally.
 * - Sessions: random 256-bit token in an HttpOnly, Secure, SameSite=Strict
 *   cookie; only its SHA-256 is stored.
 */

export { pinProblem };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_ABSOLUTE_MS = 30 * DAY;
export const SESSION_IDLE_MS = 14 * DAY;
const SESSION_TOUCH_MS = HOUR;

export const IP_WINDOW_MS = 15 * MINUTE;
export const IP_MAX_FAILURES = 5;
export const IP_BASE_LOCK_MS = 15 * MINUTE;
export const IP_MAX_LOCK_MS = DAY;
export const GLOBAL_WINDOW_MS = HOUR;
export const GLOBAL_MAX_FAILURES = 50;
/** A known device skips the global cap but has its own budget, so a copied device cookie is no master key. */
export const DEVICE_WINDOW_MS = HOUR;
export const DEVICE_MAX_ATTEMPTS = 10;
/** Wrong "current PIN" answers allowed per session (per hour) before the session is ended. */
export const PIN_CHANGE_MAX_FAILURES = 3;
const THROTTLE_RETENTION_MS = 2 * DAY;

export const hashPin = (pepper: string, salt: string, pin: string) => hmacHex(pepper, `pin:${salt}:${pin}`);

/**
 * Network identity used for throttling: the full IPv4 address, or the /64
 * prefix of an IPv6 address (one subscriber usually owns a whole /64).
 */
export function networkOf(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!; // IPv4-mapped IPv6 is an IPv4 client
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** Stable, non-reversible key for the client network (the raw IP is never stored). */
export async function ipKey(pepper: string, request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  return (await hmacHex(pepper, `ip:${networkOf(ip)}`)).slice(0, 32);
}

// ---------------------------------------------------------------------------
// Throttle (fixed windows in D1)
// ---------------------------------------------------------------------------

interface ThrottleRow {
  count: number;
  window_start: number;
  locked_until: number;
  strikes: number;
}

export function hitStatement(db: D1Database, key: string, windowMs: number, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO throttle (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN throttle.window_start <= ?3 THEN 1 ELSE throttle.count + 1 END,
         window_start = CASE WHEN throttle.window_start <= ?3 THEN ?2 ELSE throttle.window_start END
       RETURNING count, window_start, locked_until, strikes`,
    )
    .bind(key, now, now - windowMs);
}

/** Atomically counts one event in `key`'s window and returns the updated row. */
export async function hit(db: D1Database, key: string, windowMs: number, now: number): Promise<ThrottleRow> {
  const row = await hitStatement(db, key, windowMs, now).first<ThrottleRow>();
  if (!row) throw new Error('throttle upsert returned no row');
  return row;
}

export function retryAfter(lockedUntil: number, now: number, message = 'Muitas tentativas erradas.'): HttpError {
  const seconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  const minutes = Math.ceil(seconds / 60);
  const wait = minutes >= 60 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`;
  return new HttpError('rate_limited', `${message} Tente de novo em ${wait}.`, { retryAfter: seconds }, { 'Retry-After': String(seconds) });
}

/** Old counters are dropped as new attempts arrive (keeps the table small). */
export function pruneThrottle(db: D1Database, now: number): D1PreparedStatement {
  return db.prepare('DELETE FROM throttle WHERE window_start < ?1 AND locked_until < ?2').bind(now - THROTTLE_RETENTION_MS, now);
}

/**
 * Counts a PIN attempt BEFORE the PIN is checked, so parallel guesses cannot
 * slip past the limit.
 * - Per network: IP_MAX_FAILURES attempts per window, then an escalating lock
 *   (15 min, 30 min, … up to 24 h). A successful login resets it.
 * - Globally: a cap per hour that stops distributed guessing.
 * - A device that logged in before (signed device cookie, invalidated by a PIN
 *   change) skips the global cap, so an attack cannot lock the owner out, but
 *   it has its own hourly budget.
 * Returns the attempts left for this network.
 */
async function countAttempt(db: D1Database, ip: string, deviceId: string | null, now: number): Promise<number> {
  const ipKeyName = `login:ip:${ip}`;
  const sharedKey = deviceId ? `login:device:${deviceId}` : 'login:global';
  const sharedWindow = deviceId ? DEVICE_WINDOW_MS : GLOBAL_WINDOW_MS;
  const sharedMax = deviceId ? DEVICE_MAX_ATTEMPTS : GLOBAL_MAX_FAILURES;
  const results = await db.batch<ThrottleRow>([hitStatement(db, ipKeyName, IP_WINDOW_MS, now), hitStatement(db, sharedKey, sharedWindow, now), pruneThrottle(db, now)]);
  const ipRow = results[0]?.results[0];
  const sharedRow = results[1]?.results[0];
  if (!ipRow || !sharedRow) throw new Error('throttle upsert returned no row');

  if (ipRow.locked_until > now) throw retryAfter(ipRow.locked_until, now);
  if (sharedRow.locked_until > now) throw retryAfter(sharedRow.locked_until, now);
  if (ipRow.count > IP_MAX_FAILURES) {
    const until = now + Math.min(IP_BASE_LOCK_MS * 2 ** ipRow.strikes, IP_MAX_LOCK_MS);
    await db.prepare('UPDATE throttle SET locked_until = ?2, strikes = strikes + 1, count = 0, window_start = ?3 WHERE key = ?1').bind(ipKeyName, until, now).run();
    throw retryAfter(until, now);
  }
  if (sharedRow.count > sharedMax) {
    const until = sharedRow.window_start + sharedWindow;
    await db.prepare('UPDATE throttle SET locked_until = ?2 WHERE key = ?1').bind(sharedKey, until).run();
    throw retryAfter(until, now);
  }
  return IP_MAX_FAILURES - ipRow.count;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

interface CredentialsRow {
  pin_hash: string;
  salt: string;
  pin_length: number;
  updated_at: string;
}

function requirePepper(env: Env): string {
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new HttpError('not_configured');
  return env.PIN_PEPPER;
}

async function readCredentials(db: D1Database): Promise<CredentialsRow | null> {
  return withReadRetry(() => db.prepare('SELECT pin_hash, salt, pin_length, updated_at FROM admin_credentials WHERE id = 1').first<CredentialsRow>());
}

/** Length of the PIN the keypad should expect (the stored one, or the initial secret's). */
function pinLength(env: Env, credentials: CredentialsRow | null): number {
  return credentials?.pin_length ?? env.ADMIN_INITIAL_PIN?.length ?? PIN_MIN;
}

async function pinMatches(env: Env, pepper: string, credentials: CredentialsRow | null, pin: string): Promise<boolean> {
  if (credentials) return safeEqual(await hashPin(pepper, credentials.salt, pin), credentials.pin_hash);
  const initial = env.ADMIN_INITIAL_PIN;
  if (!initial || pinProblem(initial)) throw new HttpError('not_configured');
  // Compare digests, not the raw strings, so timing does not depend on where they differ.
  return safeEqual(await hashPin(pepper, 'initial', pin), await hashPin(pepper, 'initial', initial));
}

function credentialsStatement(db: D1Database, pinHash: string, salt: string, length: number, updatedAt: string, mode: 'insert' | 'upsert'): D1PreparedStatement {
  const sql =
    mode === 'insert'
      ? 'INSERT OR IGNORE INTO admin_credentials (id, pin_hash, salt, pin_length, updated_at) VALUES (1, ?1, ?2, ?3, ?4)'
      : `INSERT INTO admin_credentials (id, pin_hash, salt, pin_length, updated_at) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT (id) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt, pin_length = excluded.pin_length, updated_at = excluded.updated_at`;
  return db.prepare(sql).bind(pinHash, salt, length, updatedAt);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function cookieName(env: Env): string {
  return env.DEV_INSECURE_COOKIES === '1' ? 'eka_admin' : '__Host-eka_admin';
}

function sessionCookie(env: Env, token: string, maxAgeSeconds: number): string {
  const secure = env.DEV_INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

const DEVICE_MAX_AGE_S = 365 * 24 * 60 * 60;

function deviceCookieName(env: Env): string {
  return env.DEV_INSECURE_COOKIES === '1' ? 'eka_device' : '__Host-eka_device';
}

/**
 * Signed marker of a device that has logged in before. The signature covers the
 * PIN's `updated_at`, so changing the PIN invalidates every device cookie.
 */
async function deviceCookie(env: Env, pepper: string, stamp: string, id = randomToken().slice(0, 22)): Promise<string> {
  const sig = (await hmacHex(pepper, `device:${id}:${stamp}`)).slice(0, 32);
  const secure = env.DEV_INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `${deviceCookieName(env)}=${id}.${sig}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DEVICE_MAX_AGE_S}${secure}`;
}

/** The id of this request's valid device cookie, or null. */
async function knownDeviceId(ctx: Context, pepper: string, stamp: string): Promise<string | null> {
  const value = readCookie(ctx.request, deviceCookieName(ctx.env));
  const match = value?.match(/^([A-Za-z0-9_-]{22})\.([a-f0-9]{32})$/);
  if (!match) return null;
  return safeEqual((await hmacHex(pepper, `device:${match[1]}:${stamp}`)).slice(0, 32), match[2]!) ? match[1]! : null;
}

const credentialsStamp = (credentials: CredentialsRow | null) => credentials?.updated_at ?? 'initial';

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export interface Session {
  tokenHash: string;
}

/** Returns the valid admin session of this request, or null. Touches `last_seen_at` at most hourly. */
export async function getSession(ctx: Context): Promise<Session | null> {
  const token = readCookie(ctx.request, cookieName(ctx.env));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await withReadRetry(() =>
    ctx.env.DB.prepare('SELECT last_seen_at FROM admin_sessions WHERE token_hash = ?1 AND expires_at > ?2 AND last_seen_at > ?3')
      .bind(tokenHash, now, now - SESSION_IDLE_MS)
      .first<{ last_seen_at: number }>(),
  );
  if (!row) return null;
  if (now - row.last_seen_at > SESSION_TOUCH_MS) {
    ctx.waitUntil(ctx.env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ?2 WHERE token_hash = ?1').bind(tokenHash, now).run().catch(() => undefined));
  }
  return { tokenHash };
}

export async function requireSession(ctx: Context): Promise<Session> {
  const session = await getSession(ctx);
  if (!session) throw new HttpError('unauthenticated');
  return session;
}

async function newSessionStatements(db: D1Database, now: number): Promise<{ token: string; statements: D1PreparedStatement[] }> {
  const token = randomToken();
  return {
    token,
    statements: [
      db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at, last_seen_at) VALUES (?1, ?2, ?3, ?2)').bind(await sha256Hex(token), now, now + SESSION_ABSOLUTE_MS),
      db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?1 OR last_seen_at <= ?2').bind(now, now - SESSION_IDLE_MS),
    ],
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const loginSchema = z.object({ pin: z.string().regex(/^\d{4,8}$/) });
const changePinSchema = z.object({ currentPin: z.string().regex(/^\d{4,8}$/), newPin: z.string() });

/** GET /api/admin/session */
export async function handleSessionStatus(ctx: Context): Promise<Response> {
  const [session, credentials] = await Promise.all([getSession(ctx), readCredentials(ctx.env.DB)]);
  return json({ authenticated: session != null, pinLength: pinLength(ctx.env, credentials) });
}

/** POST /api/admin/login { pin } */
export async function handleLogin(ctx: Context): Promise<Response> {
  const { env } = ctx;
  const pepper = requirePepper(env);
  const parsed = loginSchema.safeParse(await readJson(ctx.request, 1024));
  if (!parsed.success) throw new HttpError('bad_request', 'Digite o PIN com números.');
  const now = Date.now();
  const ip = await ipKey(pepper, ctx.request);
  const credentials = await readCredentials(env.DB);
  const deviceId = await knownDeviceId(ctx, pepper, credentialsStamp(credentials));
  const left = await countAttempt(env.DB, ip, deviceId, now);

  if (!(await pinMatches(env, pepper, credentials, parsed.data.pin))) {
    throw new HttpError('invalid_pin', left > 0 ? undefined : 'PIN incorreto. Esta foi a última tentativa antes de uma pausa.', { attemptsLeft: left });
  }

  const { token, statements } = await newSessionStatements(env.DB, now);
  // A successful login resets this network's and this device's counters.
  const batch = [...statements, env.DB.prepare('DELETE FROM throttle WHERE key IN (?1, ?2)').bind(`login:ip:${ip}`, `login:device:${deviceId ?? '-'}`)];
  let stamp = credentialsStamp(credentials);
  if (!credentials) {
    // First login with the initial PIN: store it so the secret stops mattering.
    const salt = toHex(randomBytes(16));
    stamp = new Date(now).toISOString();
    batch.push(credentialsStatement(env.DB, await hashPin(pepper, salt, parsed.data.pin), salt, parsed.data.pin.length, stamp, 'insert'));
  }
  await env.DB.batch(batch);
  const headers = new Headers({ 'Set-Cookie': sessionCookie(env, token, SESSION_ABSOLUTE_MS / 1000) });
  if (!deviceId || !credentials) headers.append('Set-Cookie', await deviceCookie(env, pepper, stamp));
  return json({ authenticated: true, pinLength: pinLength(env, credentials) }, { headers });
}

/** POST /api/admin/logout */
export async function handleLogout(ctx: Context): Promise<Response> {
  const session = await getSession(ctx);
  if (session) await ctx.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?1').bind(session.tokenHash).run();
  return json({ authenticated: false }, { headers: { 'Set-Cookie': sessionCookie(ctx.env, '', 0) } });
}

/**
 * POST /api/admin/pin { currentPin, newPin }. Ends every session (this one is
 * replaced by a fresh token) and invalidates every device cookie. A session
 * that answers the current PIN wrong PIN_CHANGE_MAX_FAILURES times is ended,
 * so a stolen session cannot be used to brute-force the PIN.
 */
export async function handleChangePin(ctx: Context): Promise<Response> {
  const { env } = ctx;
  const session = await requireSession(ctx);
  const pepper = requirePepper(env);
  const parsed = changePinSchema.safeParse(await readJson(ctx.request, 1024));
  if (!parsed.success) throw new HttpError('bad_request', 'Digite o PIN atual e o novo PIN com números.');
  const problem = pinProblem(parsed.data.newPin);
  if (problem) throw new HttpError('bad_request', problem, [{ path: 'newPin', message: problem }]);

  const now = Date.now();
  const ip = await ipKey(pepper, ctx.request);
  const credentials = await readCredentials(env.DB);
  const deviceId = await knownDeviceId(ctx, pepper, credentialsStamp(credentials));
  // Every attempt counts (a success clears the counter), so `count` = wrong answers so far + this one.
  const left = await countAttempt(env.DB, ip, deviceId, now); // a rate-limited try never reaches the session counter
  const sessionAttempts = await hit(env.DB, `pinchange:${session.tokenHash}`, HOUR, now);
  if (!(await pinMatches(env, pepper, credentials, parsed.data.currentPin))) {
    if (sessionAttempts.count >= PIN_CHANGE_MAX_FAILURES) {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?1').bind(session.tokenHash).run();
      throw new HttpError('unauthenticated', 'Por segurança, a sessão foi encerrada depois de várias tentativas erradas. Entre de novo com o PIN.');
    }
    throw new HttpError('invalid_pin', 'O PIN atual está incorreto.', { attemptsLeft: Math.min(left, PIN_CHANGE_MAX_FAILURES - sessionAttempts.count), path: 'currentPin' });
  }
  const salt = toHex(randomBytes(16));
  const stamp = new Date(now).toISOString();
  const { token, statements } = await newSessionStatements(env.DB, now);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM throttle WHERE key IN (?1, ?2, ?3)').bind(`login:ip:${ip}`, `pinchange:${session.tokenHash}`, `login:device:${deviceId ?? '-'}`),
    credentialsStatement(env.DB, await hashPin(pepper, salt, parsed.data.newPin), salt, parsed.data.newPin.length, stamp, 'upsert'),
    env.DB.prepare('DELETE FROM admin_sessions'),
    ...statements,
    env.DB.prepare('INSERT INTO audit_log (at, action, summary) VALUES (?1, ?2, ?3)').bind(stamp, 'pin.change', 'PIN alterado; sessões e aparelhos anteriores encerrados'),
  ]);
  const headers = new Headers({ 'Set-Cookie': sessionCookie(env, token, SESSION_ABSOLUTE_MS / 1000) });
  headers.append('Set-Cookie', await deviceCookie(env, pepper, stamp, deviceId ?? undefined));
  return json({ ok: true, pinLength: parsed.data.newPin.length }, { headers });
}
