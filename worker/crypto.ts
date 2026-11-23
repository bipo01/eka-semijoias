/* Small Web Crypto helpers (work in workerd and Node 20+). */

const encoder = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** 256-bit random token, base64url (43 chars). */
export const randomToken = () => base64url(randomBytes(32));

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, key);
  }
  return key;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message)));
}

/** Constant-time string comparison (length is not secret here: both sides are fixed-length digests). */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/*
 * Base64 for storing files in D1. The D1 binding ships BLOBs as JSON arrays of numbers, which costs
 * ~45 ms of CPU for a 600 KB file (Free plan budget: 10 ms); a base64 string travels as one block.
 * Uses the native Uint8Array base64 methods when the runtime has them.
 */
type NativeBase64 = { toBase64?: (this: Uint8Array) => string };
type NativeFromBase64 = { fromBase64?: (s: string) => Uint8Array };

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (Uint8Array.prototype as unknown as NativeBase64).toBase64;
  if (native) return native.call(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const native = (Uint8Array as unknown as NativeFromBase64).fromBase64;
  if (native) return native(text);
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
