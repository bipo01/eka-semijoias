import type { OrderItem, OrderRequest } from '../data/orders';
import { api } from './api';

export interface CreatedOrder {
  id: string;
  number: number;
  createdAt: string;
  items: OrderItem[];
  totalCents: number;
  pix: boolean;
}

/**
 * Registers the bag as an order. The Idempotency-Key makes retries (and a
 * double tap) return the same order instead of a second one.
 */
export async function createOrder(request: OrderRequest, idempotencyKey: string): Promise<CreatedOrder | null> {
  const result = await api<{ order: CreatedOrder | null }>('/api/orders', {
    json: request,
    headers: { 'Idempotency-Key': idempotencyKey },
    retries: 2,
    timeoutMs: 15_000,
  });
  return result.order;
}
