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
  /** "1" in local development only: plain cookie name without Secure (plain-HTTP test browsers). */
  DEV_INSECURE_COOKIES?: string;
}
