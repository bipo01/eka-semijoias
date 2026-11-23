import type { Env } from './env';

export interface Context {
  request: Request;
  env: Env;
  url: URL;
  requestId: string;
  params: Record<string, string>;
  waitUntil(promise: Promise<unknown>): void;
}

export type Handler = (ctx: Context) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  name: string;
}

/** Minimal method + path router. `:name` segments become params. */
export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler, name: `${method} ${path}` });
    return this;
  }

  /** Finds the route for a request; `allowed` lists the methods when only the path matched. */
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string>; name: string } | { allowed: string[] } | null {
    const allowed: string[] = [];
    for (const route of this.routes) {
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) {
        allowed.push(route.method);
        continue;
      }
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1] ?? '')));
      return { handler: route.handler, params, name: route.name };
    }
    return allowed.length ? { allowed } : null;
  }
}
