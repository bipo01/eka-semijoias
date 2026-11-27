import type { LiveHub } from './live';

export interface Env {
  DB: D1Database;
  LIVE: DurableObjectNamespace<LiveHub>;
  /** Optional: uploaded photos go to R2 when bound, otherwise to the D1 `media.bytes` column. */
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  /** Secret. Keys the PIN hash and the IP hashes. Required for admin login. */
  PIN_PEPPER?: string;
  /** Secret. Accepted only until a PIN is stored (first login), then irrelevant. */
  ADMIN_INITIAL_PIN?: string;
  /** Secret (optional). VAPID key for Web Push: JWK of an ECDSA P-256 private key. Without it, no phone notices. */
  VAPID_PRIVATE_KEY?: string;
  /** Tests only: how long (ms) receipt files are kept after the payment; production uses RECEIPT_KEEP_DAYS. */
  DEV_RECEIPT_KEEP_MS?: string;
  /** Tests only: an extra origin accepted as a push service (a local mock). Never set in production. */
  DEV_PUSH_ORIGIN?: string;
  /** "1" in local development only: plain cookie name without Secure (plain-HTTP test browsers). */
  DEV_INSECURE_COOKIES?: string;
}
