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
  /** Secrets (optional, both required): Mercado Pago access token and webhook signing secret for the automatic Pix. */
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
  /** Tests only: Mercado Pago API base URL (a local mock). */
  MP_API_BASE?: string;
  /** Tests only: an extra origin accepted as a push service (a local mock). Never set in production. */
  DEV_PUSH_ORIGIN?: string;
  /** "1" in local development only: plain cookie name without Secure (plain-HTTP test browsers). */
  DEV_INSECURE_COOKIES?: string;
}
