import { ApiError, NetworkError, request } from './client';
import {
  failPendingSale,
  listPendingSales,
  removePendingSale,
} from './offlineStore';
import type { Sale } from '../components/operations/shared';

export async function syncPendingSales(companyId: string): Promise<void> {
  if (!navigator.onLine) return;

  const pendingSales = await listPendingSales<Sale>(companyId);
  for (const pending of pendingSales) {
    if (pending.status !== 'pending') continue;
    try {
      await request<Sale>('/sales', {
        method: 'POST',
        companyId,
        headers: { 'Idempotency-Key': pending.idempotencyKey },
        body: pending.payload,
      });
      await removePendingSale(companyId, pending.idempotencyKey);
    } catch (reason) {
      if (reason instanceof NetworkError) return;
      if (reason instanceof ApiError && (reason.status === 401 || reason.status >= 500)) return;
      if (reason instanceof ApiError) {
        await failPendingSale(companyId, pending.idempotencyKey, reason.message);
        continue;
      }
      throw reason;
    }
  }
}
