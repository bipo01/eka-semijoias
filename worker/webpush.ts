/*
 * Web Push without libraries: message encryption (RFC 8291, "aes128gcm"
 * content coding of RFC 8188) and the VAPID authorization (RFC 8292, ES256
 * JWT). Pure Web Crypto, so it runs in workerd and in Node for the unit tests
 * (which check it against the RFC 8291 example).
 */

const encoder = new TextEncoder();

export function b64urlToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF with a single output block (every length used here is ≤ 32 bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** An uncompressed P-256 point (65 bytes: 0x04 || x || y) as JWK coordinates. */
function pointToJwk(point: Uint8Array): { x: string; y: string } {
  if (point.length !== 65 || point[0] !== 4) throw new Error('invalid P-256 public key');
  return { x: bytesToB64url(point.slice(1, 33)), y: bytesToB64url(point.slice(33)) };
}

export interface SenderKeys {
  privateKey: CryptoKey;
  publicRaw: Uint8Array;
}

/** A fresh ECDH key pair for one message (RFC 8291 requires a new one per message). */
export async function ephemeralKeys(): Promise<SenderKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicRaw: new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer) };
}

/** Imports fixed sender keys (tests: the RFC example). */
export async function senderKeysFrom(privateB64: string, publicB64: string): Promise<SenderKeys> {
  const publicRaw = b64urlToBytes(publicB64);
  const privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: privateB64, ...pointToJwk(publicRaw), ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { privateKey, publicRaw };
}

export const RECORD_SIZE = 4096;

/**
 * Encrypts one push message for a subscription (keys from PushSubscription.getKey('p256dh'/'auth')).
 * Returns the request body: header (salt, record size, sender key) followed by a single record.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
  opts: { sender?: SenderKeys; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  if (plaintext.length > RECORD_SIZE - 17 - 86) throw new Error('push payload too large');
  const sender = opts.sender ?? (await ephemeralKeys());
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', ...pointToJwk(uaPublic), ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // `public` is the standard member; workers-types spells it `$public` (a reserved word in its generator).
  const ecdh = { name: 'ECDH', public: uaKey, $public: uaKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0];
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, sender.privateKey, 256));
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, sender.publicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + sender.publicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = sender.publicRaw.length;
  header.set(sender.publicRaw, 21);
  return concat(header, record);
}

/** The VAPID key pair as stored in the secret: a JWK of an ECDSA P-256 private key (with x and y). */
export interface VapidJwk {
  kty: 'EC';
  crv: 'P-256';
  d: string;
  x: string;
  y: string;
}

export function parseVapidJwk(secret: string | undefined): VapidJwk | null {
  if (!secret) return null;
  try {
    const jwk = JSON.parse(secret) as Partial<VapidJwk>;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) return null;
    return { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y };
  } catch {
    return null;
  }
}

/** The application server key the browser subscribes with (uncompressed point, base64url). */
export const vapidPublicKey = (jwk: VapidJwk) => bytesToB64url(concat(new Uint8Array([4]), b64urlToBytes(jwk.x), b64urlToBytes(jwk.y)));

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin. */
export async function vapidAuthorization(jwk: VapidJwk, audience: string, subject: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(encoder.encode(JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // Web Crypto returns the raw r || s signature, which is what JWS ES256 expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${bytesToB64url(signature)}, k=${vapidPublicKey(jwk)}`;
}

/** Push services browsers use; subscriptions to anything else are refused (no arbitrary outbound requests). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9.-]*push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^[a-z0-9.-]+\.push\.apple\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
}
