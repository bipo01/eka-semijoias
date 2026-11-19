export const ADMIN_BASE = '/admin';

export const adminPath = (...segments: string[]) => [ADMIN_BASE, ...segments].join('/');
