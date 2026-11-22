export interface PendingSale<T> {
  idempotencyKey: string;
  companyId: string;
  payload: unknown;
  preview: T;
  createdAt: string;
  status: 'pending' | 'failed';
  error: string | null;
}

interface CachedResponse {
  key: string;
  value: unknown;
  cachedAt: string;
}

const DATABASE_NAME = 'agatha-erp-offline';
const DATABASE_VERSION = 1;
const RESPONSE_STORE = 'responses';
const PENDING_SALE_STORE = 'pending-sales';
const CHANGE_EVENT = 'agatha:offline-change';
const SESSION_PROFILE_KEY = 'agatha-session-profile';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Este ambiente não suporta armazenamento offline.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RESPONSE_STORE)) {
          database.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(PENDING_SALE_STORE)) {
          const store = database.createObjectStore(PENDING_SALE_STORE, { keyPath: 'idempotencyKey' });
          store.createIndex('companyId', 'companyId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento offline.'));
      request.onblocked = () => reject(new Error('O armazenamento offline está ocupado noutra janela.'));
    });
  }
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao ler o armazenamento offline.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao gravar no armazenamento offline.'));
    transaction.onabort = () => reject(transaction.error || new Error('A gravação offline foi cancelada.'));
  });
}

function responseKey(companyId: string, path: string): string {
  return `${companyId}:${path}`;
}

function notifyOfflineChange(companyId: string): void {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { companyId } }));
}

export async function cacheResponse(companyId: string, path: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(RESPONSE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(RESPONSE_STORE).put({
    key: responseKey(companyId, path),
    value,
    cachedAt: new Date().toISOString(),
  } satisfies CachedResponse);
  await done;
}

export async function readCachedResponse<T>(companyId: string, path: string): Promise<T | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(RESPONSE_STORE, 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(RESPONSE_STORE).get(responseKey(companyId, path))) as CachedResponse | undefined;
  await done;
  return record?.value as T | undefined;
}

export async function queuePendingSale<T>(sale: PendingSale<T>): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PENDING_SALE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(PENDING_SALE_STORE).put(sale);
  await done;
  notifyOfflineChange(sale.companyId);
}

export async function listPendingSales<T>(companyId: string): Promise<PendingSale<T>[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PENDING_SALE_STORE, 'readonly');
  const done = transactionDone(transaction);
  const records = await requestResult(
    transaction.objectStore(PENDING_SALE_STORE).index('companyId').getAll(companyId),
  ) as PendingSale<T>[];
  await done;
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removePendingSale(companyId: string, idempotencyKey: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PENDING_SALE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(PENDING_SALE_STORE).delete(idempotencyKey);
  await done;
  notifyOfflineChange(companyId);
}

export async function failPendingSale(
  companyId: string,
  idempotencyKey: string,
  error: string,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PENDING_SALE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(PENDING_SALE_STORE);
  const record = await requestResult(store.get(idempotencyKey)) as PendingSale<unknown> | undefined;
  if (record) {
    store.put({ ...record, status: 'failed', error });
  }
  await done;
  notifyOfflineChange(companyId);
}

export async function retryPendingSale(companyId: string, idempotencyKey: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PENDING_SALE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(PENDING_SALE_STORE);
  const record = await requestResult(store.get(idempotencyKey)) as PendingSale<unknown> | undefined;
  if (record) {
    store.put({ ...record, status: 'pending', error: null });
  }
  await done;
  notifyOfflineChange(companyId);
}

export function listenOfflineChanges(handler: (companyId: string) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ companyId: string }>).detail;
    handler(detail.companyId);
  };
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export async function cacheSessionProfile<T>(profile: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(RESPONSE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(RESPONSE_STORE).put({
    key: SESSION_PROFILE_KEY,
    value: profile,
    cachedAt: new Date().toISOString(),
  } satisfies CachedResponse);
  await done;
}

export async function readCachedSessionProfile<T>(): Promise<T | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(RESPONSE_STORE, 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult(
    transaction.objectStore(RESPONSE_STORE).get(SESSION_PROFILE_KEY),
  ) as CachedResponse | undefined;
  await done;
  return record?.value as T | undefined;
}
